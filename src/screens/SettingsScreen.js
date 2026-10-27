/**
 * SettingsScreen — Theme selection, anti-spam rules, safeguards, and OAuth configuration
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Switch,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { storage } from '../services/storage';
import { oauthService } from '../services/oauth';
import { foregroundService } from '../services/foregroundService';

export default function SettingsScreen() {
  const { theme, themeMode, setThemeMode, paletteId, setPaletteId, palettes } = useTheme();

  const [delayMin, setDelayMin] = useState('10');
  const [delayMax, setDelayMax] = useState('20');
  const [companyLimitAll, setCompanyLimitAll] = useState('');
  const [duplicateProtection, setDuplicateProtection] = useState(true);
  const [webClientId, setWebClientId] = useState('');
  const [webClientSecret, setWebClientSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const s = await storage.getSettings();
    if (s) {
      setDelayMin(String(s.delayMin || 10));
      setDelayMax(String(s.delayMax || 20));
      setCompanyLimitAll(
        s.companyLimitAll !== null && s.companyLimitAll !== undefined
          ? String(s.companyLimitAll)
          : ''
      );
      setDuplicateProtection(s.duplicateProtection !== false);
      setWebClientId(s.webClientId || '');
      setWebClientSecret(s.webClientSecret || '');
    }
  };

  const saveSettings = async () => {
    const minVal = parseInt(delayMin, 10) || 5;
    const maxVal = parseInt(delayMax, 10) || 15;

    if (minVal > maxVal) {
      Alert.alert('Invalid Delay', 'Minimum delay cannot be greater than maximum delay.');
      return;
    }

    const current = await storage.getSettings();
    const updated = {
      ...current,
      delayMin: minVal,
      delayMax: maxVal,
      companyLimitAll: companyLimitAll ? parseInt(companyLimitAll, 10) : null,
      duplicateProtection,
      webClientId: webClientId.trim(),
      webClientSecret: webClientSecret.trim(),
    };

    await storage.saveSettings(updated);
    Alert.alert('Saved ✨', 'Preferences, anti-spam rules, and credentials updated successfully!');
  };

  const paletteList = Object.values(palettes);

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.bg }]} contentContainerStyle={styles.content}>
      {/* Top Header */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: theme.text }]}>Settings & Rules</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Personalization, safeguards, and outreach pacing
          </Text>
        </View>
        <TouchableOpacity
          onPress={saveSettings}
          style={[styles.saveBtn, { backgroundColor: theme.accent }]}
          activeOpacity={0.8}
        >
          <Text style={styles.saveBtnText}>Save</Text>
        </TouchableOpacity>
      </View>

      {/* 1. Theme & Aesthetic Palettes Card */}
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>🎨 Appearance & Aesthetic Drop</Text>
        <Text style={[styles.cardDesc, { color: theme.textSecondary }]}>
          Choose your interface mode and curated aesthetic palette.
        </Text>

        {/* Dark / Light / System Mode Toggle */}
        <Text style={[styles.subLabel, { color: theme.textSecondary }]}>MODE</Text>
        <View style={styles.modeToggleRow}>
          {[
            { key: 'dark', label: '🌙 Dark' },
            { key: 'light', label: '☀️ Light' },
            { key: 'system', label: '📱 System' },
          ].map((m) => {
            const isActive = themeMode === m.key;
            return (
              <TouchableOpacity
                key={m.key}
                onPress={() => setThemeMode(m.key)}
                style={[
                  styles.modeBtn,
                  {
                    backgroundColor: isActive ? theme.accent : theme.surfaceElevated,
                    borderColor: isActive ? theme.accentLight : theme.border,
                  },
                ]}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    styles.modeBtnText,
                    { color: isActive ? '#FFFFFF' : theme.textSecondary, fontWeight: isActive ? '700' : '500' },
                  ]}
                >
                  {m.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* 4 Curated Unified Palettes */}
        <Text style={[styles.subLabel, { color: theme.textSecondary, marginTop: 14 }]}>
          AESTHETIC PALETTE
        </Text>
        <View style={styles.palettesGrid}>
          {paletteList.map((p) => {
            const isSelected = paletteId === p.id;
            return (
              <TouchableOpacity
                key={p.id}
                onPress={() => setPaletteId(p.id)}
                style={[
                  styles.paletteCard,
                  {
                    backgroundColor: theme.surfaceElevated,
                    borderColor: isSelected ? theme.accent : theme.border,
                    borderWidth: isSelected ? 2 : 1,
                  },
                ]}
                activeOpacity={0.7}
              >
                <View style={styles.paletteHeader}>
                  <View style={[styles.colorDot, { backgroundColor: p.primaryColor }]} />
                  <Text style={[styles.paletteName, { color: theme.text }]}>
                    {p.emoji} {p.name}
                  </Text>
                </View>
                <Text style={[styles.paletteVibe, { color: theme.textTertiary }]}>
                  {p.vibe}
                </Text>
                {isSelected && (
                  <View style={[styles.selectedPill, { backgroundColor: theme.accentGlow }]}>
                    <Text style={[styles.selectedPillText, { color: theme.accentLight }]}>
                      ✓ Active
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* 2. Evergreen Safeguards & Targeting Defaults */}
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>🛡 Evergreen Safeguards & Defaults</Text>
        <Text style={[styles.cardDesc, { color: theme.textSecondary }]}>
          Global protections applied across your campaigns. You can also fine-tune them on the Send tab per run.
        </Text>

        {/* Duplicate Email Protection */}
        <View style={styles.switchRow}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text style={[styles.switchLabel, { color: theme.text }]}>Duplicate Email Protection</Text>
            <Text style={[styles.switchDesc, { color: theme.textTertiary }]}>
              Automatically bypass recipients already emailed in this or previous campaigns.
            </Text>
          </View>
          <Switch
            value={duplicateProtection}
            onValueChange={setDuplicateProtection}
            trackColor={{ false: theme.surfaceElevated, true: theme.accent }}
            thumbColor="#FFFFFF"
          />
        </View>

        {/* Universal Company Cap */}
        <View style={{ marginTop: 14 }}>
          <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>
            Universal Company Cap (Max emails per company)
          </Text>
          <TextInput
            style={[
              styles.input,
              { backgroundColor: theme.surfaceElevated, color: theme.text, borderColor: theme.border },
            ]}
            placeholder="e.g. 1 or 2 (leave blank for unlimited)"
            placeholderTextColor={theme.textTertiary}
            keyboardType="number-pad"
            value={companyLimitAll}
            onChangeText={setCompanyLimitAll}
          />
          <Text style={[styles.fieldHint, { color: theme.textTertiary }]}>
            Ensures you never send more than X emails to people at the exact same company.
          </Text>
        </View>

        {/* Default Pacing Delay */}
        <View style={{ marginTop: 14 }}>
          <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Default Pacing Delay Range</Text>
          <View style={styles.row}>
            <View style={styles.col}>
              <Text style={[styles.inputSubLabel, { color: theme.textTertiary }]}>Min (seconds)</Text>
              <TextInput
                style={[
                  styles.input,
                  { backgroundColor: theme.surfaceElevated, color: theme.text, borderColor: theme.border },
                ]}
                keyboardType="number-pad"
                value={delayMin}
                onChangeText={setDelayMin}
              />
            </View>
            <View style={styles.col}>
              <Text style={[styles.inputSubLabel, { color: theme.textTertiary }]}>Max (seconds)</Text>
              <TextInput
                style={[
                  styles.input,
                  { backgroundColor: theme.surfaceElevated, color: theme.text, borderColor: theme.border },
                ]}
                keyboardType="number-pad"
                value={delayMax}
                onChangeText={setDelayMax}
              />
            </View>
          </View>
        </View>
      </View>

      {/* 3. Android Background Execution & Battery Optimization */}
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>🔋 Background Execution & Battery</Text>
        <Text style={[styles.cardDesc, { color: theme.textSecondary }]}>
          Keep Mass Mailer dispatching campaigns when your phone is locked or another app is open.
        </Text>

        <View style={{ gap: 10, marginTop: 10 }}>
          <TouchableOpacity
            onPress={async () => {
              const granted = await foregroundService.requestPermission();
              Alert.alert(
                granted ? 'Notifications Allowed ✓' : 'Permission Required',
                granted
                  ? 'Notification permissions are active. The campaign foreground service will show ongoing progress.'
                  : 'Please enable notifications in system settings so the foreground service stays alive.'
              );
            }}
            style={[styles.saveBtn, { backgroundColor: theme.surfaceElevated, borderColor: theme.border, borderWidth: 1, paddingVertical: 10 }]}
            activeOpacity={0.8}
          >
            <Text style={[styles.saveBtnText, { color: theme.text }]}>🔔 Test / Grant Notification Permission</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={async () => {
              await foregroundService.openBatteryOptimizationSettings();
            }}
            style={[styles.saveBtn, { backgroundColor: theme.accentGlow, borderColor: theme.accent, borderWidth: 1, paddingVertical: 10 }]}
            activeOpacity={0.8}
          >
            <Text style={[styles.saveBtnText, { color: theme.accentLight }]}>⚡ Open Battery Optimization (Set to Unrestricted)</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 4. Google OAuth Credentials */}
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>🔑 Custom Google OAuth Credentials</Text>
        <Text style={[styles.cardDesc, { color: theme.textSecondary }]}>
          Web OAuth Client credentials issue permanent refresh tokens so you never get logged out after 1 hour.
        </Text>

        <View style={{ marginTop: 8 }}>
          <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Web Client ID</Text>
          <TextInput
            style={[
              styles.input,
              { backgroundColor: theme.surfaceElevated, color: theme.text, borderColor: theme.border },
            ]}
            placeholder="xxxx.apps.googleusercontent.com"
            placeholderTextColor={theme.textTertiary}
            value={webClientId}
            onChangeText={setWebClientId}
            autoCapitalize="none"
          />
        </View>

        <View style={{ marginTop: 12 }}>
          <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>
            Web Client Secret (Permanent Session Auth)
          </Text>
          <View style={styles.secretRow}>
            <TextInput
              style={[
                styles.input,
                { flex: 1, backgroundColor: theme.surfaceElevated, color: theme.text, borderColor: theme.border },
              ]}
              placeholder="GOCSPX-xxxxxxxxxxxxxxxx"
              placeholderTextColor={theme.textTertiary}
              secureTextEntry={!showSecret}
              value={webClientSecret}
              onChangeText={setWebClientSecret}
              autoCapitalize="none"
            />
            <TouchableOpacity
              onPress={() => setShowSecret(!showSecret)}
              style={[styles.eyeBtn, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}
            >
              <Text style={{ fontSize: 13 }}>{showSecret ? '🙈' : '👁'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Redirect URI Info Box */}
        <View style={{ marginTop: 14, padding: 12, borderRadius: 10, backgroundColor: theme.surfaceElevated, borderWidth: 1, borderColor: theme.border }}>
          <Text style={[styles.inputLabel, { color: theme.accentLight, fontWeight: '700' }]}>
            Authorized Redirect URI for Google Cloud Console:
          </Text>
          <Text style={{ color: theme.text, fontSize: 12, fontFamily: 'monospace', marginVertical: 4 }} selectable>
            {oauthService.getRedirectUri()}
          </Text>
          <Text style={[styles.fieldHint, { color: theme.textTertiary, marginTop: 4 }]}>
            In Google Cloud Console, click the pencil icon next to your Web application client (e.g. "Mass Mailer Multi") and ensure this exact URI is listed under "Authorized redirect URIs".
          </Text>
        </View>
      </View>

      {/* 5. Background Execution & Android Battery Settings */}
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>⚡ Persistent Background Service</Text>
        <Text style={[styles.cardDesc, { color: theme.textSecondary }]}>
          Campaigns run as an Android Foreground Service with live notifications. Sending continues uninterrupted even if you lock your screen, switch apps, or swipe Mass Mailer from Recent Apps.
        </Text>

        <View style={[styles.bgFeatureRow, { borderBottomColor: theme.border }]}>
          <Text style={[styles.bgFeatureTitle, { color: theme.text }]}>✓ Persistent Notification</Text>
          <Text style={[styles.bgFeatureDesc, { color: theme.textTertiary }]}>
            Live progress and instant Pause / Stop controls in your notification tray and lock screen.
          </Text>
        </View>

        <View style={styles.bgFeatureRow}>
          <Text style={[styles.bgFeatureTitle, { color: theme.text }]}>✓ Swipe-Away Protection</Text>
          <Text style={[styles.bgFeatureDesc, { color: theme.textTertiary }]}>
            Background service stays running until your campaign finishes or you tap Stop.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 48,
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
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  saveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  card: {
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 12,
  },
  subLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  modeToggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  modeBtnText: {
    fontSize: 12,
  },
  palettesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  paletteCard: {
    width: '48%',
    borderRadius: 10,
    padding: 10,
  },
  paletteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  paletteName: {
    fontSize: 12,
    fontWeight: '700',
  },
  paletteVibe: {
    fontSize: 9,
    lineHeight: 13,
  },
  selectedPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 6,
  },
  selectedPillText: {
    fontSize: 9,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  col: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
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
    marginTop: 4,
    lineHeight: 14,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  switchLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  switchDesc: {
    fontSize: 10,
    marginTop: 2,
    lineHeight: 14,
  },
  secretRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  eyeBtn: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bgFeatureRow: {
    paddingVertical: 8,
  },
  bgFeatureTitle: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  bgFeatureDesc: {
    fontSize: 11,
    lineHeight: 16,
  },
});
