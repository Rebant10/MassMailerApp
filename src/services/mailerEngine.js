/**
 * Mass Mailer Mobile — Campaign Execution Engine
 * Drives multi-account sending, smart delays, company caps, duplicate checks, and live status.
 */

import { parsePlaceholders, randomDelay, isCurrentTimeInWindow } from '../utils/mailerUtils';
import { gmailService } from './gmail';
import { sheetsService } from './sheets';
import { storage } from './storage';
import { foregroundService } from './foregroundService';

class MailerEngine {
  constructor() {
    this.isRunning = false;
    this.isPaused = false;
    this.shouldStop = false;

    this.state = {
      currentIndex: 0,
      totalRows: 0,
      sentCount: 0,
      failedCount: 0,
      skippedCount: 0,
      currentSenderEmail: '',
      status: 'idle', // idle, running, paused, completed, stopped
      logs: []
    };

    this.listeners = new Set();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    const snapshot = { ...this.state };
    this.listeners.forEach(fn => fn(snapshot));
  }

  addLog(msg, type = 'info') {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const logItem = { id: Date.now() + Math.random(), time, msg, type };
    this.state.logs = [logItem, ...this.state.logs.slice(0, 99)]; // keep latest 100
    this.notify();
  }

  findEmailCol(headers) {
    const exact = ['Email', 'email', 'EMAIL', 'E-mail', 'e-mail', 'Mail', 'mail', 'Email Address'];
    return headers.find(h => exact.includes(h)) ||
      headers.find(h => h.toLowerCase().includes('email')) || null;
  }

  findCompanyCol(headers) {
    if (!Array.isArray(headers)) return null;
    const exact = ['company', 'company name', 'organization', 'employer', 'firm', 'corp'];
    return (
      headers.find(h => exact.includes((h || '').trim().toLowerCase())) ||
      headers.find(h => /company|organization|employer|firm|corp/i.test(h)) ||
      null
    );
  }

  getNextSender(senders, lastIndex) {
    if (!senders || senders.length === 0) return null;
    const n = senders.length;
    for (let step = 1; step <= n; step++) {
      const idx = (lastIndex + step) % n;
      const s = senders[idx];

      // Per-account campaign limit
      if (typeof s.campaignLimit === 'number' && s.campaignLimit > 0) {
        if ((s.sentThisCampaign || 0) >= s.campaignLimit) continue;
      }

      // Daily limit
      const dailySent = s.sentToday || 0;
      const limit = s.dailyLimit || (s.isWorkspace ? 2000 : 500);
      if (dailySent < limit) {
        return { sender: s, index: idx };
      }
    }
    return null;
  }

  async start({
    rows,
    headers,
    template,
    senders,
    sheetId = null,
    sheetName = 'Sheet1',
    settings,
    masterAttachment = null
  }) {
    if (this.isRunning) return;

    this.isRunning = true;
    this.isPaused = false;
    this.shouldStop = false;

    const emailCol = this.findEmailCol(headers);
    if (!emailCol) {
      this.addLog('Error: No "Email" column found in sheet headers.', 'danger');
      this.stop();
      return;
    }
    const companyCol = this.findCompanyCol(headers);

    // Filter already sent rows from previous runs
    const alreadySent = rows.filter(r => String(r.Status || '').trim() === 'Sent ✓').length;

    this.state = {
      currentIndex: 0,
      totalRows: rows.length,
      sentCount: alreadySent,
      failedCount: 0,
      skippedCount: 0,
      currentSenderEmail: senders[0]?.email || '',
      status: 'running',
      logs: [],
      senderStats: {},
    };
    this.notify();
    this.addLog(`🚀 Campaign started with ${rows.length} leads across ${senders.length} account(s).`, 'info');

    foregroundService.startForegroundNotification({
      currentIndex: 0,
      totalRows: rows.length,
      currentSenderEmail: senders[0]?.email || '',
      progressPercent: 0,
    });

    // Initialize per-sender stats
    const initialSenderStats = {};
    for (const s of senders) {
      s.sentToday = await storage.getSenderDailyCount(s.email);
      s.totalSent = s.totalSent || 0;
      s.sentThisCampaign = 0;
      initialSenderStats[s.email] = {
        sentThisCampaign: 0,
        sentToday: s.sentToday,
        totalSent: s.totalSent,
      };
    }
    this.state.senderStats = initialSenderStats;

    // Ensure Google Sheet has Status, Sent At, and Sent From columns
    let sheetColMap = null;
    const effectiveSheetId = sheetId || rows.find(r => r._sheetId)?._sheetId || null;
    const effectiveSheetName = sheetName || rows.find(r => r._sheetName)?._sheetName || 'Sheet1';

    if (effectiveSheetId) {
      try {
        sheetColMap = await sheetsService.ensureStatusColumns(
          effectiveSheetId,
          effectiveSheetName,
          headers,
          senders[0]
        );
        this.addLog(
          `📊 Google Sheet synced: Status (Col ${sheetColMap.statusCol}), Sent At (Col ${sheetColMap.sentAtCol}), Sent From (Col ${sheetColMap.sentFromCol})`,
          'info'
        );
      } catch (err) {
        console.warn('Could not map sheet columns:', err.message);
      }
    }

    // Company caps tracking (normalized to lowercase)
    const companySentCount = {};
    if (companyCol) {
      for (const r of rows) {
        if (String(r.Status || '').trim() === 'Sent ✓') {
          const c = (r[companyCol] || '').trim().toLowerCase();
          if (c) companySentCount[c] = (companySentCount[c] || 0) + 1;
        }
      }
    }

    // Duplicate email tracking
    const seenEmails = new Set();
    for (const r of rows) {
      if (String(r.Status || '').trim() === 'Sent ✓') {
        const e = (r[emailCol] || '').trim().toLowerCase();
        if (e) seenEmails.add(e);
      }
    }

    let lastSenderIndex = await storage.getLastSenderIndex();
    if (typeof lastSenderIndex !== 'number' || isNaN(lastSenderIndex) || lastSenderIndex < -1 || lastSenderIndex >= senders.length) {
      lastSenderIndex = -1;
    } else {
      const nextInboxIdx = (lastSenderIndex + 1) % senders.length;
      this.addLog(`🔄 Resuming round-robin from inbox #${nextInboxIdx + 1} (${senders[nextInboxIdx]?.email})`, 'info');
    }

    // Retrieve schedule config with storage fallback
    const storedSched = (await storage.getScheduleConfig?.()) || {};
    const schedActiveDays = settings?.activeDays || storedSched.activeDays || ['mon', 'tue', 'wed', 'thu', 'fri'];
    const schedStartTime = settings?.startTime || storedSched.startTime || '09:00 AM';
    const schedEndTime = settings?.endTime || storedSched.endTime || '05:00 PM';

    // If in scheduled mode, check if we are within the scheduled active window BEFORE sending email #1
    if (settings?.deliveryMode === 'scheduled') {
      let windowCheck = isCurrentTimeInWindow(
        schedActiveDays,
        schedStartTime,
        schedEndTime
      );

      if (!windowCheck.inWindow) {
        this.addLog(`🌙 ${windowCheck.reason}. Waiting for scheduled window (${schedStartTime} - ${schedEndTime}) to open...`, 'warning');

        while (!this.shouldStop) {
          while (this.isPaused) {
            await new Promise(r => setTimeout(r, 500));
            if (this.shouldStop) break;
          }
          if (this.shouldStop) break;

          foregroundService.updateProgress({
            currentIndex: 0,
            totalRows: rows.length,
            currentSenderEmail: senders[0]?.email || '',
            progressPercent: 0,
            statusText: `🌙 Scheduled: waiting for ${schedStartTime} (${windowCheck.reason})`,
            isPaused: false,
          });

          // Wait 15s before rechecking
          const waitStart = Date.now();
          while (Date.now() - waitStart < 15000) {
            if (this.shouldStop) break;
            await new Promise(r => setTimeout(r, 1000));
          }

          windowCheck = isCurrentTimeInWindow(
            schedActiveDays,
            schedStartTime,
            schedEndTime
          );
          if (windowCheck.inWindow) {
            this.addLog(`⏰ Scheduled window is now OPEN (${schedStartTime} - ${schedEndTime})! Starting campaign execution...`, 'success');
            break;
          }
        }

        if (this.shouldStop) {
          this.addLog('⏹ Campaign stopped by user while waiting for schedule window.', 'warning');
          this.isRunning = false;
          this.isPaused = false;
          this.state.status = 'stopped';
          this.notify();
          foregroundService.stopForegroundNotification();
          return;
        }
      } else {
        this.addLog(`⏰ Current time is within schedule window (${settings?.startTime || '09:00 AM'} - ${settings?.endTime || '05:00 PM'}). Starting first batch...`, 'info');
      }
    }

    let sentThisRun = 0;

    for (let i = 0; i < rows.length; i++) {
      if (this.shouldStop) {
        this.addLog('⏹ Campaign stopped by user.', 'warning');
        break;
      }

      while (this.isPaused) {
        await new Promise(r => setTimeout(r, 500));
        if (this.shouldStop) break;
      }
      if (this.shouldStop) break;

      this.state.currentIndex = i + 1;
      this.notify();

      const row = rows[i];
      const rowStatus = String(row.Status || '').trim();

      // Skip already processed
      if (rowStatus === 'Sent ✓' || rowStatus === 'Queued 📋') {
        continue;
      }

      const email = (row[emailCol] || '').trim();
      if (!email || !email.includes('@')) {
        this.state.failedCount++;
        row.Status = 'Failed ✗';
        this.addLog(`Row #${row._rowIndex || i + 2}: Invalid email (${email || 'blank'})`, 'danger');
        this.notify();
        continue;
      }

      const emailLower = email.toLowerCase();
      if (settings?.duplicateProtection && seenEmails.has(emailLower)) {
        this.state.skippedCount++;
        row.Status = 'Skipped ⏭';
        this.addLog(`Duplicate email skipped: ${email}`, 'warning');
        this.notify();
        continue;
      }

      // Company targeting and cap verification
      if (companyCol) {
        const rawCompany = (row[companyCol] || '').trim();
        const compLower = rawCompany.toLowerCase();
        const mode = settings?.companyTargetMode || 'all';

        // 1. In 'specific' mode, ONLY allow leads from selected companies
        if (mode === 'specific') {
          const selectedList = Array.isArray(settings?.selectedCompanies) ? settings.selectedCompanies : [];
          const isTargeted = selectedList.some(c => c.trim().toLowerCase() === compLower);
          if (!isTargeted) {
            this.state.skippedCount++;
            row.Status = 'Skipped ⏭';
            this.addLog(`Company "${rawCompany || 'Unspecified'}" not in selected list, skipping ${email}`, 'warning');
            this.notify();
            continue;
          }
        }

        // 2. Limit verification:
        // Case-insensitive lookup in companyLimits map and companyLimitRows array
        let cap = null;
        if (settings?.companyLimits && typeof settings.companyLimits === 'object') {
          const matchKey = Object.keys(settings.companyLimits).find(k => k.trim().toLowerCase() === compLower);
          if (matchKey && settings.companyLimits[matchKey] !== undefined && settings.companyLimits[matchKey] !== null) {
            const rawVal = String(settings.companyLimits[matchKey]).trim();
            if (rawVal !== '') {
              const parsed = parseInt(rawVal, 10);
              if (!isNaN(parsed) && parsed > 0) cap = parsed;
            }
          }
        }
        if (cap === null && Array.isArray(settings?.companyLimitRows)) {
          const rowMatch = settings.companyLimitRows.find(r => (r.company || '').trim().toLowerCase() === compLower);
          if (rowMatch && rowMatch.limit !== undefined && rowMatch.limit !== null) {
            const rawVal = String(rowMatch.limit).trim();
            if (rawVal !== '') {
              const parsed = parseInt(rawVal, 10);
              if (!isNaN(parsed) && parsed > 0) cap = parsed;
            }
          }
        }
        if (cap === null && mode === 'all' && settings?.companyLimitAll) {
          const parsed = parseInt(String(settings.companyLimitAll).trim(), 10);
          if (!isNaN(parsed) && parsed > 0) cap = parsed;
        }

        const sentSoFar = companySentCount[compLower] || 0;
        if (cap !== null && sentSoFar >= cap) {
          this.state.skippedCount++;
          row.Status = 'Skipped ⏭';
          this.addLog(`Company limit reached for "${rawCompany}" (${cap} max, already sent ${sentSoFar}), skipping ${email}`, 'warning');
          this.notify();
          continue;
        }
      }

      // Select next sender
      const next = this.getNextSender(senders, lastSenderIndex);
      if (!next) {
        this.addLog('All accounts have reached their daily/campaign limits. Pausing campaign.', 'warning');
        this.pause();
        break;
      }

      const currentSender = next.sender;
      lastSenderIndex = next.index;
      await storage.saveLastSenderIndex(next.index);
      this.state.currentSenderEmail = currentSender.email;
      this.notify();

      const attachment = currentSender.attachment || masterAttachment;

      try {
        const subject = parsePlaceholders(template.subject, row, currentSender);
        const body = parsePlaceholders(template.body, row, currentSender);

        this.addLog(`Sending to ${email} via ${currentSender.email} …`, 'info');
        await gmailService.sendEmail(currentSender, email, subject, body, attachment);

        this.state.sentCount++;
        sentThisRun++;
        const sentAtTimestamp = new Date().toLocaleString();
        row.Status = 'Sent ✓';
        row['Sent At'] = sentAtTimestamp;
        row['Sent From'] = currentSender.email;
        row['Attachment'] = attachment ? attachment.name : 'Master Template';

        seenEmails.add(emailLower);
        if (companyCol) {
          const comp = (row[companyCol] || '').trim().toLowerCase();
          if (comp) companySentCount[comp] = (companySentCount[comp] || 0) + 1;
        }

        currentSender.sentToday = (currentSender.sentToday || 0) + 1;
        currentSender.sentThisCampaign = (currentSender.sentThisCampaign || 0) + 1;
        currentSender.totalSent = (currentSender.totalSent || 0) + 1;
        await storage.incrementSenderDailyCount(currentSender.email);

        if (!this.state.senderStats) this.state.senderStats = {};
        this.state.senderStats[currentSender.email] = {
          sentThisCampaign: currentSender.sentThisCampaign,
          sentToday: currentSender.sentToday,
          totalSent: currentSender.totalSent,
        };

        this.addLog(`✓ Sent to ${email} (${currentSender.email})`, 'success');

        // Write directly to online Google Sheet (Status, Sent At, Sent From)
        const rowSheetId = row._sheetId || effectiveSheetId;
        const rowSheetName = row._sheetName || effectiveSheetName;
        const targetRowIndex = row._rowIndex;

        if (rowSheetId && targetRowIndex && sheetColMap) {
          sheetsService.writeRowDispatch(
            rowSheetId,
            rowSheetName,
            targetRowIndex,
            { status: 'Sent ✓', sentAt: sentAtTimestamp, sentFrom: currentSender.email },
            sheetColMap,
            currentSender
          ).then((ok) => {
            if (ok) {
              this.addLog(`📝 Synced row #${targetRowIndex} to Google Sheet`, 'info');
            }
          }).catch(() => {});
        }

        // Periodically sync back to local storage
        if (sentThisRun % 3 === 0 || sentThisRun === 1) {
          storage.getActiveSheet().then(as => {
            if (as) storage.saveActiveSheet({ ...as, rows });
          }).catch(() => {});
        }

        this.notify();

        // Enforce run batch limit (scheduled cycle or test run)
        const isScheduled = settings?.deliveryMode === 'scheduled';
        const batchCutoff = isScheduled
          ? (parseInt(settings?.scheduleBatchSize || settings?.batchSize, 10) || null)
          : (settings?.sendLimit ? parseInt(settings.sendLimit, 10) : null);

        if (batchCutoff && sentThisRun >= batchCutoff) {
          if (isScheduled) {
            // Check if there are remaining pending rows in the sheet
            const remainingPending = rows.slice(i + 1).filter(r => String(r.Status || '').trim() !== 'Sent ✓');
            if (remainingPending.length === 0) {
              this.addLog(`🎉 All leads in campaign have been sent! Finishing campaign.`, 'success');
              break;
            }

            const intervalMin = parseInt(settings?.scheduleBatchInterval || 5, 10) || 5;
            this.addLog(`⚡ Cycle batch of ${sentThisRun} emails complete. Pausing ${intervalMin}m before next cycle...`, 'success');
            sentThisRun = 0;

            // Wait for interval while keeping foreground service alive and updating status
            const intervalMs = intervalMin * 60 * 1000;
            const sleepStart = Date.now();
            while (Date.now() - sleepStart < intervalMs) {
              if (this.shouldStop) break;
              while (this.isPaused) {
                await new Promise(r => setTimeout(r, 500));
                if (this.shouldStop) break;
              }
              const remainingSec = Math.round((intervalMs - (Date.now() - sleepStart)) / 1000);
              const remainingMin = Math.ceil(remainingSec / 60);
              foregroundService.updateProgress({
                currentIndex: i + 1,
                totalRows: rows.length,
                currentSenderEmail: currentSender.email,
                progressPercent: this.state.progressPercent || 0,
                statusText: `⏳ Next cycle in ${remainingMin}m (${remainingPending.length} leads left)`,
                isPaused: false,
              });
              await new Promise(r => setTimeout(r, 1000));
            }
            if (this.shouldStop) break;

            // Check if within active scheduled window and days
            while (!this.shouldStop) {
              const windowCheck = isCurrentTimeInWindow(
                schedActiveDays,
                schedStartTime,
                schedEndTime
              );
              if (windowCheck.inWindow) break;

              this.addLog(`🌙 ${windowCheck.reason}. Waiting for active window...`, 'info');
              foregroundService.updateProgress({
                currentIndex: i + 1,
                totalRows: rows.length,
                currentSenderEmail: currentSender.email,
                progressPercent: this.state.progressPercent || 0,
                statusText: `🌙 Outside active window (${schedStartTime} - ${schedEndTime})`,
                isPaused: false,
              });
              // Wait 30s
              const waitStart = Date.now();
              while (Date.now() - waitStart < 30000) {
                if (this.shouldStop) break;
                await new Promise(r => setTimeout(r, 1000));
              }
            }
            if (this.shouldStop) break;

            this.addLog(`⏰ Waking up for next scheduled cycle!`, 'info');
            continue;
          } else {
            this.addLog(`🎯 Reached batch limit of ${batchCutoff} emails for this run. Stopping.`, 'success');
            break;
          }
        }

        const pct = rows.length > 0 ? Math.round(((i + 1) / rows.length) * 100) : 0;
        this.state.progressPercent = pct;
        foregroundService.updateProgress({
          currentIndex: i + 1,
          totalRows: rows.length,
          currentSenderEmail: currentSender.email,
          progressPercent: pct,
          isPaused: false,
        });

        // Pacing delay between emails
        if (i < rows.length - 1 && !this.shouldStop && !this.isPaused) {
          if (isScheduled) {
            const delaySec = parseInt(settings?.scheduleBatchDelay || settings?.delaySeconds || 5, 10);
            const jitterMs = Math.max(1000, delaySec * 1000 + Math.floor((Math.random() - 0.5) * 2000));
            this.addLog(`⏱️ Pausing ${Math.round(jitterMs / 1000)}s between emails in batch...`, 'info');
            await new Promise(r => setTimeout(r, jitterMs));
          } else {
            const minMs = (settings?.delayMin || 10) * 1000;
            const maxMs = (settings?.delayMax || 20) * 1000;
            await randomDelay(minMs, maxMs);
          }
        }
      } catch (err) {
        this.state.failedCount++;
        row.Status = 'Failed ✗';
        this.addLog(`✗ Failed to ${email}: ${err.message}`, 'danger');
        this.notify();

        // Rate limit backoff
        if (err.message.includes('429') || err.message.toLowerCase().includes('rate')) {
          this.addLog('Rate limit detected. Waiting 60s before retry …', 'warning');
          await new Promise(r => setTimeout(r, 60000));
        }
      }
    }

    // Persist final rows with sent status back to storage
    try {
      const as = await storage.getActiveSheet();
      if (as) await storage.saveActiveSheet({ ...as, rows });
      const dataSources = await storage.getDataSources();
      if (Array.isArray(dataSources) && dataSources.length > 0) {
        const matchIdx = dataSources.findIndex(d => (sheetId && d.sheetId === sheetId) || d.sheetName === sheetName);
        if (matchIdx !== -1) {
          dataSources[matchIdx].rows = rows;
          await storage.saveDataSources(dataSources);
        }
      }
    } catch (_) {}

    this.isRunning = false;
    this.isPaused = false;
    this.state.status = this.shouldStop ? 'stopped' : 'completed';
    this.addLog(`🏁 Campaign finished! Sent: ${this.state.sentCount}, Failed: ${this.state.failedCount}, Skipped: ${this.state.skippedCount}`, 'success');
    this.notify();

    foregroundService.stopForegroundNotification({
      sentCount: this.state.sentCount,
      failedCount: this.state.failedCount,
      skippedCount: this.state.skippedCount,
    });
  }

  pause() {
    if (!this.isRunning) return;
    this.isPaused = true;
    this.state.status = 'paused';
    this.addLog('⏸ Campaign paused.', 'warning');
    this.notify();

    const pct = this.state.totalRows > 0 ? Math.round((this.state.currentIndex / this.state.totalRows) * 100) : 0;
    foregroundService.updateProgress({
      currentIndex: this.state.currentIndex,
      totalRows: this.state.totalRows,
      currentSenderEmail: this.state.currentSenderEmail,
      progressPercent: pct,
      isPaused: true,
    });
  }

  resume() {
    if (!this.isRunning || !this.isPaused) return;
    this.isPaused = false;
    this.state.status = 'running';
    this.addLog('▶ Campaign resumed.', 'info');
    this.notify();

    const pct = this.state.totalRows > 0 ? Math.round((this.state.currentIndex / this.state.totalRows) * 100) : 0;
    foregroundService.updateProgress({
      currentIndex: this.state.currentIndex,
      totalRows: this.state.totalRows,
      currentSenderEmail: this.state.currentSenderEmail,
      progressPercent: pct,
      isPaused: false,
    });
  }

  stop() {
    this.shouldStop = true;
    this.isRunning = false;
    this.isPaused = false;
    this.state.status = 'stopped';
    this.notify();

    foregroundService.stopForegroundNotification();
  }
}

export const mailerEngine = new MailerEngine();
foregroundService.registerEngine(mailerEngine);

