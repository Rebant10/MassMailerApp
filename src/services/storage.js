/**
 * Mass Mailer Mobile — Storage Service
 * Local persistent store for accounts, data sources, templates, scheduling, and settings.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS, DEFAULT_SETTINGS, DEFAULT_TEMPLATE, DEFAULT_SCHEDULE } from '../config/constants';

export const storage = {
  // ─── Senders / Inboxes ───
  async getSenders() {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.SENDER_POOL);
      if (!data) return [];
      const list = JSON.parse(data);
      const today = new Date().toISOString().split('T')[0];

      // Enrich senders with up-to-date today stats
      let changed = false;
      for (const s of list) {
        if (!s.email) continue;
        const daily = await this.getSenderDailyCount(s.email);
        if (s.sentToday !== daily) {
          s.sentToday = daily;
          changed = true;
        }
        if (s.totalSent === undefined || s.totalSent === null) {
          s.totalSent = 0;
          changed = true;
        }
      }
      if (changed) {
        await AsyncStorage.setItem(STORAGE_KEYS.SENDER_POOL, JSON.stringify(list));
      }
      return list;
    } catch (e) {
      console.warn('Failed to get senders:', e);
      return [];
    }
  },

  async saveSenders(senders) {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.SENDER_POOL, JSON.stringify(senders));
    } catch (e) {
      console.error('Failed to save senders:', e);
    }
  },

  // ─── Data Sources (Multi-source) ───
  async getDataSources() {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.DATA_SOURCES);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.warn('Failed to get data sources:', e);
      return [];
    }
  },

  async saveDataSources(sources) {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.DATA_SOURCES, JSON.stringify(sources));
      // Rebuild combined leads whenever sources change
      await this.rebuildCombinedLeads(sources);
    } catch (e) {
      console.error('Failed to save data sources:', e);
    }
  },

  async addDataSource(source) {
    const sources = await this.getDataSources();
    sources.push(source);
    await this.saveDataSources(sources);
    return sources;
  },

  async removeDataSource(sourceId) {
    const sources = await this.getDataSources();
    const filtered = sources.filter(s => s.id !== sourceId);
    await this.saveDataSources(filtered);
    return filtered;
  },

  async updateDataSource(sourceIdOrObj, updates) {
    const sources = await this.getDataSources();
    const id = typeof sourceIdOrObj === 'object' && sourceIdOrObj !== null ? sourceIdOrObj.id : sourceIdOrObj;
    const patch = typeof sourceIdOrObj === 'object' && sourceIdOrObj !== null && !updates ? sourceIdOrObj : (updates || {});
    const idx = sources.findIndex(s => s.id === id);
    if (idx !== -1) {
      sources[idx] = { ...sources[idx], ...patch };
      await this.saveDataSources(sources);
    }
    return sources;
  },

  /**
   * Merges all source rows into a single combined lead pool.
   * Unifies column headers and deduplicates emails.
   */
  async rebuildCombinedLeads(sources) {
    if (!sources || sources.length === 0) {
      await AsyncStorage.setItem(STORAGE_KEYS.COMBINED_LEADS, JSON.stringify({
        headers: [],
        rows: [],
        totalLeads: 0,
        sourceCount: 0,
      }));
      return;
    }

    // Collect all unique headers
    const headerSet = new Set();
    for (const src of sources) {
      (src.headers || []).forEach(h => headerSet.add(h));
    }
    // Ensure Status columns are last
    headerSet.delete('Status');
    headerSet.delete('Sent At');
    headerSet.delete('Sent From');
    const headers = [...headerSet, 'Status', 'Sent At', 'Sent From'];

    // Merge all rows
    const allRows = [];
    let globalIdx = 2; // Google Sheets rows start at 2 (row 1 = headers)
    for (const src of sources) {
      for (const row of (src.rows || [])) {
        allRows.push({
          ...row,
          _sourceId: src.id,
          _sourceName: src.name,
          _sourceType: src.type,
          _sheetId: src.sheetId || null,
          _sheetName: src.sheetName || 'Sheet1',
          _rowIndex: row._rowIndex || globalIdx++,
        });
      }
    }

    const combined = {
      headers,
      rows: allRows,
      totalLeads: allRows.length,
      sourceCount: sources.length,
    };

    await AsyncStorage.setItem(STORAGE_KEYS.COMBINED_LEADS, JSON.stringify(combined));
    return combined;
  },

  async getCombinedLeads() {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.COMBINED_LEADS);
      return data ? JSON.parse(data) : { headers: [], rows: [], totalLeads: 0, sourceCount: 0 };
    } catch (e) {
      console.warn('Failed to get combined leads:', e);
      return { headers: [], rows: [], totalLeads: 0, sourceCount: 0 };
    }
  },

  // ─── Active Sheet & Live Combined Pool ───
  async getActiveSheet() {
    try {
      const sources = await this.getDataSources();
      const combined = await this.getCombinedLeads();
      if (combined && combined.rows && combined.rows.length > 0) {
        const googleSrc = sources.find(s => s.type === 'google' && s.sheetId);
        return {
          name: `${combined.sourceCount} source(s)`,
          sheetId: googleSrc ? googleSrc.sheetId : null,
          sheetName: googleSrc ? (googleSrc.sheetName || 'Sheet1') : 'Sheet1',
          headers: combined.headers,
          rows: combined.rows,
        };
      }
      // Fallback to legacy single sheet
      const data = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_SHEET);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.warn('Failed to get active sheet:', e);
      return null;
    }
  },

  async saveActiveSheet(sheetData) {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.ACTIVE_SHEET, JSON.stringify(sheetData));
      if (sheetData && sheetData.rows) {
        const combined = await this.getCombinedLeads();
        await AsyncStorage.setItem(STORAGE_KEYS.COMBINED_LEADS, JSON.stringify({
          ...combined,
          rows: sheetData.rows,
          headers: sheetData.headers || combined.headers,
        }));
      }
    } catch (e) {
      console.error('Failed to save active sheet:', e);
    }
  },

  // ─── Templates ───
  async getTemplates() {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.TEMPLATES);
      return data ? JSON.parse(data) : [DEFAULT_TEMPLATE];
    } catch (e) {
      return [DEFAULT_TEMPLATE];
    }
  },

  async saveTemplates(templates) {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.TEMPLATES, JSON.stringify(templates));
    } catch (e) {
      console.error('Failed to save templates:', e);
    }
  },

  async saveTemplatePreset(preset) {
    try {
      const list = await this.getTemplates();
      const idx = list.findIndex(t => t.id === preset.id);
      if (idx >= 0) {
        list[idx] = { ...list[idx], ...preset, updatedAt: new Date().toISOString() };
      } else {
        list.push({
          ...preset,
          id: preset.id || 'tpl_' + Date.now(),
          updatedAt: new Date().toISOString()
        });
      }
      await this.saveTemplates(list);
      return list;
    } catch (e) {
      console.error('Failed to save template preset:', e);
      return [];
    }
  },

  async deleteTemplatePreset(presetId) {
    try {
      const list = await this.getTemplates();
      const filtered = list.filter(t => t.id !== presetId);
      await this.saveTemplates(filtered);
      return filtered;
    } catch (e) {
      console.error('Failed to delete template preset:', e);
      return [];
    }
  },

  async getActiveTemplate() {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_TEMPLATE);
      return data ? JSON.parse(data) : DEFAULT_TEMPLATE;
    } catch (e) {
      return DEFAULT_TEMPLATE;
    }
  },

  async saveActiveTemplate(tpl) {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.ACTIVE_TEMPLATE, JSON.stringify(tpl));
    } catch (e) {
      console.error('Failed to save active template:', e);
    }
  },

  // ─── Settings ───
  async getSettings() {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (!data) return DEFAULT_SETTINGS;
      const parsed = JSON.parse(data);
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
        webClientId: (parsed.webClientId && parsed.webClientId.trim()) || DEFAULT_SETTINGS.webClientId,
        webClientSecret: (parsed.webClientSecret && parsed.webClientSecret.trim()) || DEFAULT_SETTINGS.webClientSecret,
      };
    } catch (e) {
      return DEFAULT_SETTINGS;
    }
  },

  async saveSettings(settings) {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    } catch (e) {
      console.error('Failed to save settings:', e);
    }
  },

  // ─── Schedule Config ───
  async getSchedule() {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.SCHEDULE_CONFIG);
      return data ? { ...DEFAULT_SCHEDULE, ...JSON.parse(data) } : DEFAULT_SCHEDULE;
    } catch (e) {
      return DEFAULT_SCHEDULE;
    }
  },

  async getScheduleConfig() {
    return this.getSchedule();
  },

  async saveSchedule(config) {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.SCHEDULE_CONFIG, JSON.stringify(config));
    } catch (e) {
      console.error('Failed to save schedule config:', e);
    }
  },

  async saveScheduleConfig(config) {
    return this.saveSchedule(config);
  },

  // ─── Daily Sent Counter per sender email ───
  async getSenderDailyCount(email) {
    try {
      const today = new Date().toISOString().split('T')[0];
      const key = `${STORAGE_KEYS.DAILY_SENT_STATS}_${today}_${email.toLowerCase()}`;
      const count = await AsyncStorage.getItem(key);
      return count ? parseInt(count, 10) : 0;
    } catch (e) {
      return 0;
    }
  },

  async incrementSenderDailyCount(email) {
    if (!email) return 1;
    try {
      const today = new Date().toISOString().split('T')[0];
      const key = `${STORAGE_KEYS.DAILY_SENT_STATS}_${today}_${email.toLowerCase()}`;
      const current = await this.getSenderDailyCount(email);
      const nextDaily = current + 1;
      await AsyncStorage.setItem(key, String(nextDaily));

      // Also persist to SENDER_POOL so totalSent and sentToday are permanently preserved
      const data = await AsyncStorage.getItem(STORAGE_KEYS.SENDER_POOL);
      if (data) {
        const senders = JSON.parse(data);
        const idx = senders.findIndex(s => s.email?.toLowerCase() === email.toLowerCase());
        if (idx !== -1) {
          senders[idx].sentToday = nextDaily;
          senders[idx].totalSent = (senders[idx].totalSent || 0) + 1;
          senders[idx].lastSentAt = new Date().toISOString();
          senders[idx].lastSentDate = today;
          await AsyncStorage.setItem(STORAGE_KEYS.SENDER_POOL, JSON.stringify(senders));
        }
      }
      return nextDaily;
    } catch (e) {
      console.warn('Failed to increment sender daily count:', e);
      return 1;
    }
  },

  async resetSenderDailyCount(email) {
    if (!email) return 0;
    try {
      const today = new Date().toISOString().split('T')[0];
      const key = `${STORAGE_KEYS.DAILY_SENT_STATS}_${today}_${email.toLowerCase()}`;
      await AsyncStorage.setItem(key, '0');

      const data = await AsyncStorage.getItem(STORAGE_KEYS.SENDER_POOL);
      if (data) {
        const senders = JSON.parse(data);
        const idx = senders.findIndex(s => s.email?.toLowerCase() === email.toLowerCase());
        if (idx !== -1) {
          senders[idx].sentToday = 0;
          await AsyncStorage.setItem(STORAGE_KEYS.SENDER_POOL, JSON.stringify(senders));
        }
      }
      return 0;
    } catch (e) {
      console.warn('Failed to reset sender daily count:', e);
      return 0;
    }
  },

  // ─── Round Robin Continuation Index ───
  async getLastSenderIndex() {
    try {
      const idx = await AsyncStorage.getItem('MM_LAST_SENDER_INDEX');
      return idx !== null ? parseInt(idx, 10) : -1;
    } catch (e) {
      return -1;
    }
  },

  async saveLastSenderIndex(index) {
    try {
      await AsyncStorage.setItem('MM_LAST_SENDER_INDEX', String(index));
    } catch (e) {
      console.warn('Failed to save last sender index:', e);
    }
  }
};
