/**
 * TemplateScreen — Compose outreach email templates with dynamic lead placeholders
 * and persistent Template Presets (matching Chrome Extension sidepanel).
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Modal,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { readFileAsBase64 } from '../utils/fileUtils';
import { useTheme } from '../context/ThemeContext';
import { storage } from '../services/storage';

export default function TemplateScreen({ onNavigateToSend }) {
  const { theme } = useTheme();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [activeSheet, setActiveSheet] = useState(null);
  const [masterAttachment, setMasterAttachment] = useState(null);
  const [activeField, setActiveField] = useState('body'); // 'subject' | 'body'

  // ── Template Presets State ──
  const [presets, setPresets] = useState([]);
  const [activePreset, setActivePreset] = useState(null);
  const [showPickerModal, setShowPickerModal] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [presetNameInput, setPresetNameInput] = useState('');

  useEffect(() => {
    loadAllTemplateData();
  }, []);

  const loadAllTemplateData = async () => {
    const [t, s, allPresets] = await Promise.all([
      storage.getActiveTemplate(),
      storage.getActiveSheet(),
      storage.getTemplates(),
    ]);

    if (t) {
      setSubject(t.subject || '');
      setBody(t.body || '');
      if (t.attachment) setMasterAttachment(t.attachment);
    }
    setActiveSheet(s);
    setPresets(allPresets || []);

    // Try to match active preset if available
    if (t && t.presetId && allPresets) {
      const match = allPresets.find((p) => p.id === t.presetId);
      if (match) setActivePreset(match);
    }
  };

  const insertPlaceholder = (tag) => {
    if (activeField === 'subject') {
      setSubject((prev) => prev + tag);
    } else {
      setBody((prev) => prev + tag);
    }
  };

  // ── Load a Selected Preset ──
  const handleSelectPreset = async (preset) => {
    if (!preset) {
      // Clear / Blank template
      setActivePreset(null);
      setSubject('');
      setBody('');
      setMasterAttachment(null);
      setShowPickerModal(false);
      return;
    }

    setSubject(preset.subject || '');
    setBody(preset.body || '');
    setMasterAttachment(preset.attachment || null);
    setActivePreset(preset);
    setShowPickerModal(false);

    // Save as current active template in storage
    const activeTpl = {
      id: 'active_template',
      presetId: preset.id,
      name: preset.name,
      subject: preset.subject || '',
      body: preset.body || '',
      attachment: preset.attachment || null,
      updatedAt: new Date().toISOString(),
    };
    await storage.saveActiveTemplate(activeTpl);
    Alert.alert('Preset Loaded 📋', `Template "${preset.name}" loaded into editor.`);
  };

  // ── Save Current Editor as New Named Preset ──
  const handleSaveAsNewPreset = async () => {
    const name = presetNameInput.trim();
    if (!name) {
      Alert.alert('Name Required', 'Please enter a name for this template preset (e.g. "Software Engineer Outreach").');
      return;
    }
    if (!subject.trim() && !body.trim()) {
      Alert.alert('Empty Template', 'Please enter at least a subject or body for your template.');
      return;
    }

    const newPreset = {
      id: 'preset_' + Date.now(),
      name,
      subject,
      body,
      attachment: masterAttachment || null,
      updatedAt: new Date().toISOString(),
    };

    const updatedList = await storage.saveTemplatePreset(newPreset);
    setPresets(updatedList);
    setActivePreset(newPreset);
    setPresetNameInput('');
    setShowSaveModal(false);

    // Also update active template
    await storage.saveActiveTemplate({
      ...newPreset,
      id: 'active_template',
      presetId: newPreset.id,
    });

    Alert.alert('Preset Saved ✨', `Template preset "${name}" saved successfully!`);
  };

  // ── Update Currently Active Preset ──
  const handleUpdateCurrentPreset = async () => {
    if (!activePreset) return;
    if (!subject.trim() && !body.trim()) {
      Alert.alert('Empty Template', 'Please enter at least a subject or body for your template.');
      return;
    }

    const updated = {
      ...activePreset,
      subject,
      body,
      attachment: masterAttachment || null,
      updatedAt: new Date().toISOString(),
    };

    const updatedList = await storage.saveTemplatePreset(updated);
    setPresets(updatedList);
    setActivePreset(updated);

    await storage.saveActiveTemplate({
      ...updated,
      id: 'active_template',
      presetId: updated.id,
    });

    Alert.alert('Updated ✨', `Template preset "${activePreset.name}" updated!`);
  };

  // ── Delete a Preset ──
  const handleDeletePreset = async (presetId, presetName) => {
    Alert.alert(
      'Delete Preset',
      `Are you sure you want to delete template preset "${presetName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const updated = await storage.deleteTemplatePreset(presetId);
            setPresets(updated);
            if (activePreset?.id === presetId) {
              setActivePreset(null);
            }
          },
        },
      ]
    );
  };

  // ── Save Active Template Only ──
  const saveTemplate = async () => {
    if (!subject.trim() && !body.trim()) {
      Alert.alert('Empty Template', 'Please enter at least a subject or body for your template.');
      return;
    }
    const tpl = {
      id: 'active_template',
      presetId: activePreset?.id || null,
      name: activePreset?.name || 'Active Outreach Template',
      subject,
      body,
      attachment: masterAttachment || null,
      updatedAt: new Date().toISOString(),
    };
    await storage.saveActiveTemplate(tpl);
    Alert.alert('Saved ✨', 'Template subject, body, and attachments saved successfully!');
  };

  // ── Pick Master Attachment ──
  const pickMasterAttachment = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets || !res.assets[0]) return;

      const file = res.assets[0];
      const base64Data = await readFileAsBase64(file.uri);

      setMasterAttachment({
        name: file.name,
        mimeType: file.mimeType || 'application/pdf',
        base64Data,
        size: file.size,
      });
      Alert.alert('Attached 📎', `Added ${file.name} as campaign master attachment.`);
    } catch (e) {
      Alert.alert('Attachment Error', e.message);
    }
  };

  const sheetHeaders = activeSheet?.headers || [];
  const senderTags = ['Sender.Name', 'Sender.Title', 'Sender.Phone', 'Sender.Signature'];

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.bg }]} contentContainerStyle={styles.content}>
      {/* Top Header */}
      <View style={styles.topBar}>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text style={[styles.title, { color: theme.text }]}>Email Template</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Craft personalized pitch with dynamic variables & presets
          </Text>
        </View>
        <TouchableOpacity
          onPress={saveTemplate}
          style={[styles.saveBtn, { backgroundColor: theme.accent }]}
          activeOpacity={0.8}
        >
          <Text style={styles.saveBtnText}>Save</Text>
        </TouchableOpacity>
      </View>

      {/* ─── TEMPLATE PRESETS BAR (Matching Extension sidepanel.js:615-657) ─── */}
      <View style={[styles.presetCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.presetHeaderRow}>
          <Text style={[styles.presetCardTitle, { color: theme.textSecondary }]}>
            📁 TEMPLATE PRESET
          </Text>
          <TouchableOpacity
            onPress={() => {
              setPresetNameInput(activePreset ? activePreset.name + ' Copy' : '');
              setShowSaveModal(true);
            }}
            style={[styles.saveAsPresetBtn, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}
            activeOpacity={0.7}
          >
            <Text style={[styles.saveAsPresetBtnText, { color: theme.accentLight }]}>💾 Save As Preset</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.presetSelectorRow}>
          <TouchableOpacity
            onPress={() => setShowPickerModal(true)}
            style={[styles.presetDropdownBtn, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.presetDropdownBtnText,
                { color: activePreset ? theme.text : theme.textTertiary, fontWeight: activePreset ? '700' : '500' },
              ]}
              numberOfLines={1}
            >
              {activePreset ? `📋 ${activePreset.name}` : '— Select Saved Template Preset —'}
            </Text>
            <Text style={{ fontSize: 10, color: theme.textTertiary, marginLeft: 6 }}>▼</Text>
          </TouchableOpacity>

          {activePreset && (
            <TouchableOpacity
              onPress={handleUpdateCurrentPreset}
              style={[styles.updatePresetBtn, { backgroundColor: theme.accentGlow, borderColor: theme.accent }]}
              activeOpacity={0.7}
            >
              <Text style={[styles.updatePresetBtnText, { color: theme.accentLight }]}>Update</Text>
            </TouchableOpacity>
          )}
        </View>

        {activePreset && (
          <Text style={[styles.presetActiveNote, { color: theme.textTertiary }]}>
            Currently editing preset: <Text style={{ color: theme.accentLight, fontWeight: '700' }}>{activePreset.name}</Text>
          </Text>
        )}
      </View>

      {/* Sheet Column Placeholders */}
      <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
        Lead Placeholders (tap to insert into {activeField}):
      </Text>
      {sheetHeaders.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
          {sheetHeaders.map((h, idx) => (
            <TouchableOpacity
              key={idx}
              onPress={() => insertPlaceholder(`{${h}}`)}
              style={[
                styles.chip,
                {
                  backgroundColor: theme.accentGlow,
                  borderColor: theme.accent,
                },
              ]}
              activeOpacity={0.7}
            >
              <Text style={[styles.chipText, { color: theme.accentLight }]}>{`{${h}}`}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : (
        <View style={[styles.noSheetNotice, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.noSheetNoticeText, { color: theme.textTertiary }]}>
            💡 No lead columns loaded yet. Connect a Google Sheet or import Apollo CSV in the "Leads" tab to auto-populate your variables here.
          </Text>
        </View>
      )}

      {/* Sender Identity Tags */}
      <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
        Sender Identity Placeholders:
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
        {senderTags.map((tag, idx) => (
          <TouchableOpacity
            key={idx}
            onPress={() => insertPlaceholder(`{${tag}}`)}
            style={[
              styles.chip,
              {
                backgroundColor: theme.successGlow,
                borderColor: theme.success,
              },
            ]}
            activeOpacity={0.7}
          >
            <Text style={[styles.chipText, { color: theme.success }]}>{`{${tag}}`}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Subject Line */}
      <View style={styles.inputGroup}>
        <View style={styles.labelRow}>
          <Text style={[styles.label, { color: theme.textSecondary }]}>Subject Line</Text>
          {activeField === 'subject' && (
            <Text style={[styles.activeIndicator, { color: theme.accent }]}>● Active Field</Text>
          )}
        </View>
        <TextInput
          style={[
            styles.subjectInput,
            {
              backgroundColor: theme.surface,
              borderColor: activeField === 'subject' ? theme.accent : theme.border,
              color: theme.text,
            },
          ]}
          placeholder="e.g. Quick question regarding {Company}"
          placeholderTextColor={theme.textTertiary}
          value={subject}
          onChangeText={setSubject}
          onFocus={() => setActiveField('subject')}
        />
      </View>

      {/* Body Area */}
      <View style={styles.inputGroup}>
        <View style={styles.labelRow}>
          <Text style={[styles.label, { color: theme.textSecondary }]}>Email Body</Text>
          {activeField === 'body' && (
            <Text style={[styles.activeIndicator, { color: theme.accent }]}>● Active Field</Text>
          )}
        </View>
        <TextInput
          style={[
            styles.bodyInput,
            {
              backgroundColor: theme.surface,
              borderColor: activeField === 'body' ? theme.accent : theme.border,
              color: theme.text,
            },
          ]}
          placeholder="Hi {First Name},\n\nI noticed the impressive expansion at {Company} and wanted to reach out..."
          placeholderTextColor={theme.textTertiary}
          multiline
          textAlignVertical="top"
          value={body}
          onChangeText={setBody}
          onFocus={() => setActiveField('body')}
        />
      </View>

      {/* Campaign Attachment Card */}
      <View style={[styles.attachCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.attachHeader}>
          <Text style={[styles.attachLabel, { color: theme.textSecondary }]}>
            Master Campaign Attachment (Optional)
          </Text>
          {masterAttachment && (
            <TouchableOpacity onPress={() => setMasterAttachment(null)}>
              <Text style={[styles.clearAttachText, { color: theme.danger }]}>Remove</Text>
            </TouchableOpacity>
          )}
        </View>

        {masterAttachment ? (
          <View style={[styles.fileBadge, { backgroundColor: theme.surfaceElevated }]}>
            <Text style={[styles.attachName, { color: theme.accentLight }]}>
              📎 {masterAttachment.name}
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            onPress={pickMasterAttachment}
            style={[styles.pickAttachBtn, { borderColor: theme.border, backgroundColor: theme.surfaceElevated }]}
            activeOpacity={0.7}
          >
            <Text style={[styles.pickAttachBtnText, { color: theme.textSecondary }]}>
              + Attach Resume or PDF Pitch
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ═══════════════════════════════════════════════════════════
           MODAL: PRESET PICKER DROPDOWN
           ═══════════════════════════════════════════════════════════ */}
      <Modal visible={showPickerModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
            <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Load Template Preset</Text>
              <TouchableOpacity onPress={() => setShowPickerModal(false)}>
                <Text style={{ fontSize: 16, color: theme.textSecondary, fontWeight: '700' }}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 360 }}>
              {/* Option: Blank / Clear Template */}
              <TouchableOpacity
                onPress={() => handleSelectPreset(null)}
                style={[styles.presetOptionItem, { borderBottomColor: theme.border }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.presetOptionName, { color: theme.textSecondary }]}>
                    📄 — New Blank Template —
                  </Text>
                  <Text style={[styles.presetOptionSubject, { color: theme.textTertiary }]}>
                    Clear editor to start fresh
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Saved Presets */}
              {presets.map((p) => {
                const isSelected = activePreset?.id === p.id;
                return (
                  <View
                    key={p.id}
                    style={[
                      styles.presetOptionItem,
                      {
                        borderBottomColor: theme.border,
                        backgroundColor: isSelected ? theme.accentGlow : 'transparent',
                      },
                    ]}
                  >
                    <TouchableOpacity
                      onPress={() => handleSelectPreset(p)}
                      style={{ flex: 1, paddingRight: 8 }}
                      activeOpacity={0.7}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[styles.presetOptionName, { color: isSelected ? theme.accentLight : theme.text }]}>
                          📋 {p.name}
                        </Text>
                        {isSelected && (
                          <Text style={{ fontSize: 10, color: theme.accent, fontWeight: '800' }}>● Active</Text>
                        )}
                      </View>
                      <Text style={[styles.presetOptionSubject, { color: theme.textTertiary }]} numberOfLines={1}>
                        Subject: {p.subject || '(No subject)'}
                      </Text>
                    </TouchableOpacity>

                    {/* Delete Preset Button */}
                    <TouchableOpacity
                      onPress={() => handleDeletePreset(p.id, p.name)}
                      style={styles.deletePresetBtn}
                      activeOpacity={0.6}
                    >
                      <Text style={{ color: theme.danger, fontSize: 13 }}>🗑️</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}

              {presets.length === 0 && (
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <Text style={{ color: theme.textTertiary, fontSize: 12 }}>
                    No presets saved yet. Compose a template and tap "Save As Preset" to reuse anytime.
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ═══════════════════════════════════════════════════════════
           MODAL: SAVE AS PRESET
           ═══════════════════════════════════════════════════════════ */}
      <Modal visible={showSaveModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
            <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Save As Template Preset</Text>
              <TouchableOpacity onPress={() => setShowSaveModal(false)}>
                <Text style={{ fontSize: 16, color: theme.textSecondary, fontWeight: '700' }}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={{ padding: 16 }}>
              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Preset Name</Text>
              <TextInput
                style={[
                  styles.presetInput,
                  { backgroundColor: theme.surface, color: theme.text, borderColor: theme.border },
                ]}
                placeholder="e.g. Founder Cold Pitch V2"
                placeholderTextColor={theme.textTertiary}
                value={presetNameInput}
                onChangeText={setPresetNameInput}
                autoFocus
              />

              <View style={[styles.previewSnippet, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Text style={[styles.previewSnippetLabel, { color: theme.textTertiary }]}>Subject preview:</Text>
                <Text style={[styles.previewSnippetText, { color: theme.text }]} numberOfLines={1}>
                  {subject || '(No subject)'}
                </Text>
              </View>

              <View style={styles.modalActionRow}>
                <TouchableOpacity
                  onPress={() => setShowSaveModal(false)}
                  style={[styles.modalCancelBtn, { borderColor: theme.border }]}
                >
                  <Text style={[styles.modalCancelBtnText, { color: theme.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleSaveAsNewPreset}
                  style={[styles.modalSubmitBtn, { backgroundColor: theme.accent }]}
                >
                  <Text style={styles.modalSubmitBtnText}>Save Preset</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
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

  // ── Presets Card ──
  presetCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 12,
  },
  presetHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  presetCardTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  saveAsPresetBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  saveAsPresetBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  presetSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  presetDropdownBtn: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  presetDropdownBtnText: {
    fontSize: 12,
    flex: 1,
  },
  updatePresetBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  updatePresetBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  presetActiveNote: {
    fontSize: 10,
    marginTop: 6,
  },

  // ── Placeholders & Chips ──
  sectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 6,
  },
  chipsScroll: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 6,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  noSheetNotice: {
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
  },
  noSheetNoticeText: {
    fontSize: 11,
    lineHeight: 16,
  },

  // ── Inputs ──
  inputGroup: {
    marginTop: 10,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  activeIndicator: {
    fontSize: 10,
    fontWeight: '700',
  },
  subjectInput: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
  },
  bodyInput: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    minHeight: 160,
    lineHeight: 20,
  },

  // ── Master Attachment Card ──
  attachCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginTop: 14,
  },
  attachHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  attachLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  clearAttachText: {
    fontSize: 11,
    fontWeight: '700',
  },
  fileBadge: {
    padding: 10,
    borderRadius: 8,
  },
  attachName: {
    fontSize: 12,
    fontWeight: '600',
  },
  pickAttachBtn: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  pickAttachBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },

  // ── Modal Styles ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 20,
  },
  modalBox: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  presetOptionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  presetOptionName: {
    fontSize: 13,
    fontWeight: '700',
  },
  presetOptionSubject: {
    fontSize: 11,
    marginTop: 2,
  },
  deletePresetBtn: {
    padding: 6,
    borderRadius: 6,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 6,
  },
  presetInput: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    marginBottom: 12,
  },
  previewSnippet: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
    marginBottom: 16,
  },
  previewSnippetLabel: {
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 2,
  },
  previewSnippetText: {
    fontSize: 12,
  },
  modalActionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  modalCancelBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  modalSubmitBtn: {
    flex: 2,
    paddingVertical: 11,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalSubmitBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
});
