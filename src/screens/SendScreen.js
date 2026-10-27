/**
 * SendScreen — 2-Stage Campaign Flow: Config ➔ Preview ➔ Live Execution Dashboard
 * Matches the proven Chrome extension workflow:
 * 1. Config Stage: Mode, Smart Delay presets, Run Batch limits, Per-Account limits, Company Limits with Dropdown & Universal Cap.
 * 2. Preview Stage: Real Merged Multi-Lead Round Robin Preview (generous full body letter format), Summary, Company/Sender Breakdown.
 * 3. Dashboard Stage: Live execution progress, pause/resume/stop, stats, and real-time terminal.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Switch,
  ScrollView,
  StyleSheet,
  Alert,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import StatCard from '../components/StatCard';
import LogView from '../components/LogView';
import { mailerEngine } from '../services/mailerEngine';
import { storage } from '../services/storage';
import { sheetsService } from '../services/sheets';
import { parsePlaceholders } from '../utils/mailerUtils';
import { foregroundService } from '../services/foregroundService';

const DAYS_OF_WEEK = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
];

const HOURS_12 = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
const MINUTES_60 = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
const PERIODS = ['AM', 'PM'];

export default function SendScreen() {
  const { theme } = useTheme();

  // Engine state
  const [engineState, setEngineState] = useState(mailerEngine.state);

  // Flow Stage: 'config' | 'preview' | 'dashboard'
  const isExecuting = engineState.status === 'running' || engineState.status === 'paused';
  const [currentStage, setCurrentStage] = useState(isExecuting ? 'dashboard' : 'config');

  // Context data
  const [activeSheet, setActiveSheet] = useState(null);
  const [activeTemplate, setActiveTemplate] = useState(null);
  const [senders, setSenders] = useState([]);
  const [settings, setSettings] = useState(null);

  // Delivery options: 'realtime' | 'scheduled'
  const [deliveryMode, setDeliveryMode] = useState('realtime');

  // Scheduling options
  const [activeDays, setActiveDays] = useState(['mon', 'tue', 'wed', 'thu', 'fri']);
  const [startTime, setStartTime] = useState('09:00 AM');
  const [endTime, setEndTime] = useState('05:00 PM');
  const [scheduleBatchSize, setScheduleBatchSize] = useState('2');
  const [scheduleBatchDelay, setScheduleBatchDelay] = useState('5');
  const [scheduleBatchInterval, setScheduleBatchInterval] = useState('5');
  const [scheduleDailyLimit, setScheduleDailyLimit] = useState('40');
  const [timePickerTarget, setTimePickerTarget] = useState(null); // 'start' | 'end' | null
  const [pickerHour, setPickerHour] = useState('09');
  const [pickerMinute, setPickerMinute] = useState('00');
  const [pickerPeriod, setPickerPeriod] = useState('AM');

  // Pacing Delays & Presets: 'safe' (10-20s), 'fast' (5-8s), 'stealth' (30-60s), 'custom'
  const [pacingPreset, setPacingPreset] = useState('safe');
  const [delayMin, setDelayMin] = useState('10');
  const [delayMax, setDelayMax] = useState('20');

  // Run Batch Send Limit: null / '' (All) | '5' | '10' | '25' | '50' | custom
  const [sendLimit, setSendLimit] = useState('');

  // Duplicate Protection
  const [duplicateProtection, setDuplicateProtection] = useState(true);

  // ── Company Targeting & Limits Overhaul ──
  const [companyTargetMode, setCompanyTargetMode] = useState('all'); // 'all' | 'specific'
  const [selectedCompanies, setSelectedCompanies] = useState([]);    // Array of targeted company names
  const [companyLimitRows, setCompanyLimitRows] = useState([]);      // Array of { id, company, limit }
  const [activePickerRowId, setActivePickerRowId] = useState(null);
  const [showAddCompanyModal, setShowAddCompanyModal] = useState(false);
  const [companySearchQuery, setCompanySearchQuery] = useState('');

  // Round-robin continuation index from previous campaign
  const [lastSenderIndex, setLastSenderIndex] = useState(-1);

  // Preview Pagination / Indexing
  const [previewPage, setPreviewPage] = useState(0); // 0 = first 3 leads, 1 = next 3, etc.
  const [isSyncingSheet, setIsSyncingSheet] = useState(false);

  // Real-time auto-persistence helper to ensure config never reverts to default
  const persistConfig = useCallback(async (overrides = {}) => {
    try {
      const mode = overrides.deliveryMode ?? deliveryMode;
      const preset = overrides.pacingPreset ?? pacingPreset;
      const dMin = overrides.delayMin ?? delayMin;
      const dMax = overrides.delayMax ?? delayMax;
      const sLim = overrides.sendLimit !== undefined ? overrides.sendLimit : sendLimit;
      const dup = overrides.duplicateProtection ?? duplicateProtection;
      const targetMode = overrides.companyTargetMode ?? companyTargetMode;
      const selComps = overrides.selectedCompanies ?? selectedCompanies;
      const rows = overrides.companyLimitRows ?? companyLimitRows;
      const bSize = overrides.scheduleBatchSize ?? scheduleBatchSize;
      const bDelay = overrides.scheduleBatchDelay ?? scheduleBatchDelay;
      const bInterval = overrides.scheduleBatchInterval ?? scheduleBatchInterval;
      const dLimit = overrides.scheduleDailyLimit ?? scheduleDailyLimit;
      const days = overrides.activeDays ?? activeDays;
      const sTime = overrides.startTime ?? startTime;
      const eTime = overrides.endTime ?? endTime;

      const current = (await storage.getSettings()) || {};
      const updatedSettings = {
        ...current,
        deliveryMode: mode,
        pacingPreset: preset,
        delayMin: parseInt(dMin, 10) || 10,
        delayMax: parseInt(dMax, 10) || 20,
        sendLimit: sLim ? parseInt(sLim, 10) : null,
        duplicateProtection: dup,
        companyTargetMode: targetMode,
        selectedCompanies: selComps,
        companyLimitRows: rows,
        scheduleBatchSize: parseInt(bSize, 10) || 2,
        scheduleBatchDelay: parseInt(bDelay, 10) || 5,
        scheduleBatchInterval: parseInt(bInterval, 10) || 5,
        scheduleDailyLimit: parseInt(dLimit, 10) || 40,
      };
      await storage.saveSettings(updatedSettings);

      const currentSched = (await storage.getSchedule()) || {};
      const updatedSchedule = {
        ...currentSched,
        activeDays: days,
        startTime: sTime,
        endTime: eTime,
        batchSize: parseInt(bSize, 10) || 2,
        delaySeconds: parseInt(bDelay, 10) || 5,
        batchInterval: parseInt(bInterval, 10) || 5,
        dailyLimit: parseInt(dLimit, 10) || 40,
      };
      await storage.saveSchedule(updatedSchedule);
    } catch (e) {
      console.warn('Failed to persist campaign config:', e);
    }
  }, [
    deliveryMode, pacingPreset, delayMin, delayMax, sendLimit,
    duplicateProtection, companyTargetMode, selectedCompanies,
    companyLimitRows, scheduleBatchSize, scheduleBatchDelay,
    scheduleBatchInterval, scheduleDailyLimit, activeDays,
    startTime, endTime
  ]);

  const handleSyncSheet = async (quiet = false) => {
    try {
      setIsSyncingSheet(true);
      const sendersList = await storage.getSenders();
      const sources = await storage.getDataSources();
      const googleSources = sources.filter((s) => s.type === 'google' && s.sheetId);

      if (googleSources.length === 0) {
        await loadAllData();
        if (!quiet) Alert.alert('Refreshed ✓', 'Queue reloaded from local storage.');
        return;
      }

      if (!sendersList || sendersList.length === 0) {
        if (!quiet) Alert.alert('Notice', 'Please connect an account in the Inboxes tab to sync Google Sheets.');
        return;
      }

      let totalSynced = 0;
      for (const src of googleSources) {
        const { headers, rows } = await sheetsService.fetchTabRows(
          src.sheetId,
          src.sheetName || 'Sheet1',
          sendersList[0]
        );
        await storage.updateDataSource(src.id, {
          headers,
          rows,
          importedAt: new Date().toISOString(),
        });
        totalSynced += rows.length;
      }
      await loadAllData();
      if (!quiet) {
        Alert.alert('Sheet Synced ✓', `Synced ${totalSynced} rows across ${googleSources.length} connected sheet(s).`);
      }
    } catch (e) {
      if (!quiet) {
        Alert.alert('Sync Failed', e.message);
      }
    } finally {
      setIsSyncingSheet(false);
    }
  };

  useEffect(() => {
    const unsub = mailerEngine.subscribe((state) => {
      setEngineState(state);
      if (state.status === 'running' || state.status === 'paused') {
        setCurrentStage('dashboard');
      }
    });
    loadAllData();
    return unsub;
  }, []);

  const loadAllData = async () => {
    const [s, t, p, cfg, sched, lastIdx] = await Promise.all([
      storage.getActiveSheet(),
      storage.getActiveTemplate(),
      storage.getSenders(),
      storage.getSettings(),
      storage.getScheduleConfig?.() || null,
      storage.getLastSenderIndex(),
    ]);

    setActiveSheet(s);
    setActiveTemplate(t);
    setSenders(p || []);
    setSettings(cfg);
    setLastSenderIndex(typeof lastIdx === 'number' && !isNaN(lastIdx) ? lastIdx : -1);

    if (cfg) {
      if (cfg.deliveryMode) setDeliveryMode(cfg.deliveryMode);
      if (cfg.pacingPreset) setPacingPreset(cfg.pacingPreset);
      if (cfg.delayMin) setDelayMin(String(cfg.delayMin));
      if (cfg.delayMax) setDelayMax(String(cfg.delayMax));
      setDuplicateProtection(cfg.duplicateProtection !== false);
      if (cfg.sendLimit !== undefined && cfg.sendLimit !== null) setSendLimit(String(cfg.sendLimit));

      if (cfg.companyTargetMode) setCompanyTargetMode(cfg.companyTargetMode);
      if (Array.isArray(cfg.selectedCompanies)) setSelectedCompanies(cfg.selectedCompanies);

      // Build companyLimitRows from stored rows or legacy companyLimits
      if (Array.isArray(cfg.companyLimitRows) && cfg.companyLimitRows.length > 0) {
        setCompanyLimitRows(cfg.companyLimitRows);
      } else {
        const rows = [];
        if (cfg.companyLimitAll !== null && cfg.companyLimitAll !== undefined && cfg.companyLimitAll !== '') {
          rows.push({
            id: 'row_master_' + Date.now(),
            company: '__ALL__',
            limit: String(cfg.companyLimitAll),
          });
        }
        if (cfg.companyLimits && typeof cfg.companyLimits === 'object') {
          Object.entries(cfg.companyLimits).forEach(([comp, lim], idx) => {
            rows.push({
              id: 'row_' + idx + '_' + Date.now(),
              company: comp,
              limit: lim ? String(lim) : '',
            });
          });
        }
        if (rows.length > 0) setCompanyLimitRows(rows);
      }
    }

    if (sched) {
      if (sched.activeDays) setActiveDays(sched.activeDays);
      if (sched.startTime) setStartTime(sched.startTime);
      if (sched.endTime) setEndTime(sched.endTime);
      if (sched.batchSize) setScheduleBatchSize(String(sched.batchSize));
      if (sched.delaySeconds) setScheduleBatchDelay(String(sched.delaySeconds));
      if (sched.batchInterval) setScheduleBatchInterval(String(sched.batchInterval));
      if (sched.dailyLimit) setScheduleDailyLimit(String(sched.dailyLimit));
    }
  };

  const handleSetDeliveryMode = (mode) => {
    setDeliveryMode(mode);
    persistConfig({ deliveryMode: mode });
  };

  const handlePacingPreset = (preset) => {
    setPacingPreset(preset);
    let newMin = delayMin;
    let newMax = delayMax;
    if (preset === 'fast') {
      newMin = '5';
      newMax = '8';
    } else if (preset === 'safe') {
      newMin = '10';
      newMax = '20';
    } else if (preset === 'stealth') {
      newMin = '30';
      newMax = '60';
    }
    setDelayMin(newMin);
    setDelayMax(newMax);
    persistConfig({ pacingPreset: preset, delayMin: newMin, delayMax: newMax });
  };

  const toggleDay = (dayKey) => {
    setActiveDays((prev) => {
      const next = prev.includes(dayKey) ? prev.filter((d) => d !== dayKey) : [...prev, dayKey];
      persistConfig({ activeDays: next });
      return next;
    });
  };

  const openTimePicker = (target) => {
    const currentTimeStr = target === 'start' ? startTime : endTime;
    const match = (currentTimeStr || '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
    if (match) {
      let h = parseInt(match[1], 10);
      if (h === 0) h = 12;
      setPickerHour(String(h > 12 ? h - 12 : h).padStart(2, '0'));
      setPickerMinute(String(match[2]).padStart(2, '0'));
      setPickerPeriod(match[3] ? match[3].toUpperCase() : (h >= 12 ? 'PM' : 'AM'));
    } else {
      setPickerHour(target === 'start' ? '09' : '05');
      setPickerMinute('00');
      setPickerPeriod(target === 'start' ? 'AM' : 'PM');
    }
    setTimePickerTarget(target);
  };

  const handleConfirmCustomTime = () => {
    const formatted = `${pickerHour}:${pickerMinute} ${pickerPeriod}`;
    if (timePickerTarget === 'start') {
      setStartTime(formatted);
      persistConfig({ startTime: formatted });
    } else if (timePickerTarget === 'end') {
      setEndTime(formatted);
      persistConfig({ endTime: formatted });
    }
    setTimePickerTarget(null);
  };

  // Find columns
  const emailCol = useMemo(() => {
    if (!activeSheet?.headers) return null;
    return (
      activeSheet.headers.find((h) => /^email$/i.test(h.trim())) ||
      activeSheet.headers.find((h) => /email/i.test(h)) ||
      activeSheet.headers[0] ||
      null
    );
  }, [activeSheet]);

  const companyCol = useMemo(() => {
    if (!activeSheet?.headers) return null;
    return (
      activeSheet.headers.find((h) => /^company$/i.test(h.trim())) ||
      activeSheet.headers.find((h) => /company|organization|employer|firm|corp/i.test(h)) ||
      null
    );
  }, [activeSheet]);

  // Detected unique companies from the active sheet
  const detectedCompanies = useMemo(() => {
    if (!activeSheet?.rows || !companyCol) return [];
    const set = new Set();
    for (const r of activeSheet.rows) {
      const val = (r[companyCol] || '').trim();
      if (val) set.add(val);
    }
    return Array.from(set).sort();
  }, [activeSheet, companyCol]);

  // ── Company Targeting & Limit Helpers ──
  const handleSetCompanyTargetMode = (mode) => {
    setCompanyTargetMode(mode);
    persistConfig({ companyTargetMode: mode });
  };

  const toggleSelectCompany = (comp) => {
    setSelectedCompanies((prev) => {
      const exists = prev.some((c) => c.toLowerCase() === comp.toLowerCase());
      const next = exists
        ? prev.filter((c) => c.toLowerCase() !== comp.toLowerCase())
        : [...prev, comp];
      persistConfig({ selectedCompanies: next });
      return next;
    });
  };

  const selectAllCompanies = () => {
    setSelectedCompanies(detectedCompanies);
    persistConfig({ selectedCompanies: detectedCompanies });
  };

  const clearSelectedCompanies = () => {
    setSelectedCompanies([]);
    persistConfig({ selectedCompanies: [] });
  };

  const updateCompanyLimit = (comp, limitStr) => {
    setCompanyLimitRows((prev) => {
      const idx = prev.findIndex((r) => r.company.toLowerCase() === comp.toLowerCase());
      let next;
      if (idx !== -1) {
        next = prev.map((r, i) => (i === idx ? { ...r, limit: limitStr } : r));
      } else {
        next = [
          ...prev,
          {
            id: 'row_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
            company: comp,
            limit: limitStr,
          },
        ];
      }
      persistConfig({ companyLimitRows: next });
      return next;
    });
  };

  const addCompanyLimitRow = () => {
    const used = new Set(companyLimitRows.map((r) => r.company));
    let initialChoice = '__ALL__';
    if (used.has('__ALL__')) {
      const avail = detectedCompanies.find((c) => !used.has(c));
      initialChoice = avail || detectedCompanies[0] || '__ALL__';
    }

    const newRow = {
      id: 'row_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      company: initialChoice,
      limit: '',
    };
    const next = [...companyLimitRows, newRow];
    setCompanyLimitRows(next);
    persistConfig({ companyLimitRows: next });
  };

  const removeCompanyLimitRow = (id) => {
    const next = companyLimitRows.filter((r) => r.id !== id);
    setCompanyLimitRows(next);
    persistConfig({ companyLimitRows: next });
  };

  const updateCompanyLimitRow = (id, key, val) => {
    const next = companyLimitRows.map((r) => (r.id === id ? { ...r, [key]: val } : r));
    setCompanyLimitRows(next);
    persistConfig({ companyLimitRows: next });
  };

  // Compile parsed company limits for engine & storage
  // When limit is empty/blank: NO limit (unlimited)
  // When limit has a number: enforce that number
  const compiledCompanyLimits = useMemo(() => {
    let masterCap = null;
    const specific = {};

    if (companyTargetMode === 'all') {
      companyLimitRows.forEach((r) => {
        if (!r.company) return;
        const lim = parseInt(String(r.limit).trim(), 10);
        if (r.company === '__ALL__') {
          if (!isNaN(lim) && lim > 0) masterCap = lim;
        } else {
          const key = r.company.trim().toLowerCase();
          specific[key] = !isNaN(lim) && lim > 0 ? lim : null;
        }
      });
    } else {
      selectedCompanies.forEach((comp) => {
        const found = companyLimitRows.find(
          (r) => (r.company || '').trim().toLowerCase() === comp.trim().toLowerCase()
        );
        const lim = found ? parseInt(String(found.limit).trim(), 10) : NaN;
        specific[comp.trim().toLowerCase()] = !isNaN(lim) && lim > 0 ? lim : null;
      });
    }

    return {
      mode: companyTargetMode,
      selectedCompanies,
      masterCap,
      specific,
    };
  }, [companyTargetMode, selectedCompanies, companyLimitRows]);

  // Per-account campaign limit
  const updateSenderCampaignLimit = async (senderId, limitStr) => {
    const val = limitStr ? parseInt(limitStr, 10) : null;
    const updated = senders.map((s) => (s.id === senderId ? { ...s, campaignLimit: val } : s));
    setSenders(updated);
    await storage.saveSenders(updated);
  };

  // Helper calculations
  const totalRows = activeSheet?.rows?.length || 0;
  const progressPercent = engineState.progressPercent !== undefined
    ? engineState.progressPercent
    : (totalRows > 0 ? Math.min(100, Math.round(((engineState.currentIndex || 0) / totalRows) * 100)) : 0);
  const alreadySentCount = activeSheet?.rows
    ? activeSheet.rows.filter((r) => String(r.Status || '').trim() === 'Sent ✓').length
    : 0;

  // Complete simulation across entire sheet for accurate preview, send counts, and sender rotation
  const simulatedLeads = useMemo(() => {
    if (!activeSheet?.rows || !activeTemplate) return [];
    const baseSenderIdx = typeof lastSenderIndex === 'number' && lastSenderIndex >= 0 ? lastSenderIndex + 1 : 0;
    const targetSet = new Set(selectedCompanies.map((c) => c.trim().toLowerCase()));
    const simCompanyCount = {};
    const seenSimEmails = new Set();
    let sentCounter = 0;

    return activeSheet.rows.map((row, overallIdx) => {
      const toEmail = emailCol && row[emailCol] ? String(row[emailCol]).trim() : '';
      const emailLower = toEmail.toLowerCase();
      const rawComp = companyCol ? (row[companyCol] || '').trim() : '';
      const compLower = rawComp.toLowerCase();

      let willSend = true;
      let skipReason = null;

      // 1. Already sent in previous campaign
      if (String(row.Status || '').trim() === 'Sent ✓') {
        willSend = false;
        skipReason = 'Already sent ✓';
        if (compLower) simCompanyCount[compLower] = (simCompanyCount[compLower] || 0) + 1;
        if (emailLower) seenSimEmails.add(emailLower);
      }
      // 2. Missing email address
      else if (!toEmail || !toEmail.includes('@')) {
        willSend = false;
        skipReason = 'No recipient email found';
      }
      // 3. Duplicate email protection
      else if (duplicateProtection && seenSimEmails.has(emailLower)) {
        willSend = false;
        skipReason = `Duplicate email (${toEmail})`;
      }
      // 4. Specific companies targeting
      else if (companyTargetMode === 'specific' && companyCol && !targetSet.has(compLower)) {
        willSend = false;
        skipReason = `Company "${rawComp || 'Unspecified'}" not selected`;
      }
      // 5. Company limit check
      else if (companyCol && compLower) {
        const cap = compiledCompanyLimits.specific[compLower] !== undefined
          ? compiledCompanyLimits.specific[compLower]
          : (companyTargetMode === 'all' ? compiledCompanyLimits.masterCap : null);

        const currentCompSent = simCompanyCount[compLower] || 0;
        if (cap !== null && typeof cap === 'number' && cap > 0 && currentCompSent >= cap) {
          willSend = false;
          skipReason = `Company limit reached for "${rawComp}" (Cap: ${cap} max)`;
        } else {
          simCompanyCount[compLower] = currentCompSent + 1;
        }
      }

      let assignedSender = null;
      let assignedSenderNumber = 1;
      let parsedSubject = '';
      let parsedBody = '';
      let effectiveAttachment = null;

      if (willSend) {
        seenSimEmails.add(emailLower);
        const assignedIdx = senders.length > 0 ? (baseSenderIdx + sentCounter) % senders.length : 0;
        assignedSender = senders.length > 0 ? senders[assignedIdx] : null;
        assignedSenderNumber = assignedIdx + 1;
        sentCounter++;

        parsedSubject = parsePlaceholders(activeTemplate.subject, row, assignedSender);
        parsedBody = parsePlaceholders(activeTemplate.body, row, assignedSender);
        effectiveAttachment = assignedSender?.attachment || activeTemplate.attachment || null;
      } else {
        const fallbackSender = senders.length > 0 ? senders[baseSenderIdx % senders.length] : null;
        parsedSubject = parsePlaceholders(activeTemplate.subject, row, fallbackSender);
        parsedBody = parsePlaceholders(activeTemplate.body, row, fallbackSender);
        effectiveAttachment = fallbackSender?.attachment || activeTemplate.attachment || null;
      }

      return {
        overallIdx,
        leadNumber: overallIdx + 1,
        willSend,
        skipReason,
        toEmail: toEmail || '(No recipient email)',
        company: rawComp || 'Unspecified',
        sender: assignedSender,
        senderNumber: assignedSenderNumber,
        subject: parsedSubject,
        body: parsedBody,
        attachment: effectiveAttachment,
        row,
      };
    });
  }, [
    activeSheet, activeTemplate, senders, emailCol, companyCol,
    lastSenderIndex, companyTargetMode, selectedCompanies,
    compiledCompanyLimits, duplicateProtection
  ]);

  // Pending rows filtered by company targeting and limits
  const pendingRows = useMemo(() => {
    return simulatedLeads.filter((l) => l.willSend);
  }, [simulatedLeads]);

  // Duplicate email detection
  const duplicateEmailsCount = useMemo(() => {
    if (!emailCol || !activeSheet?.rows) return 0;
    const counts = {};
    let dups = 0;
    activeSheet.rows.forEach((r) => {
      const e = (r[emailCol] || '').trim().toLowerCase();
      if (e) {
        counts[e] = (counts[e] || 0) + 1;
        if (counts[e] > 1) dups++;
      }
    });
    return dups;
  }, [emailCol, activeSheet]);

  const effectiveSendCount = sendLimit
    ? Math.min(pendingRows.length, parseInt(sendLimit, 10))
    : pendingRows.length;

  const totalDailyCapacity = senders.reduce(
    (acc, s) => acc + (s.dailyLimit || (s.isWorkspace ? 2000 : 500)),
    0
  );

  const avgDelaySec = ((parseInt(delayMin, 10) || 10) + (parseInt(delayMax, 10) || 20)) / 2;
  const estTotalSec = Math.round(effectiveSendCount * avgDelaySec);
  const estHours = Math.floor(estTotalSec / 3600);
  const estMins = Math.round((estTotalSec % 3600) / 60);
  const estTimeDisplay = estHours > 0 ? `~${estHours}h ${estMins}m` : `~${estMins}m`;

  // Company Breakdown Stats calculation
  const companyBreakdownStats = useMemo(() => {
    if (!companyCol || !activeSheet?.rows) return [];
    const counts = {};
    for (const r of activeSheet.rows) {
      const c = (r[companyCol] || '').trim() || 'Other';
      counts[c] = (counts[c] || 0) + 1;
    }
    const { masterCap, specific, mode, selectedCompanies: targets } = compiledCompanyLimits;

    if (mode === 'specific') {
      const targetSet = new Set(targets.map((c) => c.trim().toLowerCase()));
      const targetedStats = Object.entries(counts)
        .filter(([comp]) => targetSet.has(comp.trim().toLowerCase()))
        .map(([comp, total]) => {
          const key = comp.trim().toLowerCase();
          const cap = specific[key] !== undefined ? specific[key] : null;
          const willSend = (cap !== null && typeof cap === 'number' && cap > 0) ? Math.min(total, cap) : total;
          return { company: comp, total, cap, willSend, isTargeted: true };
        });

      const untargetedTotal = Object.entries(counts)
        .filter(([comp]) => !targetSet.has(comp.trim().toLowerCase()))
        .reduce((sum, [, t]) => sum + t, 0);

      if (untargetedTotal > 0) {
        targetedStats.push({
          company: 'Other (Not Selected)',
          total: untargetedTotal,
          cap: 0,
          willSend: 0,
          isTargeted: false,
        });
      }
      return targetedStats;
    }

    if (masterCap === null && Object.keys(specific).length === 0) return [];

    return Object.entries(counts).map(([comp, total]) => {
      const key = comp.trim().toLowerCase();
      const cap = specific[key] !== undefined ? specific[key] : masterCap;
      const willSend = (cap !== null && typeof cap === 'number' && cap > 0) ? Math.min(total, cap) : total;
      return { company: comp, total, cap, willSend, isTargeted: true };
    }).sort((a, b) => b.total - a.total);
  }, [companyCol, activeSheet, compiledCompanyLimits]);

  // Sender Allocation simulation continuing round-robin from lastSenderIndex
  const senderAllocation = useMemo(() => {
    if (!senders || senders.length === 0 || effectiveSendCount <= 0) {
      return senders.map(() => 0);
    }
    const counts = senders.map(() => 0);
    const limits = senders.map((s) =>
      typeof s.campaignLimit === 'number' && s.campaignLimit > 0 ? s.campaignLimit : Infinity
    );
    let curIdx = typeof lastSenderIndex === 'number' && lastSenderIndex >= 0 ? lastSenderIndex : -1;
    for (let i = 0; i < effectiveSendCount; i++) {
      let allocated = false;
      for (let step = 1; step <= senders.length; step++) {
        const nextIdx = (curIdx + step) % senders.length;
        if (counts[nextIdx] < limits[nextIdx]) {
          counts[nextIdx]++;
          curIdx = nextIdx;
          allocated = true;
          break;
        }
      }
      if (!allocated) break;
    }
    return counts;
  }, [senders, effectiveSendCount, lastSenderIndex]);

  // ── Transition to Preview Stage ──
  const handleProceedToPreview = async () => {
    if (!activeSheet || !activeSheet.rows || activeSheet.rows.length === 0) {
      Alert.alert('No Leads Loaded', 'Please go to the "Leads" tab and connect a Google Sheet or CSV first.');
      return;
    }
    if (!senders || senders.length === 0) {
      Alert.alert('No Accounts Connected', 'Please go to the "Inboxes" tab and add at least one Google account.');
      return;
    }
    if (!activeTemplate || !activeTemplate.subject || !activeTemplate.body) {
      Alert.alert('Template Incomplete', 'Please go to the "Template" tab and write your email subject and body.');
      return;
    }

    if (companyTargetMode === 'specific' && selectedCompanies.length === 0) {
      Alert.alert('No Companies Selected', 'You have selected "Specific Companies Only". Please select at least one company or switch to "All Companies".');
      return;
    }

    const minVal = parseInt(delayMin, 10) || 5;
    const maxVal = parseInt(delayMax, 10) || 15;
    if (minVal > maxVal) {
      Alert.alert('Invalid Delay', 'Minimum delay cannot be greater than maximum delay.');
      return;
    }

    // Persist all config so it never reverts
    await persistConfig();

    // Auto-sync Google Sheet quietly before generating preview so any changes made to doc are present
    if (activeSheet?.sheetId && senders.length > 0) {
      await handleSyncSheet(true);
    }

    setPreviewPage(0);
    setCurrentStage('preview');
  };

  // ── Start Campaign Execution ──
  const startCampaign = async () => {
    await foregroundService.requestPermission();

    const minVal = parseInt(delayMin, 10) || 5;
    const maxVal = parseInt(delayMax, 10) || 15;
    const sendLimitVal = sendLimit ? parseInt(sendLimit, 10) : null;
    const batchSizeVal = parseInt(scheduleBatchSize, 10) || 2;
    const batchDelayVal = parseInt(scheduleBatchDelay, 10) || 5;
    const batchIntervalVal = parseInt(scheduleBatchInterval, 10) || 5;
    const dailyLimitVal = parseInt(scheduleDailyLimit, 10) || 40;

    const currentSettings = (await storage.getSettings()) || settings || {};
    const campaignSettings = {
      ...currentSettings,
      deliveryMode,
      activeDays,
      startTime,
      endTime,
      delayMin: minVal,
      delayMax: maxVal,
      sendLimit: sendLimitVal,
      scheduleBatchSize: batchSizeVal,
      scheduleBatchDelay: batchDelayVal,
      scheduleBatchInterval: batchIntervalVal,
      scheduleDailyLimit: dailyLimitVal,
      companyTargetMode,
      selectedCompanies,
      companyLimitAll: compiledCompanyLimits.masterCap,
      companyLimits: compiledCompanyLimits.specific,
      companyLimitRows,
      duplicateProtection,
    };

    await storage.saveSettings(campaignSettings);

    if (deliveryMode === 'scheduled') {
      const sched = {
        enabled: true,
        activeDays,
        startTime,
        endTime,
        batchSize: batchSizeVal,
        delaySeconds: batchDelayVal,
        batchInterval: batchIntervalVal,
        dailyLimit: dailyLimitVal,
        updatedAt: new Date().toISOString(),
      };
      if (storage.saveScheduleConfig) await storage.saveScheduleConfig(sched);
      Alert.alert(
        'Automation Armed ⏰',
        `Scheduled campaign activated! Batches of ${batchSizeVal} emails with ${batchDelayVal}s pause between emails will dispatch during ${startTime} - ${endTime} on active days in the background.`
      );
    }

    setCurrentStage('dashboard');

    mailerEngine.start({
      rows: activeSheet.rows,
      headers: activeSheet.headers,
      template: activeTemplate,
      senders,
      sheetId: activeSheet.sheetId || null,
      sheetName: activeSheet.sheetName || 'Sheet1',
      settings: campaignSettings,
      masterAttachment: activeTemplate.attachment || null,
    });
  };

  // Multi-lead preview items driven directly by simulation
  const pageSize = 3;
  const totalPreviewPages = Math.ceil(simulatedLeads.length / pageSize) || 1;
  const currentPreviewSlice = useMemo(() => {
    const startIdx = previewPage * pageSize;
    return simulatedLeads.slice(startIdx, startIdx + pageSize);
  }, [simulatedLeads, previewPage, pageSize]);

  return (
    <View style={[styles.outerContainer, { backgroundColor: theme.bg }]}>
      {/* ═══════════════════════════════════════════════════════════
           STAGE 1: CAMPAIGN CONFIGURATION (Config)
           ═══════════════════════════════════════════════════════════ */}
      {currentStage === 'config' && (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={[styles.title, { color: theme.text }]}>Campaign Setup</Text>
              <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                Configure delays, batch sizes, and company limits
              </Text>
            </View>
            <View style={[styles.stepPill, { backgroundColor: theme.accentGlow, borderColor: theme.accent }]}>
              <Text style={[styles.stepPillText, { color: theme.accentLight }]}>Step 1: Config</Text>
            </View>
          </View>

          {/* Active Leads Source Card with Live Doc Sync */}
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={[styles.cardHeaderTitle, { color: theme.textSecondary, marginBottom: 2 }]}>
                  📋 ACTIVE LEAD SOURCE
                </Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: theme.text }} numberOfLines={1}>
                  {activeSheet?.name || 'No Leads Loaded'}
                </Text>
                <Text style={{ fontSize: 11, color: theme.textSecondary, marginTop: 2 }}>
                  {totalRows} leads • {alreadySentCount} sent • {pendingRows.length} ready to send
                </Text>
              </View>

              <TouchableOpacity
                onPress={() => handleSyncSheet(false)}
                disabled={isSyncingSheet}
                style={[
                  styles.syncSheetBtn,
                  { backgroundColor: theme.infoGlow, borderColor: theme.info },
                ]}
                activeOpacity={0.8}
              >
                {isSyncingSheet ? (
                  <ActivityIndicator size="small" color={theme.info} />
                ) : (
                  <Text style={[styles.syncSheetBtnText, { color: theme.info }]}>🔄 Sync Doc</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* 1. Mode Selector */}
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.cardHeaderTitle, { color: theme.textSecondary }]}>
              1. SENDING MODE
            </Text>
            <View style={styles.segmentContainer}>
              <TouchableOpacity
                onPress={() => setDeliveryMode('realtime')}
                style={[
                  styles.segmentBtn,
                  deliveryMode === 'realtime' && {
                    backgroundColor: theme.accent,
                    shadowColor: theme.accent,
                    elevation: 4,
                  },
                ]}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.segmentBtnText,
                    { color: deliveryMode === 'realtime' ? '#FFFFFF' : theme.textSecondary },
                  ]}
                >
                  ⚡ Instant Real-Time
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setDeliveryMode('scheduled')}
                style={[
                  styles.segmentBtn,
                  deliveryMode === 'scheduled' && {
                    backgroundColor: theme.accent,
                    shadowColor: theme.accent,
                    elevation: 4,
                  },
                ]}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.segmentBtnText,
                    { color: deliveryMode === 'scheduled' ? '#FFFFFF' : theme.textSecondary },
                  ]}
                >
                  📅 Scheduled Window
                </Text>
              </TouchableOpacity>
            </View>

            {deliveryMode === 'scheduled' && (
              <View style={[styles.schedConfigBox, { borderTopColor: theme.border }]}>
                <Text style={[styles.configSectionTitle, { color: theme.text }]}>Active Days of Week</Text>
                <View style={styles.daysRow}>
                  {DAYS_OF_WEEK.map((d) => {
                    const active = activeDays.includes(d.key);
                    return (
                      <TouchableOpacity
                        key={d.key}
                        onPress={() => toggleDay(d.key)}
                        style={[
                          styles.dayPill,
                          {
                            backgroundColor: active ? theme.accent : theme.surfaceElevated,
                            borderColor: active ? theme.accent : theme.border,
                          },
                        ]}
                      >
                        <Text style={[styles.dayPillText, { color: active ? '#FFF' : theme.textSecondary }]}>
                          {d.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={styles.timeRow}>
                  <View style={styles.col}>
                    <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>From:</Text>
                    <TouchableOpacity
                      onPress={() => openTimePicker('start')}
                      style={[
                        styles.dropdownBtn,
                        {
                          backgroundColor: theme.surfaceElevated,
                          borderColor: theme.border,
                          height: 44,
                          paddingHorizontal: 12,
                          justifyContent: 'space-between',
                          borderRadius: 12,
                        },
                      ]}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.dropdownBtnText, { color: theme.text, fontSize: 13, fontWeight: '700' }]}>
                        🕒 {startTime}
                      </Text>
                      <Text style={{ fontSize: 10, color: theme.accentLight }}>▼</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.col}>
                    <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>To:</Text>
                    <TouchableOpacity
                      onPress={() => openTimePicker('end')}
                      style={[
                        styles.dropdownBtn,
                        {
                          backgroundColor: theme.surfaceElevated,
                          borderColor: theme.border,
                          height: 44,
                          paddingHorizontal: 12,
                          justifyContent: 'space-between',
                          borderRadius: 12,
                        },
                      ]}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.dropdownBtnText, { color: theme.text, fontSize: 13, fontWeight: '700' }]}>
                        🕒 {endTime}
                      </Text>
                      <Text style={{ fontSize: 10, color: theme.accentLight }}>▼</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Cadence: Batch Size & Daily Limit (Matching Extension sidepanel.html:368-386) */}
                <View style={styles.timeRow}>
                  <View style={styles.col}>
                    <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>⚡ Batch Size (per cycle)</Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: theme.surfaceElevated, color: theme.text, borderColor: theme.border }]}
                      keyboardType="number-pad"
                      value={scheduleBatchSize}
                      onChangeText={(v) => {
                        setScheduleBatchSize(v);
                        persistConfig({ scheduleBatchSize: v });
                      }}
                      placeholder="2"
                      placeholderTextColor={theme.textTertiary}
                    />
                    <Text style={[styles.fieldHint, { color: theme.textTertiary }]}>Emails per cycle (default 2)</Text>
                  </View>
                  <View style={styles.col}>
                    <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>🎯 Daily Send Limit</Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: theme.surfaceElevated, color: theme.text, borderColor: theme.border }]}
                      keyboardType="number-pad"
                      value={scheduleDailyLimit}
                      onChangeText={(v) => {
                        setScheduleDailyLimit(v);
                        persistConfig({ scheduleDailyLimit: v });
                      }}
                      placeholder="40"
                      placeholderTextColor={theme.textTertiary}
                    />
                    <Text style={[styles.fieldHint, { color: theme.textTertiary }]}>Max emails per 24 hours</Text>
                  </View>
                </View>

                {/* Cadence: Pause Between Emails in Batch & Interval Between Batches */}
                <View style={styles.timeRow}>
                  <View style={styles.col}>
                    <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>⏱️ Pause Between Emails (sec)</Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: theme.surfaceElevated, color: theme.text, borderColor: theme.border }]}
                      keyboardType="number-pad"
                      value={scheduleBatchDelay}
                      onChangeText={(v) => {
                        setScheduleBatchDelay(v);
                        persistConfig({ scheduleBatchDelay: v });
                      }}
                      placeholder="5"
                      placeholderTextColor={theme.textTertiary}
                    />
                    <Text style={[styles.fieldHint, { color: theme.textTertiary }]}>Jitter delay between emails in batch</Text>
                  </View>
                  <View style={styles.col}>
                    <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>⏳ Time Between Batches (min)</Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: theme.surfaceElevated, color: theme.text, borderColor: theme.border }]}
                      keyboardType="number-pad"
                      value={scheduleBatchInterval}
                      onChangeText={(v) => {
                        setScheduleBatchInterval(v);
                        persistConfig({ scheduleBatchInterval: v });
                      }}
                      placeholder="5"
                      placeholderTextColor={theme.textTertiary}
                    />
                    <Text style={[styles.fieldHint, { color: theme.textTertiary }]}>Interval between cycles (~12/hr at 5m)</Text>
                  </View>
                </View>
              </View>
            )}
          </View>

          {/* Real-time Pacing & Batch Limits (Shown only in Instant Real-Time Mode) */}
          {deliveryMode === 'realtime' && (
            <>
              {/* 2. Smart Pacing Delays */}
              <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Text style={[styles.cardHeaderTitle, { color: theme.textSecondary }]}>
                  2. SMART DELAY BETWEEN EMAILS
                </Text>
                <Text style={[styles.cardDesc, { color: theme.textTertiary }]}>
                  Randomized jitter protects your inboxes from Gmail bot detection:
                </Text>

                <View style={styles.presetButtonsRow}>
                  <TouchableOpacity
                    onPress={() => handlePacingPreset('fast')}
                    style={[
                      styles.presetBtn,
                      pacingPreset === 'fast'
                        ? { backgroundColor: theme.accent, borderColor: theme.accent }
                        : { backgroundColor: theme.surfaceElevated, borderColor: theme.border },
                    ]}
                  >
                    <Text style={styles.presetEmoji}>🐇</Text>
                    <Text style={[styles.presetTitle, { color: pacingPreset === 'fast' ? '#FFF' : theme.text }]}>Fast</Text>
                    <Text style={[styles.presetSub, { color: pacingPreset === 'fast' ? '#FFF' : theme.textTertiary }]}>5–8 s</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => handlePacingPreset('safe')}
                    style={[
                      styles.presetBtn,
                      pacingPreset === 'safe'
                        ? { backgroundColor: theme.accent, borderColor: theme.accent }
                        : { backgroundColor: theme.surfaceElevated, borderColor: theme.border },
                    ]}
                  >
                    <Text style={styles.presetEmoji}>🐢</Text>
                    <Text style={[styles.presetTitle, { color: pacingPreset === 'safe' ? '#FFF' : theme.text }]}>Safe</Text>
                    <Text style={[styles.presetSub, { color: pacingPreset === 'safe' ? '#FFF' : theme.textTertiary }]}>10–20 s</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => handlePacingPreset('stealth')}
                    style={[
                      styles.presetBtn,
                      pacingPreset === 'stealth'
                        ? { backgroundColor: theme.accent, borderColor: theme.accent }
                        : { backgroundColor: theme.surfaceElevated, borderColor: theme.border },
                    ]}
                  >
                    <Text style={styles.presetEmoji}>🦥</Text>
                    <Text style={[styles.presetTitle, { color: pacingPreset === 'stealth' ? '#FFF' : theme.text }]}>Stealth</Text>
                    <Text style={[styles.presetSub, { color: pacingPreset === 'stealth' ? '#FFF' : theme.textTertiary }]}>30–60 s</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => {
                      setPacingPreset('custom');
                      persistConfig({ pacingPreset: 'custom' });
                    }}
                    style={[
                      styles.presetBtn,
                      pacingPreset === 'custom'
                        ? { backgroundColor: theme.accent, borderColor: theme.accent }
                        : { backgroundColor: theme.surfaceElevated, borderColor: theme.border },
                    ]}
                  >
                    <Text style={styles.presetEmoji}>⚙️</Text>
                    <Text style={[styles.presetTitle, { color: pacingPreset === 'custom' ? '#FFF' : theme.text }]}>Custom</Text>
                    <Text style={[styles.presetSub, { color: pacingPreset === 'custom' ? '#FFF' : theme.textTertiary }]}>Manual</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.row}>
                  <View style={styles.col}>
                    <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Min Delay (sec)</Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: theme.surfaceElevated, color: theme.text, borderColor: theme.border }]}
                      keyboardType="number-pad"
                      value={delayMin}
                      onChangeText={(v) => {
                        setDelayMin(v);
                        setPacingPreset('custom');
                        persistConfig({ delayMin: v, pacingPreset: 'custom' });
                      }}
                    />
                  </View>
                  <View style={styles.col}>
                    <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Max Delay (sec)</Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: theme.surfaceElevated, color: theme.text, borderColor: theme.border }]}
                      keyboardType="number-pad"
                      value={delayMax}
                      onChangeText={(v) => {
                        setDelayMax(v);
                        setPacingPreset('custom');
                        persistConfig({ delayMax: v, pacingPreset: 'custom' });
                      }}
                    />
                  </View>
                </View>
              </View>

              {/* 3. Run Batch Send Limit */}
              <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={styles.titleWithBadgeRow}>
                  <Text style={[styles.cardHeaderTitle, { color: theme.textSecondary, marginBottom: 0 }]}>
                    3. MAX EMAILS TO SEND (THIS RUN)
                  </Text>
                  <Text style={[styles.runLimitTag, { color: theme.accentLight }]}>
                    {sendLimit ? `${sendLimit} emails` : `All (${totalRows})`}
                  </Text>
                </View>
                <Text style={[styles.cardDesc, { color: theme.textTertiary }]}>
                  Stop automatically after a test batch, or click "All" to process all remaining leads:
                </Text>

                <View style={styles.limitPillRow}>
                  {['5', '10', '25', '50'].map((lim) => (
                    <TouchableOpacity
                      key={lim}
                      onPress={() => {
                        setSendLimit(lim);
                        persistConfig({ sendLimit: lim });
                      }}
                      style={[
                        styles.limitPill,
                        sendLimit === lim
                          ? { backgroundColor: theme.accent, borderColor: theme.accent }
                          : { backgroundColor: theme.surfaceElevated, borderColor: theme.border },
                      ]}
                    >
                      <Text style={[styles.limitPillText, { color: sendLimit === lim ? '#FFF' : theme.textSecondary }]}>
                        {lim}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    onPress={() => {
                      setSendLimit('');
                      persistConfig({ sendLimit: '' });
                    }}
                    style={[
                      styles.limitPill,
                      !sendLimit
                        ? { backgroundColor: theme.accent, borderColor: theme.accent }
                        : { backgroundColor: theme.surfaceElevated, borderColor: theme.border },
                    ]}
                  >
                    <Text style={[styles.limitPillText, { color: !sendLimit ? '#FFF' : theme.textSecondary }]}>
                      All ({totalRows})
                    </Text>
                  </TouchableOpacity>
                </View>

                <TextInput
                  style={[styles.input, { backgroundColor: theme.surfaceElevated, color: theme.text, borderColor: theme.border, marginTop: 8 }]}
                  placeholder="Or enter custom number (e.g. 15)"
                  placeholderTextColor={theme.textTertiary}
                  keyboardType="number-pad"
                  value={sendLimit}
                  onChangeText={(val) => {
                    setSendLimit(val);
                    persistConfig({ sendLimit: val });
                  }}
                />
              </View>
            </>
          )}

          {/* ═══════════════════════════════════════════════════════════
               4. COMPANY TARGETING & LIMITS OVERHAUL
               All Companies vs Specific Companies Only
               Blank = Unlimited, Number = Enforce limit
               ═══════════════════════════════════════════════════════════ */}
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <Text style={[styles.cardHeaderTitle, { color: theme.textSecondary, marginBottom: 0 }]}>
                🏢 COMPANY TARGETING &amp; LIMITS
              </Text>
              <View
                style={[
                  styles.activePill,
                  {
                    backgroundColor: companyTargetMode === 'specific' ? theme.accent : theme.surfaceElevated,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.activePillText,
                    {
                      color: companyTargetMode === 'specific' ? '#FFFFFF' : theme.textSecondary,
                    },
                  ]}
                >
                  {companyTargetMode === 'specific' ? '🎯 FILTER ACTIVE' : '🌐 ALL INCLUDED'}
                </Text>
              </View>
            </View>

            <Text style={[styles.cardDesc, { color: theme.textTertiary, marginBottom: 12 }]}>
              {companyTargetMode === 'all'
                ? 'All companies in your sheet will receive emails. You can optionally set limits below (leave blank for unlimited).'
                : 'Only leads from the selected companies will be emailed. All other companies will be skipped automatically.'}
            </Text>

            {/* Mode Selector Toggle: All vs Specific */}
            <View style={[styles.modeToggleRow, { marginBottom: 14 }]}>
              <TouchableOpacity
                onPress={() => handleSetCompanyTargetMode('all')}
                style={[
                  styles.modeBtn,
                  companyTargetMode === 'all'
                    ? { backgroundColor: theme.accent, borderColor: theme.accent }
                    : { backgroundColor: theme.surfaceElevated, borderColor: theme.border },
                ]}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.modeBtnText,
                    {
                      color: companyTargetMode === 'all' ? '#FFFFFF' : theme.textSecondary,
                      fontWeight: companyTargetMode === 'all' ? '800' : '500',
                    },
                  ]}
                >
                  🌐 All Companies
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => handleSetCompanyTargetMode('specific')}
                style={[
                  styles.modeBtn,
                  companyTargetMode === 'specific'
                    ? { backgroundColor: theme.accent, borderColor: theme.accent }
                    : { backgroundColor: theme.surfaceElevated, borderColor: theme.border },
                ]}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.modeBtnText,
                    {
                      color: companyTargetMode === 'specific' ? '#FFFFFF' : theme.textSecondary,
                      fontWeight: companyTargetMode === 'specific' ? '800' : '500',
                    },
                  ]}
                >
                  🎯 Specific Companies Only
                </Text>
              </TouchableOpacity>
            </View>

            {!companyCol && (
              <View style={[styles.noticeBox, { backgroundColor: theme.surfaceElevated, marginBottom: 10 }]}>
                <Text style={[styles.noticeText, { color: theme.warning }]}>
                  ⚠️ No "Company" column detected in sheet headers. All leads will be treated without company grouping.
                </Text>
              </View>
            )}

            {/* ── MODE A: ALL COMPANIES ── */}
            {companyTargetMode === 'all' && (
              <View>
                {/* Optional Universal Cap */}
                <View
                  style={{
                    marginBottom: 12,
                    padding: 10,
                    borderRadius: 8,
                    backgroundColor: theme.surfaceElevated,
                    borderWidth: 1,
                    borderColor: theme.border,
                  }}
                >
                  <Text style={[styles.inputLabel, { color: theme.textSecondary, marginBottom: 4 }]}>
                    🌐 Universal Company Limit (Optional)
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: theme.surface,
                        color: theme.text,
                        borderColor: theme.border,
                        height: 40,
                      },
                    ]}
                    keyboardType="number-pad"
                    placeholder="Leave blank for unlimited (or type max per company e.g. 2)"
                    placeholderTextColor={theme.textTertiary}
                    value={companyLimitRows.find((r) => r.company === '__ALL__')?.limit || ''}
                    onChangeText={(val) => {
                      const existingIdx = companyLimitRows.findIndex((r) => r.company === '__ALL__');
                      let next;
                      if (existingIdx !== -1) {
                        next = companyLimitRows.map((r, i) => (i === existingIdx ? { ...r, limit: val } : r));
                      } else {
                        next = [...companyLimitRows, { id: 'row_master', company: '__ALL__', limit: val }];
                      }
                      setCompanyLimitRows(next);
                      persistConfig({ companyLimitRows: next });
                    }}
                  />
                  <Text style={[styles.fieldHint, { color: theme.textTertiary, marginTop: 4 }]}>
                    Blank = No limit for companies without custom caps.
                  </Text>
                </View>

                {/* Specific Company Limits List in ALL mode */}
                <Text style={[styles.subLabel, { color: theme.textSecondary, marginBottom: 6 }]}>
                  Per-Company Limits (Blank = Unlimited):
                </Text>

                {companyLimitRows
                  .filter((r) => r.company !== '__ALL__')
                  .map((rowItem) => (
                    <View key={rowItem.id} style={[styles.companyRowContainer, { borderBottomColor: theme.border }]}>
                      <TouchableOpacity
                        onPress={() => setActivePickerRowId(rowItem.id)}
                        style={[styles.dropdownBtn, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.dropdownBtnText, { color: theme.text }]} numberOfLines={1}>
                          🏢 {rowItem.company}
                        </Text>
                        <Text style={{ fontSize: 10, color: theme.textTertiary }}>▼</Text>
                      </TouchableOpacity>

                      <TextInput
                        style={[
                          styles.companyLimitInput,
                          { backgroundColor: theme.surfaceElevated, color: theme.text, borderColor: theme.border },
                        ]}
                        keyboardType="number-pad"
                        placeholder="∞ No Limit"
                        placeholderTextColor={theme.textTertiary}
                        value={rowItem.limit}
                        onChangeText={(txt) => updateCompanyLimitRow(rowItem.id, 'limit', txt)}
                      />

                      <TouchableOpacity
                        onPress={() => removeCompanyLimitRow(rowItem.id)}
                        style={[styles.removeRowBtn, { backgroundColor: theme.dangerGlow }]}
                      >
                        <Text style={{ color: theme.danger, fontWeight: '800', fontSize: 13 }}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}

                <TouchableOpacity
                  onPress={addCompanyLimitRow}
                  style={[styles.addLimitBtn, { borderColor: theme.accent, backgroundColor: theme.accentGlow, marginTop: 8 }]}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.addLimitBtnText, { color: theme.accentLight }]}>
                    + Add Specific Company Limit
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ── MODE B: SPECIFIC COMPANIES ONLY ── */}
            {companyTargetMode === 'specific' && (
              <View>
                {/* Header Actions: Select All / Clear Selection */}
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 10,
                  }}
                >
                  <Text style={{ fontSize: 12, color: theme.textSecondary, fontWeight: '700' }}>
                    Targeted Companies ({selectedCompanies.length}):
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <TouchableOpacity
                      onPress={selectAllCompanies}
                      style={{
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        borderRadius: 6,
                        backgroundColor: theme.accentGlow,
                        borderWidth: 1,
                        borderColor: theme.accent,
                      }}
                    >
                      <Text style={{ color: theme.accentLight, fontSize: 11, fontWeight: '700' }}>+ Select All</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={clearSelectedCompanies}
                      style={{
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        borderRadius: 6,
                        backgroundColor: theme.surfaceElevated,
                        borderWidth: 1,
                        borderColor: theme.border,
                      }}
                    >
                      <Text style={{ color: theme.textSecondary, fontSize: 11, fontWeight: '600' }}>✕ Clear</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Quick Add Company Button from Detected List */}
                <TouchableOpacity
                  onPress={() => setShowAddCompanyModal(true)}
                  style={[
                    styles.addLimitBtn,
                    {
                      borderColor: theme.accent,
                      backgroundColor: theme.accentGlow,
                      marginBottom: 10,
                    },
                  ]}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.addLimitBtnText, { color: theme.accentLight }]}>
                    🔍 + Select / Add Companies from Sheet ({detectedCompanies.length} available)
                  </Text>
                </TouchableOpacity>

                {/* Selected Companies List with Individual Limit inputs (Blank = Unlimited) */}
                {selectedCompanies.length === 0 ? (
                  <View
                    style={{
                      padding: 14,
                      borderRadius: 8,
                      backgroundColor: theme.surfaceElevated,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: theme.warning, fontSize: 12, fontWeight: '700', textAlign: 'center' }}>
                      ⚠️ No companies selected yet!
                    </Text>
                    <Text style={{ color: theme.textTertiary, fontSize: 11, textAlign: 'center', marginTop: 4 }}>
                      Tap "+ Select All" or "+ Select / Add Companies" above to choose which companies to send to.
                    </Text>
                  </View>
                ) : (
                  selectedCompanies.map((comp) => {
                    const rowItem = companyLimitRows.find(
                      (r) => r.company.toLowerCase() === comp.toLowerCase()
                    );
                    const currentLimit = rowItem ? rowItem.limit : '';

                    return (
                      <View key={comp} style={[styles.companyRowContainer, { borderBottomColor: theme.border }]}>
                        <View style={{ flex: 1, paddingRight: 6 }}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: theme.text }} numberOfLines={1}>
                            🏢 {comp}
                          </Text>
                          <Text style={{ fontSize: 10, color: theme.textTertiary }}>
                            {currentLimit && currentLimit.trim()
                              ? `Max ${currentLimit} emails`
                              : 'No limit (∞ unlimited)'}
                          </Text>
                        </View>

                        <TextInput
                          style={[
                            styles.companyLimitInput,
                            {
                              backgroundColor: theme.surfaceElevated,
                              color: theme.text,
                              borderColor: theme.border,
                            },
                          ]}
                          keyboardType="number-pad"
                          placeholder="Limit (blank=∞)"
                          placeholderTextColor={theme.textTertiary}
                          value={currentLimit}
                          onChangeText={(txt) => updateCompanyLimit(comp, txt)}
                        />

                        <TouchableOpacity
                          onPress={() => toggleSelectCompany(comp)}
                          style={[styles.removeRowBtn, { backgroundColor: theme.dangerGlow }]}
                        >
                          <Text style={{ color: theme.danger, fontWeight: '800', fontSize: 13 }}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })
                )}
              </View>
            )}
          </View>

          {/* Per-Account Campaign Limits */}
          {senders.length > 0 && (
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.cardHeaderTitle, { color: theme.textSecondary }]}>
                👥 PER-ACCOUNT CAMPAIGN LIMITS
              </Text>
              <Text style={[styles.cardDesc, { color: theme.textTertiary }]}>
                Set max emails each Google account will send for this campaign. Leave blank for no limit.
              </Text>
              {senders.map((s) => (
                <View key={s.id} style={[styles.accountRow, { borderBottomColor: theme.border }]}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={[styles.accountEmail, { color: theme.text }]} numberOfLines={1}>
                      {s.email}
                    </Text>
                    <Text style={[styles.accountMeta, { color: theme.textTertiary }]}>
                      {s.accountType || 'Personal'} • Sent Today: {s.sentToday || 0}/{s.dailyLimit || 500} • Total: {s.totalSent || 0} sent
                      {s.attachment ? ` • 📎 ${s.attachment.name}` : ' • Master Resume'}
                    </Text>
                  </View>
                  <TextInput
                    style={[styles.accountCampInput, { backgroundColor: theme.surfaceElevated, color: theme.text, borderColor: theme.border }]}
                    placeholder="Unlimited"
                    placeholderTextColor={theme.textTertiary}
                    keyboardType="number-pad"
                    value={s.campaignLimit != null ? String(s.campaignLimit) : ''}
                    onChangeText={(txt) => updateSenderCampaignLimit(s.id, txt)}
                  />
                </View>
              ))}
            </View>
          )}

          {/* Bottom Action: Proceed to Preview */}
          <TouchableOpacity
            onPress={handleProceedToPreview}
            style={[styles.primaryActionBtn, { backgroundColor: theme.accent }]}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryActionBtnText}>👁️ Preview &amp; Send →</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* ═══════════════════════════════════════════════════════════
           STAGE 2: PREVIEW & LAUNCH CAMPAIGN (Step 4)
           ═══════════════════════════════════════════════════════════ */}
      {currentStage === 'preview' && (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          {/* Top Header */}
          <View style={styles.header}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={[styles.title, { color: theme.text }]}>Campaign Preview</Text>
              <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                Verify personalization &amp; round-robin rotation
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setCurrentStage('config')}
              style={[styles.stepPill, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}
            >
              <Text style={[styles.stepPillText, { color: theme.textSecondary }]}>← Edit Config</Text>
            </TouchableOpacity>
          </View>

          {/* Campaign Summary Grid */}
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <Text style={[styles.cardHeaderTitle, { color: theme.textSecondary, marginBottom: 0 }]}>
                📊 CAMPAIGN SUMMARY
              </Text>
              <TouchableOpacity
                onPress={() => handleSyncSheet(false)}
                disabled={isSyncingSheet}
                style={[styles.syncMiniBtn, { backgroundColor: theme.infoGlow }]}
                activeOpacity={0.8}
              >
                {isSyncingSheet ? (
                  <ActivityIndicator size="small" color={theme.info} />
                ) : (
                  <Text style={[styles.syncMiniBtnText, { color: theme.info }]}>🔄 Sync Sheet</Text>
                )}
              </TouchableOpacity>
            </View>
            <View style={styles.summaryGrid}>
              <View style={[styles.summaryItem, { backgroundColor: theme.surfaceElevated }]}>
                <Text style={[styles.summaryVal, { color: theme.text }]}>{totalRows}</Text>
                <Text style={[styles.summaryLbl, { color: theme.textTertiary }]}>Total in Sheet</Text>
              </View>
              <View style={[styles.summaryItem, { backgroundColor: theme.surfaceElevated }]}>
                <Text style={[styles.summaryVal, { color: theme.warning }]}>{alreadySentCount}</Text>
                <Text style={[styles.summaryLbl, { color: theme.textTertiary }]}>Already Sent</Text>
              </View>
              <View style={[styles.summaryItem, { backgroundColor: theme.surfaceElevated }]}>
                <Text style={[styles.summaryVal, { color: theme.success }]}>{effectiveSendCount}</Text>
                <Text style={[styles.summaryLbl, { color: theme.textTertiary }]}>To Send</Text>
              </View>
              <View style={[styles.summaryItem, { backgroundColor: theme.surfaceElevated }]}>
                <Text style={[styles.summaryVal, { color: theme.accentLight }]}>{senders.length}</Text>
                <Text style={[styles.summaryLbl, { color: theme.textTertiary }]}>Inboxes</Text>
              </View>
            </View>

            {duplicateEmailsCount > 0 && duplicateProtection && (
              <View style={[styles.warningBox, { backgroundColor: theme.warningGlow, borderColor: theme.warning }]}>
                <Text style={[styles.warningText, { color: theme.warning }]}>
                  ⚠️ {duplicateEmailsCount} duplicate email(s) detected in sheet — duplicates will be skipped automatically.
                </Text>
              </View>
            )}

            <View style={[styles.modeSummaryRow, { borderTopColor: theme.border }]}>
              <Text style={[styles.modeSummaryText, { color: theme.textSecondary }]}>
                Mode: <Text style={{ color: theme.accentLight, fontWeight: '700' }}>{deliveryMode === 'realtime' ? '⚡ Real-time' : '📅 Scheduled'}</Text>
                {deliveryMode === 'realtime' ? (
                  <>
                    {' '}• Pacing: <Text style={{ color: theme.text, fontWeight: '600' }}>{delayMin}–{delayMax}s</Text>
                    {' '}• Duration: <Text style={{ color: theme.warning, fontWeight: '600' }}>{estTimeDisplay}</Text>
                  </>
                ) : (
                  <>
                    {' '}• Batch: <Text style={{ color: theme.text, fontWeight: '600' }}>{scheduleBatchSize} emails / {scheduleBatchInterval}m</Text>
                    {' '}• Pause: <Text style={{ color: theme.text, fontWeight: '600' }}>{scheduleBatchDelay}s</Text>
                    {' '}• Cap: <Text style={{ color: theme.warning, fontWeight: '600' }}>{scheduleDailyLimit}/day</Text>
                  </>
                )}
              </Text>
            </View>
          </View>

          {/* Company Cap Breakdown Card (if limits active) */}
          {companyBreakdownStats.length > 0 && (
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.cardHeaderTitle, { color: theme.textSecondary }]}>
                🏢 COMPANY CAP BREAKDOWN
              </Text>
              {companyBreakdownStats.slice(0, 8).map((b) => (
                <View key={b.company} style={[styles.breakdownRow, { borderBottomColor: theme.border }]}>
                  <Text style={[styles.breakdownName, { color: theme.text }]} numberOfLines={1}>
                    {b.company}
                  </Text>
                  <Text style={[styles.breakdownStat, { color: theme.accentLight }]}>
                    <Text style={{ fontWeight: '800', color: theme.success }}>{b.willSend}</Text> / {b.total} (Cap: {b.cap !== Infinity ? b.cap : 'None'})
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Cross-Campaign Round Robin Continuity Card */}
          {senders.length > 1 && (
            <View style={[styles.card, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontSize: 20, marginRight: 10 }}>🔄</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: theme.text }}>
                    Round-Robin Rotation Resuming
                  </Text>
                  <Text style={{ fontSize: 11, color: theme.textSecondary, marginTop: 2, lineHeight: 16 }}>
                    {lastSenderIndex >= 0
                      ? `Previous campaign ended on sender #${(lastSenderIndex % senders.length) + 1} (${senders[lastSenderIndex % senders.length]?.email || ''}). This campaign begins rotation with #${((lastSenderIndex + 1) % senders.length) + 1} (${senders[(lastSenderIndex + 1) % senders.length]?.email || ''}).`
                      : `Initial campaign will begin rotation with sender #1 (${senders[0]?.email || ''}).`}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* Senders Pool Breakdown Card */}
          {senders.length > 0 && (
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.cardHeaderTitle, { color: theme.textSecondary }]}>
                👥 SENDERS POOL ALLOCATION (ROUND ROBIN)
              </Text>
              {senders.map((s, idx) => {
                const assigned = senderAllocation[idx] || 0;
                const attachInfo = s.attachment ? `📎 ${s.attachment.name}` : '📎 Master Resume';
                const campLim = s.campaignLimit ? `${s.campaignLimit} max` : 'Unlimited';
                return (
                  <View key={s.id} style={[styles.senderBreakdownRow, { borderBottomColor: theme.border }]}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={[styles.senderBreakdownEmail, { color: theme.text }]} numberOfLines={1}>
                        {s.email}
                      </Text>
                      <Text style={[styles.senderBreakdownMeta, { color: theme.textTertiary }]}>
                        {s.accountType || 'Personal'} • Sent Today: {s.sentToday || 0}/{s.dailyLimit || 500} • Total: {s.totalSent || 0} sent • {attachInfo}
                      </Text>
                    </View>
                    <View style={styles.senderAssignedBadge}>
                      <Text style={[styles.senderAssignedVal, { color: theme.accentLight }]}>
                        {assigned} emails
                      </Text>
                      <Text style={[styles.senderAssignedSub, { color: theme.textTertiary }]}>
                        Camp limit: {campLim}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* 👁️ Personalized Emails Preview (First 3+ Personalised Emails) */}
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.previewHeaderRow}>
              <View>
                <Text style={[styles.cardHeaderTitle, { color: theme.textSecondary, marginBottom: 2 }]}>
                  👁️ FIRST {pageSize} PERSONALISED EMAILS
                </Text>
                <Text style={[styles.cardDesc, { color: theme.textTertiary }]}>
                  Make sure every token, sender rotation, and signature looks right:
                </Text>
              </View>
              {totalPreviewPages > 1 && (
                <View style={styles.pageNavRow}>
                  <TouchableOpacity
                    onPress={() => setPreviewPage((p) => Math.max(0, p - 1))}
                    disabled={previewPage === 0}
                    style={[styles.pageNavBtn, { opacity: previewPage === 0 ? 0.3 : 1 }]}
                  >
                    <Text style={{ color: theme.text, fontSize: 13, fontWeight: '800' }}>‹</Text>
                  </TouchableOpacity>
                  <Text style={[styles.pageNavText, { color: theme.textSecondary }]}>
                    {previewPage + 1}/{totalPreviewPages}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setPreviewPage((p) => Math.min(totalPreviewPages - 1, p + 1))}
                    disabled={previewPage >= totalPreviewPages - 1}
                    style={[styles.pageNavBtn, { opacity: previewPage >= totalPreviewPages - 1 ? 0.3 : 1 }]}
                  >
                    <Text style={{ color: theme.text, fontSize: 13, fontWeight: '800' }}>›</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Email Cards (Generous space, no two-line truncation, true email letters) */}
            <View style={{ gap: 14, marginTop: 8 }}>
              {currentPreviewSlice.map((leadPreview) => (
                <View
                  key={leadPreview.overallIdx}
                  style={[
                    styles.emailLetterCard,
                    {
                      backgroundColor: theme.surfaceElevated,
                      borderColor: leadPreview.willSend ? theme.border : 'rgba(234, 179, 8, 0.4)',
                      opacity: leadPreview.willSend ? 1 : 0.85,
                    },
                  ]}
                >
                  {/* Letter Header */}
                  <View style={[styles.letterHeader, { borderBottomColor: theme.border }]}>
                    <View style={styles.letterMetaCol}>
                      <View style={styles.metaLine}>
                        <Text style={[styles.metaLabel, { color: theme.textTertiary }]}>TO:</Text>
                        <Text
                          style={[
                            styles.metaValueTo,
                            { color: leadPreview.willSend ? theme.info : theme.textSecondary },
                          ]}
                          numberOfLines={1}
                        >
                          {leadPreview.toEmail}
                        </Text>
                      </View>
                      <View style={styles.metaLine}>
                        <Text style={[styles.metaLabel, { color: theme.textTertiary }]}>COMPANY:</Text>
                        <Text style={[styles.metaValueFrom, { color: theme.textSecondary }]} numberOfLines={1}>
                          🏢 {leadPreview.company}
                        </Text>
                      </View>
                      {leadPreview.willSend ? (
                        <View style={styles.metaLine}>
                          <Text style={[styles.metaLabel, { color: theme.textTertiary }]}>FROM:</Text>
                          <Text style={[styles.metaValueFrom, { color: theme.textSecondary }]} numberOfLines={1}>
                            {leadPreview.sender ? leadPreview.sender.email : 'No sender account'}
                          </Text>
                        </View>
                      ) : null}
                      <View style={styles.metaLine}>
                        <Text style={[styles.metaLabel, { color: theme.textTertiary }]}>SUBJECT:</Text>
                        <Text style={[styles.metaValueSubject, { color: theme.text }]}>
                          {leadPreview.subject}
                        </Text>
                      </View>
                    </View>

                    {/* Rotation or Skipped Badge */}
                    {leadPreview.willSend ? (
                      <View style={[styles.rotationBadge, { backgroundColor: theme.accentGlow, borderColor: theme.accent }]}>
                        <Text style={[styles.rotationBadgeText, { color: theme.accentLight }]}>
                          Lead #{leadPreview.leadNumber}
                        </Text>
                        <Text style={[styles.rotationSubText, { color: theme.accentLight }]}>
                          Sender {leadPreview.senderNumber}/{senders.length}
                        </Text>
                      </View>
                    ) : (
                      <View style={[styles.rotationBadge, { backgroundColor: 'rgba(234, 179, 8, 0.18)', borderColor: '#EAB308' }]}>
                        <Text style={[styles.rotationBadgeText, { color: '#EAB308' }]}>
                          ⏭️ SKIPPED
                        </Text>
                        <Text style={[styles.rotationSubText, { color: '#EAB308' }]}>
                          Will Not Send
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Skip Reason Notice */}
                  {!leadPreview.willSend && (
                    <View
                      style={{
                        backgroundColor: 'rgba(234, 179, 8, 0.14)',
                        padding: 10,
                        marginHorizontal: 12,
                        marginTop: 10,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: '#EAB308',
                      }}
                    >
                      <Text style={{ color: '#EAB308', fontSize: 11, fontWeight: '800' }}>
                        ⏭️ {leadPreview.skipReason}
                      </Text>
                    </View>
                  )}

                  {/* Letter Body (Full generous preview) */}
                  <View style={styles.letterBodyContainer}>
                    <Text
                      style={[
                        styles.letterBodyText,
                        { color: leadPreview.willSend ? theme.text : theme.textSecondary },
                      ]}
                    >
                      {leadPreview.body.replace(/<[^>]+>/g, '')}
                    </Text>
                  </View>

                  {/* Attachment pill if attached */}
                  {leadPreview.attachment && (
                    <View style={[styles.letterAttachBox, { borderTopColor: theme.border }]}>
                      <Text style={[styles.letterAttachText, { color: theme.accentLight }]}>
                        📎 {leadPreview.sender?.attachment ? `[Custom for ${leadPreview.sender.email}] ` : '[Master Resume] '}
                        {leadPreview.attachment.name}
                      </Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          </View>

          {/* Action Buttons: Back or Launch */}
          <View style={styles.buttonActionRow}>
            <TouchableOpacity
              onPress={() => setCurrentStage('config')}
              style={[styles.secondaryActionBtn, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}
              activeOpacity={0.8}
            >
              <Text style={[styles.secondaryActionBtnText, { color: theme.text }]}>← Back</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={startCampaign}
              style={[styles.startCampaignBtn, { backgroundColor: theme.success }]}
              activeOpacity={0.85}
            >
              <Text style={styles.startCampaignBtnText}>🚀 Start Campaign</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {/* ═══════════════════════════════════════════════════════════
           STAGE 3: LIVE DASHBOARD (Active / Finished)
           ═══════════════════════════════════════════════════════════ */}
      {currentStage === 'dashboard' && (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          {/* Top Header */}
          <View style={styles.header}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={[styles.title, { color: theme.text }]}>Campaign Dashboard</Text>
              <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                Real-time dispatch &amp; background execution
              </Text>
            </View>
            <View
              style={[
                styles.statusBadge,
                {
                  backgroundColor: engineState.status === 'running'
                    ? theme.successGlow
                    : engineState.status === 'paused'
                    ? theme.warningGlow
                    : theme.surfaceElevated,
                  borderColor: engineState.status === 'running'
                    ? theme.success
                    : engineState.status === 'paused'
                    ? theme.warning
                    : theme.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.statusText,
                  {
                    color: engineState.status === 'running'
                      ? theme.success
                      : engineState.status === 'paused'
                      ? theme.warning
                      : theme.textSecondary,
                  },
                ]}
              >
                {engineState.status.toUpperCase()}
              </Text>
            </View>
          </View>

          {/* Progress Card */}
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.progressContainer}>
              <View style={styles.progressLabelRow}>
                <Text style={[styles.progTitle, { color: theme.text }]}>Progress</Text>
                <Text style={[styles.progVal, { color: theme.accentLight }]}>
                  {progressPercent}% ({engineState.currentIndex} / {totalRows})
                </Text>
              </View>
              <View style={[styles.progBarBg, { backgroundColor: theme.surfaceElevated }]}>
                <View
                  style={[
                    styles.progBarFill,
                    { width: `${progressPercent}%`, backgroundColor: theme.accent },
                  ]}
                />
              </View>
              {engineState.currentSenderEmail ? (
                <Text style={[styles.activeSenderNote, { color: theme.textTertiary }]}>
                  Active Sender: {engineState.currentSenderEmail}
                </Text>
              ) : null}
            </View>

            {/* Stat counters */}
            <View style={{ marginTop: 14 }}>
              <Text style={[styles.cardHeaderTitle, { color: theme.textSecondary, marginBottom: 8 }]}>
                📊 CAMPAIGN DISPATCH METRICS
              </Text>
              <View style={styles.statCountersRow}>
                <StatCard
                  title="Sent"
                  label="Sent"
                  value={engineState.sentCount}
                  variant="success"
                  color={theme.success}
                  icon="✓"
                  subtext="Delivered"
                />
                <StatCard
                  title="Failed"
                  label="Failed"
                  value={engineState.failedCount}
                  variant="danger"
                  color={theme.danger}
                  icon="✗"
                  subtext="Errors"
                />
                <StatCard
                  title="Skipped"
                  label="Skipped"
                  value={engineState.skippedCount}
                  variant="warning"
                  color={theme.warning}
                  icon="⏭"
                  subtext="Dups / Caps"
                />
              </View>
            </View>
          </View>

          {/* Inboxes Real-time Activity Card */}
          {senders.length > 0 && (
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, marginTop: 12 }]}>
              <View style={styles.terminalHeader}>
                <Text style={[styles.terminalTitle, { color: theme.textSecondary }]}>
                  📬 INBOXES DISPATCH ACTIVITY
                </Text>
                <Text style={[styles.terminalCount, { color: theme.textTertiary }]}>
                  {senders.length} account(s)
                </Text>
              </View>

              {senders.map((s) => {
                const live = engineState.senderStats?.[s.email];
                const campSent = live ? live.sentThisCampaign : (s.sentThisCampaign || 0);
                const daySent = live ? live.sentToday : (s.sentToday || 0);
                const lifeSent = live ? live.totalSent : (s.totalSent || 0);
                const dailyCap = s.dailyLimit || 500;
                const isCurrent = engineState.currentSenderEmail === s.email;

                return (
                  <View
                    key={s.id || s.email}
                    style={[
                      styles.senderActivityRow,
                      {
                        borderBottomColor: theme.border,
                        backgroundColor: isCurrent ? theme.accentGlow : 'transparent',
                      },
                    ]}
                  >
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[styles.senderBreakdownEmail, { color: theme.text }]} numberOfLines={1}>
                          {s.email}
                        </Text>
                        {isCurrent && (
                          <View style={[styles.activePill, { backgroundColor: theme.accent }]}>
                            <Text style={styles.activePillText}>ACTIVE</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.senderBreakdownMeta, { color: theme.textTertiary }]}>
                        Today: <Text style={{ color: theme.accentLight, fontWeight: '700' }}>{daySent}</Text> / {dailyCap} cap • Lifetime: <Text style={{ color: theme.success, fontWeight: '700' }}>{lifeSent}</Text> sent
                      </Text>
                    </View>

                    <View style={styles.senderAssignedBadge}>
                      <Text style={[styles.senderAssignedVal, { color: theme.success }]}>
                        {campSent} sent
                      </Text>
                      <Text style={[styles.senderAssignedSub, { color: theme.textTertiary }]}>
                        this campaign
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* Execution Controls */}
          <View style={styles.controlsRow}>
            {engineState.status === 'running' ? (
              <TouchableOpacity
                onPress={() => mailerEngine.pause()}
                style={[styles.dashControlBtn, { backgroundColor: theme.warning }]}
                activeOpacity={0.8}
              >
                <Text style={styles.dashControlBtnText}>⏸ Pause</Text>
              </TouchableOpacity>
            ) : engineState.status === 'paused' ? (
              <TouchableOpacity
                onPress={() => mailerEngine.resume()}
                style={[styles.dashControlBtn, { backgroundColor: theme.success }]}
                activeOpacity={0.8}
              >
                <Text style={styles.dashControlBtnText}>▶ Resume</Text>
              </TouchableOpacity>
            ) : null}

            {isExecuting && (
              <TouchableOpacity
                onPress={() => mailerEngine.stop()}
                style={[styles.dashControlBtn, { backgroundColor: theme.danger }]}
                activeOpacity={0.8}
              >
                <Text style={styles.dashControlBtnText}>⏹ Stop</Text>
              </TouchableOpacity>
            )}

            {!isExecuting && (
              <TouchableOpacity
                onPress={() => setCurrentStage('config')}
                style={[styles.dashControlBtn, { backgroundColor: theme.accent }]}
                activeOpacity={0.8}
              >
                <Text style={styles.dashControlBtnText}>+ New Campaign</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Terminal output */}
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, marginTop: 12 }]}>
            <View style={styles.terminalHeader}>
              <Text style={[styles.terminalTitle, { color: theme.textSecondary }]}>
                Engine Terminal Output
              </Text>
              <Text style={[styles.terminalCount, { color: theme.textTertiary }]}>
                {engineState.logs.length} events
              </Text>
            </View>
            <LogView logs={engineState.logs} maxHeight={260} />
          </View>
        </ScrollView>
      )}

      {/* ═══════════════════════════════════════════════════════════
           MODAL: COMPANY PICKER DROPDOWN
           ═══════════════════════════════════════════════════════════ */}
      <Modal visible={!!activePickerRowId} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.pickerModalContent, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
            <View style={[styles.pickerModalHeader, { borderBottomColor: theme.border }]}>
              <Text style={[styles.pickerModalTitle, { color: theme.text }]}>Select Company for Limit</Text>
              <TouchableOpacity onPress={() => setActivePickerRowId(null)}>
                <Text style={{ fontSize: 16, color: theme.textSecondary, fontWeight: '700' }}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 320 }}>
              {/* Option 1: Universal Cap (__ALL__) */}
              <TouchableOpacity
                onPress={() => {
                  if (activePickerRowId) updateCompanyLimitRow(activePickerRowId, 'company', '__ALL__');
                  setActivePickerRowId(null);
                }}
                style={[styles.pickerOptionItem, { borderBottomColor: theme.border }]}
              >
                <Text style={[styles.pickerOptionText, { color: theme.accentLight, fontWeight: '700' }]}>
                  🌐 All Companies (Universal Cap)
                </Text>
              </TouchableOpacity>

              {/* Detected Sheet Companies */}
              {detectedCompanies.map((comp) => (
                <TouchableOpacity
                  key={comp}
                  onPress={() => {
                    if (activePickerRowId) updateCompanyLimitRow(activePickerRowId, 'company', comp);
                    setActivePickerRowId(null);
                  }}
                  style={[styles.pickerOptionItem, { borderBottomColor: theme.border }]}
                >
                  <Text style={[styles.pickerOptionText, { color: theme.text }]}>
                    🏢 {comp}
                  </Text>
                </TouchableOpacity>
              ))}

              {detectedCompanies.length === 0 && (
                <View style={{ padding: 14 }}>
                  <Text style={{ color: theme.textTertiary, fontSize: 12, textAlign: 'center' }}>
                    No companies detected in current sheet rows.
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ═══════════════════════════════════════════════════════════
           MODAL: INDEPENDENT TIME PICKER (1-12 Hours, 0-59 Mins, AM/PM)
           ═══════════════════════════════════════════════════════════ */}
      <Modal visible={!!timePickerTarget} animationType="fade" transparent onRequestClose={() => setTimePickerTarget(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.pickerModalContent, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
            {/* Modal Header */}
            <View style={[styles.pickerModalHeader, { borderBottomColor: theme.border }]}>
              <View>
                <Text style={[styles.pickerModalTitle, { color: theme.text }]}>
                  {timePickerTarget === 'start' ? '🕒 Set Start Time (From)' : '🕒 Set End Time (To)'}
                </Text>
                <Text style={{ fontSize: 11, color: theme.textTertiary, marginTop: 2 }}>
                  Choose any hour, minute &amp; period
                </Text>
              </View>
              <TouchableOpacity onPress={() => setTimePickerTarget(null)} style={{ padding: 6 }}>
                <Text style={{ fontSize: 18, color: theme.textSecondary, fontWeight: '700' }}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Glowing Digital Clock Live Preview */}
            <View style={[styles.timeClockBox, { backgroundColor: theme.surface, borderColor: theme.accent }]}>
              <Text style={[styles.timeClockDigit, { color: theme.accentLight }]}>
                {pickerHour}
              </Text>
              <Text style={[styles.timeClockColon, { color: theme.accentLight }]}>:</Text>
              <Text style={[styles.timeClockDigit, { color: theme.accentLight }]}>
                {pickerMinute}
              </Text>
              <View style={[styles.timeClockPeriodBadge, { backgroundColor: theme.accentGlow }]}>
                <Text style={[styles.timeClockPeriodText, { color: theme.accentLight }]}>
                  {pickerPeriod}
                </Text>
              </View>
            </View>

            {/* Quick minute shortcut buttons */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16, marginBottom: 12 }}>
              <Text style={{ fontSize: 10, color: theme.textTertiary, fontWeight: '700' }}>MINUTES:</Text>
              {['00', '15', '30', '45'].map((m) => {
                const isSelected = pickerMinute === m;
                return (
                  <TouchableOpacity
                    key={m}
                    onPress={() => setPickerMinute(m)}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      borderRadius: 8,
                      borderWidth: 1,
                      backgroundColor: isSelected ? theme.accent : theme.surface,
                      borderColor: isSelected ? theme.accent : theme.border,
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '700', color: isSelected ? '#FFF' : theme.textSecondary }}>
                      :{m}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* 3 Interactive Columns: Hours (1-12), Minutes (00-59), Period (AM/PM) */}
            <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 12, height: 190, gap: 10 }}>
              {/* Hours Column */}
              <View style={{ flex: 1.1 }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: theme.textSecondary, marginBottom: 6, textAlign: 'center', textTransform: 'uppercase' }}>
                  Hour (1–12)
                </Text>
                <ScrollView
                  style={{ flex: 1, backgroundColor: theme.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.border }}
                  contentContainerStyle={{ padding: 4 }}
                  showsVerticalScrollIndicator={true}
                >
                  {HOURS_12.map((h) => {
                    const isSelected = pickerHour === h;
                    return (
                      <TouchableOpacity
                        key={h}
                        onPress={() => setPickerHour(h)}
                        style={{
                          paddingVertical: 7,
                          borderRadius: 8,
                          marginVertical: 2,
                          alignItems: 'center',
                          backgroundColor: isSelected ? theme.accent : 'transparent',
                        }}
                      >
                        <Text style={{ fontSize: 14, fontWeight: isSelected ? '800' : '600', color: isSelected ? '#FFF' : theme.text }}>
                          {h}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Minutes Column */}
              <View style={{ flex: 1.1 }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: theme.textSecondary, marginBottom: 6, textAlign: 'center', textTransform: 'uppercase' }}>
                  Min (00–59)
                </Text>
                <ScrollView
                  style={{ flex: 1, backgroundColor: theme.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.border }}
                  contentContainerStyle={{ padding: 4 }}
                  showsVerticalScrollIndicator={true}
                >
                  {MINUTES_60.map((m) => {
                    const isSelected = pickerMinute === m;
                    return (
                      <TouchableOpacity
                        key={m}
                        onPress={() => setPickerMinute(m)}
                        style={{
                          paddingVertical: 7,
                          borderRadius: 8,
                          marginVertical: 2,
                          alignItems: 'center',
                          backgroundColor: isSelected ? theme.accent : 'transparent',
                        }}
                      >
                        <Text style={{ fontSize: 14, fontWeight: isSelected ? '800' : '600', color: isSelected ? '#FFF' : theme.text }}>
                          {m}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Period Column */}
              <View style={{ flex: 0.9 }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: theme.textSecondary, marginBottom: 6, textAlign: 'center', textTransform: 'uppercase' }}>
                  Period
                </Text>
                <View style={{ flex: 1, backgroundColor: theme.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.border, padding: 6, justifyContent: 'space-around' }}>
                  {PERIODS.map((p) => {
                    const isSelected = pickerPeriod === p;
                    return (
                      <TouchableOpacity
                        key={p}
                        onPress={() => setPickerPeriod(p)}
                        style={{
                          paddingVertical: 12,
                          borderRadius: 8,
                          alignItems: 'center',
                          backgroundColor: isSelected ? theme.accent : theme.surfaceElevated,
                          borderWidth: 1,
                          borderColor: isSelected ? theme.accent : theme.border,
                        }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: '900', color: isSelected ? '#FFF' : theme.textSecondary }}>
                          {p}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </View>

            {/* Bottom Actions: Cancel & Confirm */}
            <View style={{ flexDirection: 'row', gap: 10, padding: 14, borderTopWidth: 1, borderTopColor: theme.border }}>
              <TouchableOpacity
                onPress={() => setTimePickerTarget(null)}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 14,
                  alignItems: 'center',
                  backgroundColor: theme.surface,
                  borderWidth: 1,
                  borderColor: theme.border,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: theme.textSecondary }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleConfirmCustomTime}
                style={{
                  flex: 1.6,
                  paddingVertical: 12,
                  borderRadius: 14,
                  alignItems: 'center',
                  backgroundColor: theme.accent,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#FFF' }}>
                  Confirm {pickerHour}:{pickerMinute} {pickerPeriod} ✓
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ═══════════════════════════════════════════════════════════
           MODAL: SELECT / TARGET COMPANIES MULTI-PICKER
           ═══════════════════════════════════════════════════════════ */}
      <Modal visible={showAddCompanyModal} animationType="fade" transparent onRequestClose={() => setShowAddCompanyModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.pickerModalContent, { backgroundColor: theme.surfaceElevated, borderColor: theme.border, maxHeight: '85%' }]}>
            <View style={[styles.pickerModalHeader, { borderBottomColor: theme.border }]}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={[styles.pickerModalTitle, { color: theme.text }]}>🎯 Target Specific Companies</Text>
                <Text style={{ fontSize: 11, color: theme.textTertiary, marginTop: 2 }}>
                  {selectedCompanies.length} of {detectedCompanies.length} companies selected
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowAddCompanyModal(false)} style={{ padding: 4 }}>
                <Text style={{ fontSize: 18, color: theme.textSecondary, fontWeight: '700' }}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Search Input */}
            <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: theme.border }}>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.surface,
                    color: theme.text,
                    borderColor: theme.border,
                    height: 40,
                    paddingHorizontal: 12,
                  },
                ]}
                placeholder="🔍 Search company name..."
                placeholderTextColor={theme.textTertiary}
                value={companySearchQuery}
                onChangeText={setCompanySearchQuery}
                clearButtonMode="while-editing"
              />

              {/* Quick Select / Deselect Bar */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                <TouchableOpacity
                  onPress={selectAllCompanies}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 6,
                    backgroundColor: theme.accentGlow,
                    borderWidth: 1,
                    borderColor: theme.accent,
                  }}
                >
                  <Text style={{ color: theme.accentLight, fontSize: 11, fontWeight: '700' }}>
                    + Select All ({detectedCompanies.length})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={clearSelectedCompanies}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 6,
                    backgroundColor: theme.surfaceElevated,
                    borderWidth: 1,
                    borderColor: theme.border,
                  }}
                >
                  <Text style={{ color: theme.textSecondary, fontSize: 11, fontWeight: '600' }}>
                    ✕ Deselect All
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Company List with Checkboxes */}
            <ScrollView style={{ flexGrow: 0, maxHeight: 340 }}>
              {detectedCompanies
                .filter((c) => c.toLowerCase().includes(companySearchQuery.toLowerCase()))
                .map((comp) => {
                  const isChecked = selectedCompanies.some(
                    (s) => s.toLowerCase() === comp.toLowerCase()
                  );
                  const leadsForComp = activeSheet?.rows
                    ? activeSheet.rows.filter(
                        (r) => (r[companyCol] || '').trim().toLowerCase() === comp.toLowerCase()
                      ).length
                    : 0;

                  return (
                    <TouchableOpacity
                      key={comp}
                      onPress={() => toggleSelectCompany(comp)}
                      style={[
                        styles.pickerOptionItem,
                        {
                          borderBottomColor: theme.border,
                          backgroundColor: isChecked ? theme.accentGlow : 'transparent',
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          paddingVertical: 10,
                        },
                      ]}
                      activeOpacity={0.7}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 8 }}>
                        <View
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 5,
                            borderWidth: 1.5,
                            borderColor: isChecked ? theme.accent : theme.border,
                            backgroundColor: isChecked ? theme.accent : 'transparent',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginRight: 10,
                          }}
                        >
                          {isChecked && <Text style={{ color: '#FFF', fontSize: 13, fontWeight: '900' }}>✓</Text>}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text
                            style={[
                              styles.pickerOptionText,
                              {
                                color: isChecked ? theme.accentLight : theme.text,
                                fontWeight: isChecked ? '700' : '500',
                              },
                            ]}
                            numberOfLines={1}
                          >
                            🏢 {comp}
                          </Text>
                          <Text style={{ fontSize: 10, color: theme.textTertiary }}>
                            {leadsForComp} {leadsForComp === 1 ? 'lead' : 'leads'} in sheet
                          </Text>
                        </View>
                      </View>

                      <View
                        style={{
                          paddingHorizontal: 7,
                          paddingVertical: 2,
                          borderRadius: 4,
                          backgroundColor: isChecked ? theme.accent : theme.surface,
                        }}
                      >
                        <Text style={{ fontSize: 10, fontWeight: '700', color: isChecked ? '#FFF' : theme.textTertiary }}>
                          {isChecked ? 'SELECTED' : 'OFF'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}

              {detectedCompanies.length === 0 && (
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <Text style={{ color: theme.textTertiary, fontSize: 12 }}>
                    No companies detected in sheet leads.
                  </Text>
                </View>
              )}
            </ScrollView>

            {/* Bottom Done Button */}
            <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: theme.border }}>
              <TouchableOpacity
                onPress={() => setShowAddCompanyModal(false)}
                style={[styles.primaryActionBtn, { backgroundColor: theme.accent, height: 42 }]}
              >
                <Text style={styles.primaryActionBtnText}>
                  Done ({selectedCompanies.length} selected) ✓
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  stepPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    flexShrink: 0,
  },
  stepPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  cardHeaderTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  cardDesc: {
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 8,
  },
  segmentContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  segmentBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  schedConfigBox: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  configSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  daysRow: {
    flexDirection: 'row',
    gap: 4,
    marginVertical: 8,
  },
  dayPill: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
  },
  dayPillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  timeRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  col: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  input: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
  },
  fieldHint: {
    fontSize: 10,
    marginTop: 3,
  },
  presetButtonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginVertical: 8,
  },
  presetBtn: {
    width: '48%',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  presetEmoji: {
    fontSize: 16,
    marginBottom: 2,
  },
  presetTitle: {
    fontSize: 11,
    fontWeight: '700',
  },
  presetSub: {
    fontSize: 9,
    marginTop: 1,
  },
  titleWithBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  runLimitTag: {
    fontSize: 11,
    fontWeight: '800',
  },
  limitPillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginVertical: 6,
  },
  limitPill: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 50,
  },
  limitPillText: {
    fontSize: 11,
    fontWeight: '700',
  },

  // Company limits rows
  noticeBox: {
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
  },
  noticeText: {
    fontSize: 11,
  },
  companyRowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
  },
  dropdownBtn: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  dropdownBtnText: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
    marginRight: 4,
  },
  companyLimitInput: {
    width: 65,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 8,
    fontSize: 12,
    textAlign: 'center',
  },
  removeRowBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addLimitBtn: {
    marginTop: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  addLimitBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },

  // Account limit rows
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  accountEmail: {
    fontSize: 12,
    fontWeight: '600',
  },
  accountMeta: {
    fontSize: 10,
    marginTop: 2,
  },
  accountCampInput: {
    width: 85,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 11,
    textAlign: 'center',
  },

  // Switch
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  switchDesc: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },

  // Primary action button
  primaryActionBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    marginTop: 6,
    marginBottom: 20,
  },
  primaryActionBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  // Stage 2: Preview Styles
  summaryGrid: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  summaryItem: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 2,
    borderRadius: 8,
  },
  summaryVal: {
    fontSize: 16,
    fontWeight: '800',
  },
  summaryLbl: {
    fontSize: 8,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginTop: 2,
  },
  warningBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  warningText: {
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 15,
  },
  modeSummaryRow: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
  },
  modeSummaryText: {
    fontSize: 11,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    borderBottomWidth: 1,
  },
  breakdownName: {
    fontSize: 11,
    fontWeight: '600',
    flex: 2,
  },
  breakdownStat: {
    fontSize: 11,
    flex: 1,
    textAlign: 'right',
  },
  senderBreakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  senderBreakdownEmail: {
    fontSize: 12,
    fontWeight: '700',
  },
  senderBreakdownMeta: {
    fontSize: 10,
    marginTop: 2,
  },
  senderAssignedBadge: {
    alignItems: 'flex-end',
  },
  senderAssignedVal: {
    fontSize: 12,
    fontWeight: '800',
  },
  senderAssignedSub: {
    fontSize: 9,
    marginTop: 1,
  },

  // Personalized letter cards
  previewHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pageNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pageNavBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  pageNavText: {
    fontSize: 11,
    fontWeight: '700',
  },
  emailLetterCard: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  letterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 12,
    borderBottomWidth: 1,
  },
  letterMetaCol: {
    flex: 1,
    gap: 3,
    paddingRight: 8,
  },
  metaLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaLabel: {
    fontSize: 10,
    fontWeight: '700',
    width: 60,
  },
  metaValueTo: {
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  metaValueFrom: {
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },
  metaValueSubject: {
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  rotationBadge: {
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  rotationBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  rotationSubText: {
    fontSize: 8,
    fontWeight: '600',
    marginTop: 1,
  },
  letterBodyContainer: {
    padding: 14,
    minHeight: 120, // Generous height, completely responsive without overlapping
  },
  letterBodyText: {
    fontSize: 12,
    lineHeight: 20,
  },
  letterAttachBox: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  letterAttachText: {
    fontSize: 11,
    fontWeight: '600',
  },

  // Preview bottom action buttons
  buttonActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
    marginBottom: 20,
  },
  secondaryActionBtn: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  startCampaignBtn: {
    flex: 2,
    minWidth: 0,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  startCampaignBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  // Stage 3: Dashboard Styles
  statusBadge: {
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    flexShrink: 0,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '800',
  },
  progressContainer: {
    marginBottom: 10,
  },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progTitle: {
    fontSize: 11,
    fontWeight: '700',
  },
  progVal: {
    fontSize: 11,
    fontWeight: '700',
  },
  progBarBg: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  activeSenderNote: {
    fontSize: 10,
    marginTop: 6,
  },
  statCountersRow: {
    flexDirection: 'row',
    marginTop: 6,
  },
  controlsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  dashControlBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dashControlBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '800',
  },
  terminalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  terminalTitle: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  terminalCount: {
    fontSize: 10,
  },

  // Curved Centered Modal & Time Picker Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  pickerModalContent: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 24,
    borderWidth: 1.5,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 12,
  },
  pickerModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  pickerModalTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  pickerOptionItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  pickerOptionText: {
    fontSize: 13,
  },

  // Glowing Digital Clock Display
  timeClockBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 10,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  timeClockDigit: {
    fontSize: 28,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    letterSpacing: 1,
  },
  timeClockColon: {
    fontSize: 24,
    fontWeight: '800',
    marginHorizontal: 4,
  },
  timeClockPeriodBadge: {
    marginLeft: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  timeClockPeriodText: {
    fontSize: 13,
    fontWeight: '900',
  },
  syncSheetBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  syncSheetBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  syncMiniBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncMiniBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  senderActivityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderBottomWidth: 1,
  },
  activePill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  activePillText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: '800',
  },
});
