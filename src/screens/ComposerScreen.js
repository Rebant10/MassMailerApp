import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native';
import { THEME } from '../config/constants';
import * as DocumentPicker from 'expo-document-picker';
import { readFileAsBase64 } from '../utils/fileUtils';
import { parsePlaceholders } from '../utils/mailerUtils';
import { storage } from '../services/storage';

export default function ComposerScreen() {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [activeSheet, setActiveSheet] = useState(null);
  const [senders, setSenders] = useState([]);
  const [masterAttachment, setMasterAttachment] = useState(null);
  const [activeField, setActiveField] = useState('body'); // 'subject' | 'body'
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    loadComposerData();
  }, []);

  const loadComposerData = async () => {
    const [t, s, p] = await Promise.all([
      storage.getActiveTemplate(),
      storage.getActiveSheet(),
      storage.getSenders()
    ]);
    if (t) {
      setSubject(t.subject || '');
      setBody(t.body || '');
    }
    setActiveSheet(s);
    setSenders(p);
  };

  const insertPlaceholder = (tag) => {
    if (activeField === 'subject') {
      setSubject(prev => prev + tag);
    } else {
      setBody(prev => prev + tag);
    }
  };

  const saveTemplate = async () => {
    const tpl = {
      id: 'active_template',
      name: 'Active Outreach Template',
      subject,
      body
    };
    await storage.saveActiveTemplate(tpl);
    Alert.alert('Saved', 'Template subject and body saved successfully!');
  };

  const pickMasterAttachment = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        copyToCacheDirectory: true
      });
      if (res.canceled || !res.assets || !res.assets[0]) return;

      const file = res.assets[0];
      const base64Data = await readFileAsBase64(file.uri);

      setMasterAttachment({
        name: file.name,
        mimeType: file.mimeType || 'application/pdf',
        base64Data
      });
      Alert.alert('Attached', `Master attachment set to ${file.name}`);
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  };

  // Real preview data from active sheet & active sender
  const hasSheet = activeSheet && Array.isArray(activeSheet.rows) && activeSheet.rows.length > 0;
  const sampleRow = hasSheet ? activeSheet.rows[0] : {};
  const sampleSender = (senders && senders.length > 0) ? senders[0] : null;

  const previewSubject = hasSheet ? parsePlaceholders(subject, sampleRow, sampleSender) : '';
  const previewBody = hasSheet ? parsePlaceholders(body, sampleRow, sampleSender) : '';
  const emailCol = hasSheet ? (activeSheet.headers?.find(h => /email/i.test(h)) || activeSheet.headers?.[0]) : null;
  const previewTo = (hasSheet && emailCol && sampleRow[emailCol]) ? sampleRow[emailCol] : '';

  const sheetHeaders = activeSheet?.headers || [];
  const senderTags = ['Sender.Name', 'Sender.Title', 'Sender.Phone', 'Sender.Signature'];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header bar */}
      <View style={styles.topBar}>
        <Text style={styles.title}>Email Composer</Text>
        <View style={styles.topActions}>
          <TouchableOpacity
            onPress={() => setShowPreview(!showPreview)}
            style={[styles.actionBtn, showPreview && styles.actionBtnActive]}
          >
            <Text style={[styles.actionBtnText, showPreview && styles.actionBtnTextActive]}>
              {showPreview ? '✏️ Edit' : '👁 Preview'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={saveTemplate} style={styles.saveBtn}>
            <Text style={styles.saveBtnText}>Save</Text>
          </TouchableOpacity>
        </View>
      </View>

      {showPreview ? (
        /* Preview Mode */
        <View style={styles.previewBox}>
          {hasSheet ? (
            <>
              <View style={styles.previewHeader}>
                <Text style={styles.previewTo}>To: {previewTo || '(No Email found in Row #1)'}</Text>
                <Text style={styles.previewSubject}>Subject: {previewSubject || '(Empty Subject)'}</Text>
                <Text style={styles.previewMeta}>
                  Merged with Row #1 from "{activeSheet.name}" {sampleSender ? `& sender ${sampleSender.email}` : ''}
                </Text>
              </View>
              <View style={styles.previewBody}>
                <Text style={styles.previewBodyText}>{previewBody.replace(/<[^>]+>/g, '') || '(Empty Body)'}</Text>
              </View>
            </>
          ) : (
            <View style={{ padding: 24, alignItems: 'center' }}>
              <Text style={{ color: THEME.warning, fontWeight: '700', fontSize: 14, marginBottom: 6 }}>
                ⚠️ No Sheet or CSV Connected
              </Text>
              <Text style={{ color: THEME.textMuted, fontSize: 12, textAlign: 'center', lineHeight: 18 }}>
                Go to the "Leads" tab and connect a Google Sheet or import an Apollo CSV to preview personalized emails merged with your real data.
              </Text>
            </View>
          )}
        </View>
      ) : (
        /* Editor Mode */
        <View>
          {/* Sheet Column Placeholders */}
          <Text style={styles.chipsSectionTitle}>Sheet Column Placeholders (tap to insert into {activeField}):</Text>
          {sheetHeaders.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
              {sheetHeaders.map((h, idx) => (
                <TouchableOpacity key={idx} onPress={() => insertPlaceholder(`{${h}}`)} style={styles.chip}>
                  <Text style={styles.chipText}>{`{${h}}`}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.noSheetNotice}>
              <Text style={styles.noSheetNoticeText}>
                ⚠️ No sheet or CSV loaded yet. Go to the "Leads" tab to load a sheet, and its actual column tags will appear here.
              </Text>
            </View>
          )}

          <Text style={styles.chipsSectionTitle}>Sender Identity Placeholders:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
            {senderTags.map((tag, idx) => (
              <TouchableOpacity key={idx} onPress={() => insertPlaceholder(`{${tag}}`)} style={[styles.chip, styles.chipSender]}>
                <Text style={[styles.chipText, styles.chipSenderText]}>{`{${tag}}`}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Subject input */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Subject Line</Text>
            <TextInput
              style={styles.subjectInput}
              placeholder="e.g. Quick question regarding {Company}"
              placeholderTextColor={THEME.textDim}
              value={subject}
              onChangeText={setSubject}
              onFocus={() => setActiveField('subject')}
            />
          </View>

          {/* Body input */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email Body</Text>
            <TextInput
              style={styles.bodyInput}
              placeholder="Write your email pitch here... HTML or plain text supported."
              placeholderTextColor={THEME.textDim}
              multiline
              textAlignVertical="top"
              value={body}
              onChangeText={setBody}
              onFocus={() => setActiveField('body')}
            />
          </View>

          {/* Master Attachment */}
          <View style={styles.attachCard}>
            <View style={styles.attachHeader}>
              <Text style={styles.attachLabel}>Campaign Master Attachment</Text>
              {masterAttachment ? (
                <TouchableOpacity onPress={() => setMasterAttachment(null)}>
                  <Text style={styles.clearAttachText}>Remove</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            {masterAttachment ? (
              <Text style={styles.attachName}>📎 {masterAttachment.name}</Text>
            ) : (
              <TouchableOpacity onPress={pickMasterAttachment} style={styles.pickAttachBtn}>
                <Text style={styles.pickAttachBtnText}>+ Attach Resume / PDF Pitch</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
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
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: THEME.text,
  },
  topActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    backgroundColor: THEME.cardBg,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  actionBtnActive: {
    backgroundColor: THEME.cyan,
  },
  actionBtnText: {
    color: THEME.text,
    fontSize: 12,
    fontWeight: '600',
  },
  actionBtnTextActive: {
    color: '#042f2e',
    fontWeight: '700',
  },
  saveBtn: {
    backgroundColor: THEME.primary,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  chipsSectionTitle: {
    color: THEME.textDim,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginTop: 6,
    marginBottom: 4,
  },
  chipsScroll: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  chip: {
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    marginRight: 6,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.3)',
  },
  chipText: {
    color: THEME.primaryLight,
    fontSize: 11,
    fontWeight: '600',
  },
  chipSender: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  chipSenderText: {
    color: THEME.success,
  },
  inputGroup: {
    marginTop: 8,
  },
  label: {
    color: THEME.textMuted,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  subjectInput: {
    backgroundColor: THEME.cardBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: THEME.text,
    fontSize: 13,
  },
  bodyInput: {
    backgroundColor: THEME.cardBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: THEME.text,
    fontSize: 13,
    minHeight: 180,
    lineHeight: 20,
  },
  attachCard: {
    backgroundColor: THEME.cardBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    padding: 12,
    marginTop: 12,
  },
  attachHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  attachLabel: {
    color: THEME.textMuted,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  clearAttachText: {
    color: THEME.danger,
    fontSize: 11,
    fontWeight: '600',
  },
  attachName: {
    color: THEME.primaryLight,
    fontSize: 12,
    fontWeight: '600',
  },
  pickAttachBtn: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  pickAttachBtnText: {
    color: THEME.textMuted,
    fontSize: 11,
  },
  previewBox: {
    backgroundColor: THEME.cardBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    padding: 16,
    marginTop: 8,
  },
  previewHeader: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    paddingBottom: 10,
    marginBottom: 10,
  },
  previewTo: {
    color: THEME.cyan,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  previewSubject: {
    color: THEME.text,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  previewMeta: {
    color: THEME.textDim,
    fontSize: 10,
  },
  previewBody: {
    paddingVertical: 8,
  },
  previewBodyText: {
    color: THEME.text,
    fontSize: 13,
    lineHeight: 22,
  },
  noSheetNotice: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  noSheetNoticeText: {
    color: THEME.textDim,
    fontSize: 11,
    fontStyle: 'italic',
    lineHeight: 16,
  },
});
