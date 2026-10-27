/**
 * DataScreen — Manage multiple lead data sources (Google Sheets + CSVs)
 * Features rich Lead Inspector: view all sheet columns, sent status, timestamps, senders, and attachments.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Modal,
  RefreshControl,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import * as DocumentPicker from 'expo-document-picker';
import { readFileAsText } from '../utils/fileUtils';
import { sheetsService } from '../services/sheets';
import { storage } from '../services/storage';
import SourceCard from '../components/SourceCard';

export default function DataScreen() {
  const { theme } = useTheme();
  const [sources, setSources] = useState([]);
  const [combinedLeads, setCombinedLeads] = useState({ headers: [], rows: [], totalLeads: 0, sourceCount: 0 });
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addMode, setAddMode] = useState('google'); // 'google' | 'csv'
  const [sheetUrl, setSheetUrl] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Rich Lead Inspector Modal state
  const [previewSource, setPreviewSource] = useState(null);
  const [previewSearch, setPreviewSearch] = useState('');
  const [previewFilter, setPreviewFilter] = useState('all'); // 'all' | 'sent' | 'unsent' | 'failed'
  const [expandedLeadIndex, setExpandedLeadIndex] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const srcs = await storage.getDataSources();
    setSources(srcs);
    const combined = await storage.getCombinedLeads();
    setCombinedLeads(combined);
  };

  const handleAddGoogleSheet = async () => {
    if (!sheetUrl.trim()) {
      Alert.alert('Missing URL', 'Please paste a valid Google Sheets URL.');
      return;
    }

    const senders = await storage.getSenders();
    if (!senders || senders.length === 0) {
      Alert.alert('Account Required', 'Please connect a Google account in the Accounts tab first.');
      return;
    }

    setLoading(true);
    try {
      const { sheetId, tabs } = await sheetsService.fetchMetadata(sheetUrl, senders[0]);
      const firstTab = tabs[0]?.name || 'Sheet1';
      const { headers, rows } = await sheetsService.fetchTabRows(sheetId, firstTab, senders[0]);

      const newSource = {
        id: 'src_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        type: 'google',
        name: `Sheet: ${sheetId.substring(0, 12)}…`,
        sheetId,
        sheetUrl: sheetUrl.trim(),
        sheetName: firstTab,
        tabs,
        headers,
        rows,
        importedAt: new Date().toISOString(),
      };

      const updated = await storage.addDataSource(newSource);
      setSources(updated);
      const combined = await storage.getCombinedLeads();
      setCombinedLeads(combined);

      setShowAddModal(false);
      setSheetUrl('');
      Alert.alert('Sheet Connected', `Loaded "${firstTab}" with ${rows.length} leads and ${headers.length} columns.`);
    } catch (e) {
      Alert.alert('Connection Failed', e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddCsv = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/csv'],
        copyToCacheDirectory: true,
      });

      if (res.canceled || !res.assets || !res.assets[0]) return;
      const file = res.assets[0];

      setLoading(true);
      const content = await readFileAsText(file.uri);
      const { headers, rows } = sheetsService.parseCsv(content);

      const newSource = {
        id: 'src_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        type: 'csv',
        name: file.name,
        sheetId: null,
        sheetUrl: null,
        sheetName: file.name,
        tabs: [],
        headers,
        rows,
        importedAt: new Date().toISOString(),
      };

      const updated = await storage.addDataSource(newSource);
      setSources(updated);
      const combined = await storage.getCombinedLeads();
      setCombinedLeads(combined);

      setShowAddModal(false);
      Alert.alert('CSV Imported', `${rows.length} leads imported from "${file.name}"!`);
    } catch (e) {
      Alert.alert('Import Failed', e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveSource = (id) => {
    Alert.alert(
      'Remove Data Source',
      'Are you sure? This list of leads will be removed from your campaign queue.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const updated = await storage.removeDataSource(id);
            setSources(updated);
            const combined = await storage.getCombinedLeads();
            setCombinedLeads(combined);
          },
        },
      ]
    );
  };

  const handleRefreshSource = async (src) => {
    if (src.type !== 'google') return;
    setLoading(true);
    try {
      const senders = await storage.getSenders();
      if (!senders || senders.length === 0) {
        Alert.alert('Notice', 'No sender connected to refresh sheet.');
        return;
      }
      const { headers, rows } = await sheetsService.fetchTabRows(src.sheetId, src.sheetName, senders[0]);
      const updated = await storage.updateDataSource(src.id, {
        headers,
        rows,
        importedAt: new Date().toISOString(),
      });
      setSources(updated);
      const combined = await storage.getCombinedLeads();
      setCombinedLeads(combined);
      if (previewSource && previewSource.id === src.id) {
        setPreviewSource({ ...src, headers, rows });
      }
      Alert.alert('Refreshed ✓', `Synced ${rows.length} rows from Google Sheet ("${src.sheetName || 'Sheet1'}").`);
    } catch (e) {
      Alert.alert('Sync Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncAllSources = async () => {
    const googleSources = sources.filter((s) => s.type === 'google' && s.sheetId);
    if (googleSources.length === 0) {
      await loadData();
      Alert.alert('Refreshed', 'Lead queue reloaded.');
      return;
    }
    setRefreshing(true);
    try {
      const senders = await storage.getSenders();
      if (!senders || senders.length === 0) {
        Alert.alert('Notice', 'No connected Google account found in Inboxes tab.');
        return;
      }
      let totalSynced = 0;
      let currentSrcs = sources;
      for (const src of googleSources) {
        const { headers, rows } = await sheetsService.fetchTabRows(src.sheetId, src.sheetName || 'Sheet1', senders[0]);
        currentSrcs = await storage.updateDataSource(src.id, {
          headers,
          rows,
          importedAt: new Date().toISOString(),
        });
        totalSynced += rows.length;
        if (previewSource && previewSource.id === src.id) {
          setPreviewSource({ ...src, headers, rows });
        }
      }
      setSources(currentSrcs);
      const combined = await storage.getCombinedLeads();
      setCombinedLeads(combined);
      Alert.alert(
        'Sync Complete ✓',
        `Successfully updated ${googleSources.length} Google Sheet(s) with ${totalSynced} leads.`
      );
    } catch (e) {
      Alert.alert('Sync Failed', e.message);
    } finally {
      setRefreshing(false);
    }
  };

  // ─── Filtered Leads for Preview ───
  const allPreviewRows = previewSource?.rows || [];
  const totalInPreview = allPreviewRows.length;
  const sentCountInPreview = allPreviewRows.filter(r => String(r.Status || '').trim() === 'Sent ✓').length;
  const failedCountInPreview = allPreviewRows.filter(r => String(r.Status || '').includes('Failed')).length;
  const unsentCountInPreview = totalInPreview - sentCountInPreview - failedCountInPreview;

  const filteredPreviewRows = allPreviewRows.filter((r, idx) => {
    const status = String(r.Status || '').trim();
    if (previewFilter === 'sent' && status !== 'Sent ✓') return false;
    if (previewFilter === 'failed' && !status.includes('Failed')) return false;
    if (previewFilter === 'unsent' && (status === 'Sent ✓' || status.includes('Failed'))) return false;

    if (previewSearch.trim()) {
      const q = previewSearch.toLowerCase();
      const match = Object.values(r).some(v => String(v || '').toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* Top Header */}
      <View style={styles.header}>
        <View style={{ flex: 1, paddingRight: 10 }}>
          <Text style={[styles.title, { color: theme.text }]}>Lead Data Sources</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]} numberOfLines={1}>
            Google Sheets & CSV imports merge automatically
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {sources.some((s) => s.type === 'google') && (
            <TouchableOpacity
              onPress={handleSyncAllSources}
              disabled={refreshing}
              style={[styles.syncHeaderBtn, { backgroundColor: theme.infoGlow, borderColor: theme.info }]}
              activeOpacity={0.8}
            >
              {refreshing ? (
                <ActivityIndicator size="small" color={theme.info} />
              ) : (
                <Text style={[styles.syncHeaderBtnText, { color: theme.info }]}>🔄 Sync All</Text>
              )}
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => setShowAddModal(true)}
            style={[styles.addBtn, { backgroundColor: theme.accent }]}
            activeOpacity={0.8}
          >
            <Text style={styles.addBtnText}>+ Add Leads</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={sources}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleSyncAllSources}
            tintColor={theme.accent}
            colors={[theme.accent]}
          />
        }
        ListHeaderComponent={
          sources.length > 0 ? (
            <View style={[styles.combinedCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.combinedTitle, { color: theme.text }]}>Merged Queue Overview</Text>
              <View style={styles.combinedStats}>
                <View style={styles.combinedStat}>
                  <Text style={[styles.combinedStatValue, { color: theme.accentLight }]}>
                    {combinedLeads.totalLeads}
                  </Text>
                  <Text style={[styles.combinedStatLabel, { color: theme.textSecondary }]}>Total Leads</Text>
                </View>
                <View style={styles.combinedStat}>
                  <Text style={[styles.combinedStatValue, { color: theme.info }]}>
                    {combinedLeads.headers.length}
                  </Text>
                  <Text style={[styles.combinedStatLabel, { color: theme.textSecondary }]}>Columns</Text>
                </View>
                <View style={styles.combinedStat}>
                  <Text style={[styles.combinedStatValue, { color: theme.success }]}>
                    {combinedLeads.sourceCount}
                  </Text>
                  <Text style={[styles.combinedStatLabel, { color: theme.textSecondary }]}>Sources</Text>
                </View>
              </View>

              <View style={styles.chipRow}>
                {combinedLeads.headers.slice(0, 8).map((h) => (
                  <View key={h} style={[styles.chip, { backgroundColor: theme.surfaceElevated }]}>
                    <Text style={[styles.chipText, { color: theme.textSecondary }]}>{h}</Text>
                  </View>
                ))}
                {combinedLeads.headers.length > 8 && (
                  <View style={[styles.chip, { backgroundColor: theme.surfaceElevated }]}>
                    <Text style={[styles.chipText, { color: theme.textTertiary }]}>
                      +{combinedLeads.headers.length - 8} more
                    </Text>
                  </View>
                )}
              </View>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <SourceCard
            source={item}
            onRemove={handleRemoveSource}
            onRefresh={handleRefreshSource}
            onPreview={(src) => {
              setPreviewSource(src);
              setPreviewSearch('');
              setPreviewFilter('all');
              setExpandedLeadIndex(null);
            }}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📊</Text>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No Leads Imported</Text>
            <Text style={[styles.emptyDesc, { color: theme.textSecondary }]}>
              Connect a Google Sheet or import an Apollo CSV to begin your cold outreach campaign.
            </Text>
          </View>
        }
      />

      {/* Add Source Modal */}
      <Modal visible={showAddModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.surfaceElevated }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Import Lead Data</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Text style={[styles.modalClose, { color: theme.textSecondary }]}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.toggleRow}>
              <TouchableOpacity
                onPress={() => setAddMode('google')}
                style={[styles.toggleBtn, addMode === 'google' && { backgroundColor: theme.accent }]}
              >
                <Text style={[styles.toggleText, { color: addMode === 'google' ? '#FFF' : theme.textSecondary }]}>
                  Google Sheets
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setAddMode('csv')}
                style={[styles.toggleBtn, addMode === 'csv' && { backgroundColor: theme.accent }]}
              >
                <Text style={[styles.toggleText, { color: addMode === 'csv' ? '#FFF' : theme.textSecondary }]}>
                  Local CSV
                </Text>
              </TouchableOpacity>
            </View>

            {addMode === 'google' ? (
              <View style={styles.modalBody}>
                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Google Sheet URL or ID</Text>
                <TextInput
                  style={[styles.modalInput, { backgroundColor: theme.surface, color: theme.text, borderColor: theme.border }]}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  placeholderTextColor={theme.textTertiary}
                  value={sheetUrl}
                  onChangeText={setSheetUrl}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  onPress={handleAddGoogleSheet}
                  disabled={loading}
                  style={[styles.modalActionBtn, { backgroundColor: theme.accent }]}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text style={styles.modalActionBtnText}>Connect Sheet</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.modalBody}>
                <Text style={[styles.modalDesc, { color: theme.textSecondary }]}>
                  Select a CSV file from your device. Apollo exports, contact lists, and standard spreadsheets are supported.
                </Text>
                <TouchableOpacity
                  onPress={handleAddCsv}
                  disabled={loading}
                  style={[styles.modalActionBtn, { backgroundColor: theme.info }]}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text style={styles.modalActionBtnText}>📂 Choose CSV File</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* ─── Rich Lead Inspector Modal ─── */}
      <Modal visible={!!previewSource} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.inspectorContainer, { backgroundColor: theme.surfaceElevated }]}>
            {/* Modal Header */}
            <View style={[styles.modalHeader, { borderBottomColor: theme.border, paddingBottom: 10 }]}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={[styles.modalTitle, { color: theme.text }]} numberOfLines={1}>
                  📋 {previewSource?.name}
                </Text>
                <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]}>
                  {totalInPreview} total leads • {previewSource?.headers?.length || 0} sheet columns
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {previewSource?.type === 'google' && (
                  <TouchableOpacity
                    onPress={() => handleRefreshSource(previewSource)}
                    style={[styles.modalSyncBtn, { backgroundColor: theme.infoGlow }]}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.modalSyncBtnText, { color: theme.info }]}>🔄 Sync</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={() => setPreviewSource(null)}
                  style={[styles.closeIconBtn, { backgroundColor: theme.surface }]}
                >
                  <Text style={[styles.modalClose, { color: theme.textSecondary }]}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Quick Filter Counts */}
            <View style={styles.filterBar}>
              <TouchableOpacity
                onPress={() => setPreviewFilter('all')}
                style={[
                  styles.filterPill,
                  { backgroundColor: previewFilter === 'all' ? theme.accent : theme.surface },
                ]}
              >
                <Text style={[styles.filterPillText, { color: previewFilter === 'all' ? '#FFF' : theme.textSecondary }]}>
                  All ({totalInPreview})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setPreviewFilter('sent')}
                style={[
                  styles.filterPill,
                  { backgroundColor: previewFilter === 'sent' ? theme.success : theme.surface },
                ]}
              >
                <Text style={[styles.filterPillText, { color: previewFilter === 'sent' ? '#FFF' : theme.textSecondary }]}>
                  Sent ({sentCountInPreview})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setPreviewFilter('unsent')}
                style={[
                  styles.filterPill,
                  { backgroundColor: previewFilter === 'unsent' ? theme.accentLight : theme.surface },
                ]}
              >
                <Text style={[styles.filterPillText, { color: previewFilter === 'unsent' ? '#FFF' : theme.textSecondary }]}>
                  Unsent ({unsentCountInPreview})
                </Text>
              </TouchableOpacity>
              {failedCountInPreview > 0 && (
                <TouchableOpacity
                  onPress={() => setPreviewFilter('failed')}
                  style={[
                    styles.filterPill,
                    { backgroundColor: previewFilter === 'failed' ? theme.danger : theme.surface },
                  ]}
                >
                  <Text style={[styles.filterPillText, { color: previewFilter === 'failed' ? '#FFF' : theme.textSecondary }]}>
                    Failed ({failedCountInPreview})
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Search filter input */}
            <View style={[styles.searchBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={{ marginRight: 6 }}>🔍</Text>
              <TextInput
                style={[styles.searchInput, { color: theme.text }]}
                placeholder="Search by name, email, company, title..."
                placeholderTextColor={theme.textTertiary}
                value={previewSearch}
                onChangeText={setPreviewSearch}
              />
              {previewSearch.length > 0 && (
                <TouchableOpacity onPress={() => setPreviewSearch('')}>
                  <Text style={{ color: theme.textTertiary, paddingHorizontal: 4 }}>✕</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Leads FlatList with Rich Data Rows */}
            <FlatList
              data={filteredPreviewRows}
              keyExtractor={(_, index) => String(index)}
              contentContainerStyle={{ paddingBottom: 24 }}
              renderItem={({ item, index }) => {
                const email = item.Email || item.email || item['E-mail'] || item['Email Address'] || '';
                const name = item.Name || item['First Name'] || item['Full Name'] || item.name || '';
                const company = item.Company || item['Company Name'] || item.Organization || '';
                const role = item.Title || item.Role || item['Job Title'] || item.Position || '';
                const status = String(item.Status || 'Unsent').trim();
                const sentAt = item['Sent At'] || item['Sent Date'] || item.Timestamp || item.Date;
                const sentFrom = item['Sent From'] || item.Sender || item['Sender Email'];
                const attachmentName = item.Attachment || item.attachment;
                const isExpanded = expandedLeadIndex === index;

                // Color code status badge
                const isSent = status === 'Sent ✓';
                const isFailed = status.includes('Failed');
                const isSkipped = status.includes('Skipped');

                return (
                  <View style={[styles.leadCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    {/* Header Row */}
                    <View style={styles.leadCardHeader}>
                      <View style={styles.leadHeaderLeft}>
                        <Text style={[styles.leadIndexBadge, { backgroundColor: theme.surfaceElevated, color: theme.textTertiary }]}>
                          #{index + 1}
                        </Text>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.leadEmail, { color: theme.text }]} numberOfLines={1}>
                            {email || '(No email)'}
                          </Text>
                          {(name || company) ? (
                            <Text style={[styles.leadSubtext, { color: theme.textSecondary }]} numberOfLines={1}>
                              {[name, role, company].filter(Boolean).join(' • ')}
                            </Text>
                          ) : null}
                        </View>
                      </View>

                      {/* Status badge */}
                      <View
                        style={[
                          styles.leadStatusBadge,
                          {
                            backgroundColor: isSent
                              ? theme.successGlow
                              : isFailed
                              ? theme.dangerGlow
                              : isSkipped
                              ? theme.warningGlow
                              : theme.surfaceElevated,
                            borderColor: isSent
                              ? theme.success
                              : isFailed
                              ? theme.danger
                              : isSkipped
                              ? theme.warning
                              : theme.border,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.leadStatusText,
                            {
                              color: isSent
                                ? theme.success
                                : isFailed
                                ? theme.danger
                                : isSkipped
                                ? theme.warning
                                : theme.textTertiary,
                            },
                          ]}
                        >
                          {status || 'Unsent'}
                        </Text>
                      </View>
                    </View>

                    {/* Campaign Dispatch Metadata Row (Sent Time, Sent From, Attachment) */}
                    {(sentAt || sentFrom || attachmentName) && (
                      <View style={[styles.dispatchMetaBox, { backgroundColor: theme.surfaceElevated }]}>
                        {sentAt && (
                          <View style={styles.dispatchMetaItem}>
                            <Text style={[styles.metaLabel, { color: theme.textTertiary }]}>🕒 Sent At:</Text>
                            <Text style={[styles.metaValue, { color: theme.text }]}>{sentAt}</Text>
                          </View>
                        )}
                        {sentFrom && (
                          <View style={styles.dispatchMetaItem}>
                            <Text style={[styles.metaLabel, { color: theme.textTertiary }]}>👤 Sent From:</Text>
                            <Text style={[styles.metaValue, { color: theme.accentLight }]}>{sentFrom}</Text>
                          </View>
                        )}
                        {attachmentName && (
                          <View style={styles.dispatchMetaItem}>
                            <Text style={[styles.metaLabel, { color: theme.textTertiary }]}>📎 File:</Text>
                            <Text style={[styles.metaValue, { color: theme.info }]}>{attachmentName}</Text>
                          </View>
                        )}
                      </View>
                    )}

                    {/* Expand/Collapse All Fields Button */}
                    <TouchableOpacity
                      onPress={() => setExpandedLeadIndex(isExpanded ? null : index)}
                      style={[styles.viewFieldsBtn, { borderTopColor: theme.border }]}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.viewFieldsText, { color: theme.accentLight }]}>
                        {isExpanded ? '▲ Hide All Sheet Data' : '▼ View All Sheet Columns'}
                      </Text>
                    </TouchableOpacity>

                    {/* Expanded Sheet Columns Key-Value Grid */}
                    {isExpanded && (
                      <View style={[styles.allColumnsBox, { backgroundColor: theme.surfaceElevated, borderTopColor: theme.border }]}>
                        {Object.entries(item).map(([key, val]) => {
                          if (key === '_rowIndex') return null;
                          return (
                            <View key={key} style={[styles.columnRow, { borderBottomColor: theme.border }]}>
                              <Text style={[styles.columnKey, { color: theme.textTertiary }]}>{key}</Text>
                              <Text style={[styles.columnVal, { color: theme.text }]} selectable>
                                {String(val !== null && val !== undefined ? val : '—')}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>
                );
              }}
              ListEmptyComponent={
                <View style={{ padding: 30, alignItems: 'center' }}>
                  <Text style={{ fontSize: 28, marginBottom: 8 }}>🔍</Text>
                  <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14 }}>No leads match filter</Text>
                  <Text style={{ color: theme.textSecondary, fontSize: 11, marginTop: 4 }}>
                    Try changing your search keyword or status filter above.
                  </Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 11,
    marginTop: 3,
  },
  addBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  syncHeaderBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncHeaderBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  modalSyncBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSyncBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  combinedCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 14,
  },
  combinedTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 10,
  },
  combinedStats: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  combinedStat: {
    flex: 1,
    alignItems: 'center',
  },
  combinedStatValue: {
    fontSize: 22,
    fontWeight: '800',
  },
  combinedStatLabel: {
    fontSize: 9,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginTop: 2,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  chipText: {
    fontSize: 10,
    fontWeight: '600',
  },
  emptyContainer: {
    padding: 48,
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptyDesc: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  modalSubtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  modalClose: {
    fontSize: 16,
    fontWeight: '700',
  },
  closeIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    padding: 3,
    marginBottom: 16,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  toggleText: {
    fontSize: 12,
    fontWeight: '600',
  },
  modalBody: {
    gap: 12,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  modalInput: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 13,
    borderWidth: 1,
  },
  modalDesc: {
    fontSize: 12,
    lineHeight: 18,
  },
  modalActionBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalActionBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },

  // Rich Lead Inspector styles
  inspectorContainer: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 16,
    height: '90%',
  },
  filterBar: {
    flexDirection: 'row',
    gap: 6,
    marginVertical: 10,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  filterPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    padding: 0,
  },
  leadCard: {
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
    overflow: 'hidden',
  },
  leadCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
  },
  leadHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  leadIndexBadge: {
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  leadEmail: {
    fontSize: 13,
    fontWeight: '700',
  },
  leadSubtext: {
    fontSize: 11,
    marginTop: 2,
  },
  leadStatusBadge: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  leadStatusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  dispatchMetaBox: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 4,
  },
  dispatchMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaLabel: {
    fontSize: 10,
    fontWeight: '600',
    width: 75,
  },
  metaValue: {
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },
  viewFieldsBtn: {
    paddingVertical: 8,
    alignItems: 'center',
    borderTopWidth: 1,
  },
  viewFieldsText: {
    fontSize: 11,
    fontWeight: '700',
  },
  allColumnsBox: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderTopWidth: 1,
  },
  columnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    borderBottomWidth: 1,
  },
  columnKey: {
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },
  columnVal: {
    fontSize: 11,
    flex: 2,
    textAlign: 'right',
  },
});
