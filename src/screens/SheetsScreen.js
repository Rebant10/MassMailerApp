import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { THEME } from '../config/constants';
import * as DocumentPicker from 'expo-document-picker';
import { readFileAsText } from '../utils/fileUtils';
import { sheetsService } from '../services/sheets';
import { storage } from '../services/storage';

export default function SheetsScreen() {
  const [sheetUrl, setSheetUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeSheet, setActiveSheet] = useState(null);
  const [tabs, setTabs] = useState([]);
  const [selectedTab, setSelectedTab] = useState('');
  const [mode, setMode] = useState('google'); // 'google' | 'csv'

  useEffect(() => {
    loadSavedSheet();
  }, []);

  const loadSavedSheet = async () => {
    const s = await storage.getActiveSheet();
    if (s) {
      setActiveSheet(s);
      if (s.sheetUrl) setSheetUrl(s.sheetUrl);
      if (s.tabs) setTabs(s.tabs);
      if (s.sheetName) setSelectedTab(s.sheetName);
    }
  };

  const connectGoogleSheet = async () => {
    if (!sheetUrl.trim()) {
      Alert.alert('Missing URL', 'Please paste a valid Google Sheets URL.');
      return;
    }

    const senders = await storage.getSenders();
    if (!senders || senders.length === 0) {
      Alert.alert('Inbox Required', 'Please connect a Google account in the Inboxes tab first to access Google Sheets.');
      return;
    }

    setLoading(true);
    try {
      const { sheetId, tabs } = await sheetsService.fetchMetadata(sheetUrl, senders[0]);
      setTabs(tabs);
      const firstTab = tabs[0]?.name || 'Sheet1';
      setSelectedTab(firstTab);

      const { headers, rows } = await sheetsService.fetchTabRows(sheetId, firstTab, senders[0]);

      const sheetData = {
        name: `Sheet: ${sheetId.substring(0, 8)}…`,
        sheetId,
        sheetUrl,
        sheetName: firstTab,
        tabs,
        headers,
        rows
      };

      await storage.saveActiveSheet(sheetData);
      setActiveSheet(sheetData);
      Alert.alert('Connected', `Loaded tab "${firstTab}" with ${rows.length} rows and ${headers.length} columns.`);
    } catch (e) {
      Alert.alert('Connection Failed', e.message);
    } finally {
      setLoading(false);
    }
  };

  const switchTab = async (tabName) => {
    if (!activeSheet?.sheetId) return;
    const senders = await storage.getSenders();
    setLoading(true);
    try {
      const { headers, rows } = await sheetsService.fetchTabRows(activeSheet.sheetId, tabName, senders[0]);
      const updated = {
        ...activeSheet,
        sheetName: tabName,
        headers,
        rows
      };
      setSelectedTab(tabName);
      setActiveSheet(updated);
      await storage.saveActiveSheet(updated);
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  const pickCsvFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/csv'],
        copyToCacheDirectory: true
      });

      if (res.canceled || !res.assets || !res.assets[0]) return;
      const file = res.assets[0];

      setLoading(true);
      const content = await readFileAsText(file.uri);

      const { headers, rows } = sheetsService.parseCsv(content);

      const sheetData = {
        name: file.name,
        sheetId: null,
        sheetName: file.name,
        tabs: [],
        headers,
        rows
      };

      await storage.saveActiveSheet(sheetData);
      setActiveSheet(sheetData);
      Alert.alert('CSV Imported', `Successfully imported ${rows.length} lead rows from "${file.name}"!`);
    } catch (e) {
      Alert.alert('Import Failed', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Tab toggle: Google Sheet vs Local CSV */}
      <View style={styles.toggleRow}>
        <TouchableOpacity
          onPress={() => setMode('google')}
          style={[styles.toggleBtn, mode === 'google' && styles.toggleBtnActive]}
        >
          <Text style={[styles.toggleText, mode === 'google' && styles.toggleTextActive]}>Google Sheets</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setMode('csv')}
          style={[styles.toggleBtn, mode === 'csv' && styles.toggleBtnActive]}
        >
          <Text style={[styles.toggleText, mode === 'csv' && styles.toggleTextActive]}>Apollo / Local CSV</Text>
        </TouchableOpacity>
      </View>

      {mode === 'google' ? (
        <View style={styles.inputBox}>
          <Text style={styles.inputLabel}>Google Sheet URL or ID</Text>
          <View style={styles.row}>
            <TextInput
              style={styles.input}
              placeholder="https://docs.google.com/spreadsheets/d/..."
              placeholderTextColor={THEME.textDim}
              value={sheetUrl}
              onChangeText={setSheetUrl}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity onPress={connectGoogleSheet} disabled={loading} style={styles.loadBtn}>
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.loadBtnText}>Load</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.csvBox}>
          <Text style={styles.csvTitle}>Import Apollo Data or Lead CSV</Text>
          <Text style={styles.csvDesc}>
            Directly select your Apollo exported CSV or contact spreadsheet. Automatically extracts Email, Company, and contact attributes.
          </Text>
          <TouchableOpacity onPress={pickCsvFile} disabled={loading} style={styles.importBtn}>
            <Text style={styles.importBtnText}>📂 Choose CSV File</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Tabs Selector if multiple sheet tabs exist */}
      {tabs.length > 1 ? (
        <View style={styles.tabsSection}>
          <Text style={styles.sectionTitle}>Select Sheet Tab:</Text>
          <FlatList
            horizontal
            data={tabs}
            keyExtractor={item => String(item.id)}
            showsHorizontalScrollIndicator={false}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => switchTab(item.name)}
                style={[styles.tabChip, selectedTab === item.name && styles.tabChipActive]}
              >
                <Text style={[styles.tabChipText, selectedTab === item.name && styles.tabChipTextActive]}>
                  {item.name}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>
      ) : null}

      {/* Sheet Summary & Leads Preview */}
      {activeSheet ? (
        <View style={styles.previewContainer}>
          <View style={styles.previewHeader}>
            <View>
              <Text style={styles.sheetTitle}>{activeSheet.name}</Text>
              <Text style={styles.sheetMeta}>
                {activeSheet.rows?.length || 0} Leads • {activeSheet.headers?.length || 0} Columns Detected
              </Text>
            </View>
          </View>

          {/* Headers detected */}
          <Text style={styles.detectedLabel}>Detected Column Tags:</Text>
          <View style={styles.chipGrid}>
            {(activeSheet.headers || []).map((h, i) => (
              <View key={i} style={styles.headerChip}>
                <Text style={styles.headerChipText}>{`{${h}}`}</Text>
              </View>
            ))}
          </View>

          {/* Row list preview */}
          <Text style={[styles.detectedLabel, { marginTop: 12 }]}>First 15 Leads Preview:</Text>
          <FlatList
            data={(activeSheet.rows || []).slice(0, 15)}
            keyExtractor={(item, index) => String(item._rowIndex || index)}
            renderItem={({ item, index }) => {
              const email = item.Email || item.email || item['E-mail'] || Object.values(item).find(v => String(v).includes('@')) || '';
              const company = item.Company || item['Company Name'] || item.Organization || '';
              return (
                <View style={styles.leadRow}>
                  <Text style={styles.leadIdx}>#{index + 1}</Text>
                  <View style={styles.leadInfo}>
                    <Text style={styles.leadEmail}>{email || 'No email'}</Text>
                    {company ? <Text style={styles.leadCompany}>{company}</Text> : null}
                  </View>
                  <Text style={[styles.leadStatus, { color: item.Status === 'Sent ✓' ? THEME.success : THEME.textDim }]}>
                    {item.Status || 'Unsent'}
                  </Text>
                </View>
              );
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.bg,
    padding: 16,
  },
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: THEME.cardBg,
    borderRadius: 10,
    padding: 3,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  toggleBtnActive: {
    backgroundColor: THEME.primary,
  },
  toggleText: {
    color: THEME.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  toggleTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  inputBox: {
    backgroundColor: THEME.cardBg,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    marginBottom: 12,
  },
  inputLabel: {
    color: THEME.textMuted,
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: THEME.cardBgLight,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: THEME.text,
    fontSize: 12,
  },
  loadBtn: {
    backgroundColor: THEME.primary,
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  csvBox: {
    backgroundColor: THEME.cardBg,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    marginBottom: 12,
    alignItems: 'center',
  },
  csvTitle: {
    color: THEME.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  csvDesc: {
    color: THEME.textMuted,
    fontSize: 11,
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 16,
  },
  importBtn: {
    backgroundColor: THEME.cyan,
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  importBtnText: {
    color: '#042f2e',
    fontWeight: '700',
    fontSize: 12,
  },
  tabsSection: {
    marginBottom: 10,
  },
  sectionTitle: {
    color: THEME.textMuted,
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
  },
  tabChip: {
    backgroundColor: THEME.cardBgLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 6,
  },
  tabChipActive: {
    backgroundColor: THEME.primary,
  },
  tabChipText: {
    color: THEME.textMuted,
    fontSize: 11,
  },
  tabChipTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  previewContainer: {
    flex: 1,
    backgroundColor: THEME.cardBg,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
  },
  previewHeader: {
    marginBottom: 8,
  },
  sheetTitle: {
    color: THEME.text,
    fontSize: 14,
    fontWeight: '700',
  },
  sheetMeta: {
    color: THEME.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  detectedLabel: {
    color: THEME.textDim,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  headerChip: {
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  headerChipText: {
    color: THEME.primaryLight,
    fontSize: 10,
    fontWeight: '600',
  },
  leadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  leadIdx: {
    color: THEME.textDim,
    fontSize: 10,
    width: 28,
  },
  leadInfo: {
    flex: 1,
  },
  leadEmail: {
    color: THEME.text,
    fontSize: 12,
    fontWeight: '600',
  },
  leadCompany: {
    color: THEME.textMuted,
    fontSize: 10,
  },
  leadStatus: {
    fontSize: 10,
    fontWeight: '600',
  },
});
