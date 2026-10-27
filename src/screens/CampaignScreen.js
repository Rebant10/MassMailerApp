import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native';
import { THEME } from '../config/constants';
import StatCard from '../components/StatCard';
import LogView from '../components/LogView';
import { mailerEngine } from '../services/mailerEngine';
import { storage } from '../services/storage';

export default function CampaignScreen({ navigation }) {
  const [engineState, setEngineState] = useState(mailerEngine.state);
  const [activeSheet, setActiveSheet] = useState(null);
  const [activeTemplate, setActiveTemplate] = useState(null);
  const [senders, setSenders] = useState([]);

  useEffect(() => {
    const unsub = mailerEngine.subscribe(setEngineState);
    loadData();
    return unsub;
  }, []);

  const loadData = async () => {
    const [s, t, p] = await Promise.all([
      storage.getActiveSheet(),
      storage.getActiveTemplate(),
      storage.getSenders()
    ]);
    setActiveSheet(s);
    setActiveTemplate(t);
    setSenders(p);
  };

  const startCampaign = async () => {
    if (!activeSheet || !activeSheet.rows || activeSheet.rows.length === 0) {
      Alert.alert('No Sheet Loaded', 'Please go to the "Sheets" tab to connect a Google Sheet or import an Apollo CSV file first.');
      return;
    }
    if (!senders || senders.length === 0) {
      Alert.alert('No Senders Available', 'Please go to the "Inboxes" tab to connect at least one Google account.');
      return;
    }
    if (!activeTemplate || !activeTemplate.subject || !activeTemplate.body) {
      Alert.alert('No Template Ready', 'Please configure your subject line and email body in the "Composer" tab.');
      return;
    }

    const settings = await storage.getSettings();

    mailerEngine.start({
      rows: activeSheet.rows,
      headers: activeSheet.headers,
      template: activeTemplate,
      senders,
      sheetId: activeSheet.sheetId || null,
      sheetName: activeSheet.sheetName || 'Sheet1',
      settings
    });
  };

  const isRunning = engineState.status === 'running';
  const isPaused = engineState.status === 'paused';
  const total = engineState.totalRows || (activeSheet?.rows?.length || 0);
  const progressPercent = total > 0 ? Math.min(100, Math.round((engineState.currentIndex / total) * 100)) : 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Top Banner */}
      <View style={styles.banner}>
        <View>
          <Text style={styles.title}>Mass Mailer</Text>
          <Text style={styles.subtitle}>Mobile Outreach Command Center</Text>
        </View>
        <View style={[styles.statusBadge, isRunning ? styles.badgeActive : isPaused ? styles.badgePaused : styles.badgeIdle]}>
          <Text style={styles.statusText}>{engineState.status.toUpperCase()}</Text>
        </View>
      </View>

      {/* Metrics Grid */}
      <View style={styles.statsGrid}>
        <StatCard title="Total Leads" value={total} color={THEME.cyan} />
        <StatCard title="Sent ✓" value={engineState.sentCount} color={THEME.success} />
        <StatCard title="Failed ✗" value={engineState.failedCount} color={THEME.danger} />
        <StatCard title="Skipped ⏭" value={engineState.skippedCount} color={THEME.warning} />
      </View>

      {/* Progress Section */}
      <View style={styles.progressCard}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressLabel}>Campaign Progress</Text>
          <Text style={styles.progressVal}>{progressPercent}% ({engineState.currentIndex} / {total})</Text>
        </View>
        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
        </View>
        {engineState.currentSenderEmail ? (
          <Text style={styles.activeSenderText}>
            Active Sender: <Text style={{ color: THEME.primaryLight, fontWeight: '700' }}>{engineState.currentSenderEmail}</Text>
          </Text>
        ) : null}
      </View>

      {/* Context info cards */}
      <View style={styles.infoRow}>
        <View style={styles.infoBox}>
          <Text style={styles.infoBoxLabel}>SHEET / DATA</Text>
          <Text style={styles.infoBoxValue} numberOfLines={1}>
            {activeSheet ? (activeSheet.name || activeSheet.sheetName || 'Loaded Sheet') : 'No sheet linked'}
          </Text>
        </View>
        <View style={styles.infoBox}>
          <Text style={styles.infoBoxLabel}>INBOX POOL</Text>
          <Text style={styles.infoBoxValue} numberOfLines={1}>
            {senders.length > 0 ? `${senders.length} account(s) ready` : 'No accounts connected'}
          </Text>
        </View>
      </View>

      {/* Action Controls */}
      <View style={styles.controlsRow}>
        {!isRunning && !isPaused ? (
          <TouchableOpacity onPress={startCampaign} style={[styles.btn, styles.btnStart]}>
            <Text style={styles.btnText}>▶ Start Campaign</Text>
          </TouchableOpacity>
        ) : null}

        {isRunning ? (
          <TouchableOpacity onPress={() => mailerEngine.pause()} style={[styles.btn, styles.btnPause]}>
            <Text style={styles.btnText}>⏸ Pause</Text>
          </TouchableOpacity>
        ) : null}

        {isPaused ? (
          <TouchableOpacity onPress={() => mailerEngine.resume()} style={[styles.btn, styles.btnResume]}>
            <Text style={styles.btnText}>▶ Resume</Text>
          </TouchableOpacity>
        ) : null}

        {isRunning || isPaused ? (
          <TouchableOpacity onPress={() => mailerEngine.stop()} style={[styles.btn, styles.btnStop]}>
            <Text style={styles.btnText}>⏹ Stop</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Real-time Logs Terminal */}
      <View style={styles.logSection}>
        <View style={styles.logHeader}>
          <Text style={styles.logTitle}>Live Activity Terminal</Text>
          <Text style={styles.logCount}>{engineState.logs.length} events</Text>
        </View>
        <LogView logs={engineState.logs} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.bg,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  banner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: THEME.text,
  },
  subtitle: {
    fontSize: 12,
    color: THEME.textMuted,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  badgePaused: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
  },
  badgeIdle: {
    backgroundColor: 'rgba(148, 163, 184, 0.15)',
  },
  statusText: {
    color: THEME.text,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  statsGrid: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  progressCard: {
    backgroundColor: THEME.cardBg,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    marginBottom: 12,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  progressLabel: {
    color: THEME.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  progressVal: {
    color: THEME.text,
    fontSize: 12,
    fontWeight: '700',
  },
  progressBarBg: {
    height: 8,
    backgroundColor: THEME.cardBgLight,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: THEME.primary,
    borderRadius: 4,
  },
  activeSenderText: {
    marginTop: 8,
    fontSize: 11,
    color: THEME.textMuted,
  },
  infoRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  infoBox: {
    flex: 1,
    backgroundColor: THEME.cardBg,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
  },
  infoBoxLabel: {
    color: THEME.textDim,
    fontSize: 9,
    fontWeight: '700',
    marginBottom: 2,
  },
  infoBoxValue: {
    color: THEME.text,
    fontSize: 12,
    fontWeight: '600',
  },
  controlsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  btn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnStart: {
    backgroundColor: THEME.primary,
  },
  btnPause: {
    backgroundColor: THEME.warning,
  },
  btnResume: {
    backgroundColor: THEME.success,
  },
  btnStop: {
    backgroundColor: THEME.danger,
  },
  btnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  logSection: {
    marginTop: 4,
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  logTitle: {
    color: THEME.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  logCount: {
    color: THEME.textDim,
    fontSize: 11,
  },
});
