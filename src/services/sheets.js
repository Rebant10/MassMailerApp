/**
 * Mass Mailer Mobile — Sheets & CSV Service
 * Handles Google Sheets API integration and local CSV (Apollo) parsing.
 */

import { extractSheetId, columnToLetter } from '../utils/mailerUtils';
import { oauthService } from './oauth';

export const sheetsService = {
  /**
   * Fetch spreadsheet metadata & tabs from Google Sheets API
   */
  async fetchMetadata(sheetUrlOrId, sender) {
    const sheetId = extractSheetId(sheetUrlOrId);
    if (!sheetId) throw new Error('Invalid Google Sheets URL or ID');

    const token = await oauthService.ensureValidToken(sender);
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Failed to fetch sheet: ${res.status}`);
    }

    const data = await res.json();
    const tabs = (data.sheets || []).map(s => ({
      id: s.properties.sheetId,
      name: s.properties.title
    }));

    return { sheetId, tabs };
  },

  /**
   * Fetch rows and headers from a specific tab in Google Sheets
   */
  async fetchTabRows(sheetId, tabName, sender) {
    const token = await oauthService.ensureValidToken(sender);
    const safeTab = tabName || 'Sheet1';

    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(safeTab)}`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Failed to read sheet tab: ${res.status}`);
    }

    const data = await res.json();
    const values = data.values || [];
    if (values.length < 2) {
      throw new Error('Sheet must contain a header row and at least one data row.');
    }

    const headers = values[0].map(h => String(h || '').trim());
    const rows = values.slice(1).map((row, idx) => {
      const obj = {};
      headers.forEach((h, i) => {
        const val = row[i] !== undefined && row[i] !== null ? String(row[i]).trim() : '';
        obj[h] = val;
      });
      obj._rowIndex = idx + 2; // 1-based, skipping header
      return obj;
    });

    return { headers, rows };
  },

  /**
   * Ensure Status, Sent At, and Sent From columns exist in row 1 of Google Sheet.
   * Returns their 1-based column indices.
   */
  async ensureStatusColumns(sheetId, tabName, headers = [], sender) {
    if (!sheetId) return null;
    try {
      const token = await oauthService.ensureValidToken(sender);
      const safeTab = tabName || 'Sheet1';

      // First fetch current header row directly from Google Sheets to be 100% accurate
      let remoteHeaders = [...headers];
      try {
        const headerRes = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(safeTab)}!1:1`,
          { headers: { 'Authorization': `Bearer ${token}` } }
        );
        if (headerRes.ok) {
          const headerData = await headerRes.json();
          if (headerData.values && headerData.values[0]) {
            remoteHeaders = headerData.values[0].map(h => String(h || '').trim());
          }
        }
      } catch (e) {
        // Fallback to memory headers
      }

      let statusCol = remoteHeaders.indexOf('Status');
      let sentAtCol = remoteHeaders.indexOf('Sent At');
      let sentFromCol = remoteHeaders.indexOf('Sent From');

      const toAdd = [];
      if (statusCol === -1) {
        statusCol = remoteHeaders.length + toAdd.length;
        toAdd.push('Status');
      }
      if (sentAtCol === -1) {
        sentAtCol = remoteHeaders.length + toAdd.length;
        toAdd.push('Sent At');
      }
      if (sentFromCol === -1) {
        sentFromCol = remoteHeaders.length + toAdd.length;
        toAdd.push('Sent From');
      }

      if (toAdd.length > 0) {
        const startLetter = columnToLetter(remoteHeaders.length + 1);
        const endLetter = columnToLetter(remoteHeaders.length + toAdd.length);
        const range = `${safeTab}!${startLetter}1:${endLetter}1`;

        await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
          {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ values: [toAdd] })
          }
        );
      }

      return {
        statusCol: statusCol + 1,
        sentAtCol: sentAtCol + 1,
        sentFromCol: sentFromCol + 1,
      };
    } catch (e) {
      console.warn('[Sheets] ensureStatusColumns error:', e.message);
      return {
        statusCol: (headers.indexOf('Status') >= 0 ? headers.indexOf('Status') + 1 : headers.length + 1),
        sentAtCol: (headers.indexOf('Sent At') >= 0 ? headers.indexOf('Sent At') + 1 : headers.length + 2),
        sentFromCol: (headers.indexOf('Sent From') >= 0 ? headers.indexOf('Sent From') + 1 : headers.length + 3),
      };
    }
  },

  /**
   * Write dispatch info (Status, Sent At, Sent From) to a specific row in Google Sheet.
   */
  async writeRowDispatch(sheetId, tabName, rowIndex, { status, sentAt, sentFrom }, colMap, sender) {
    if (!sheetId || !rowIndex || !colMap) return false;
    try {
      const token = await oauthService.ensureValidToken(sender);
      const safeTab = tabName || 'Sheet1';

      const dataUpdates = [];
      if (colMap.statusCol && status) {
        dataUpdates.push({
          range: `${safeTab}!${columnToLetter(colMap.statusCol)}${rowIndex}`,
          values: [[status]]
        });
      }
      if (colMap.sentAtCol && sentAt) {
        dataUpdates.push({
          range: `${safeTab}!${columnToLetter(colMap.sentAtCol)}${rowIndex}`,
          values: [[sentAt]]
        });
      }
      if (colMap.sentFromCol && sentFrom) {
        dataUpdates.push({
          range: `${safeTab}!${columnToLetter(colMap.sentFromCol)}${rowIndex}`,
          values: [[sentFrom]]
        });
      }

      if (dataUpdates.length === 0) return false;

      // Try batchUpdate first
      const res = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchUpdate`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            valueInputOption: 'RAW',
            data: dataUpdates
          })
        }
      );

      if (res.ok) {
        return true;
      }

      // Fallback: update individual cells if batchUpdate failed
      for (const update of dataUpdates) {
        await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(update.range)}?valueInputOption=RAW`,
          {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ values: update.values })
          }
        );
      }
      return true;
    } catch (e) {
      console.warn('[Sheets] writeRowDispatch error:', e.message);
      return false;
    }
  },

  /**
   * Update a cell in Google Sheets (e.g. Status, Sent At, Sent From)
   */
  async updateCell(sheetId, tabName, row, col, value, sender) {
    const token = await oauthService.ensureValidToken(sender);
    const colLetter = columnToLetter(col);
    const range = `${tabName}!${colLetter}${row}`;

    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ values: [[value]] })
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.warn(`Cell update failed (${range}):`, err.error?.message || res.status);
    }
  },

  /**
   * Parse local CSV string (e.g. exported from Apollo or Excel) into headers & rows
   */
  parseCsv(csvString) {
    if (!csvString) return { headers: [], rows: [] };

    // Standard RFC 4180 CSV parser handling quotes, commas, and newlines
    const rows = [];
    let currentRow = [];
    let currentCell = '';
    let inQuotes = false;

    for (let i = 0; i < csvString.length; i++) {
      const char = csvString[i];
      const nextChar = csvString[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          currentCell += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        currentRow.push(currentCell.trim());
        currentCell = '';
      } else if ((char === '\r' || char === '\n') && !inQuotes) {
        if (char === '\r' && nextChar === '\n') i++;
        currentRow.push(currentCell.trim());
        if (currentRow.some(c => c !== '')) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentCell = '';
      } else {
        currentCell += char;
      }
    }

    if (currentCell || currentRow.length > 0) {
      currentRow.push(currentCell.trim());
      if (currentRow.some(c => c !== '')) rows.push(currentRow);
    }

    if (rows.length < 2) {
      throw new Error('CSV must contain a header row and at least one data row.');
    }

    const headers = rows[0].map(h => String(h || '').trim());
    const dataRows = rows.slice(1).map((r, idx) => {
      const obj = {};
      headers.forEach((h, colIdx) => {
        obj[h] = r[colIdx] || '';
      });
      obj._rowIndex = idx + 2;
      return obj;
    });

    return { headers, rows: dataRows };
  }
};
