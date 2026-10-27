/**
 * SenderCard — Account card for the Accounts screen
 * Supports per-sender custom CV/Resume overrides, daily limits, campaign limits, and identity tags.
 */

import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { readFileAsBase64 } from '../utils/fileUtils';
import { useTheme } from '../context/ThemeContext';
import { oauthService } from '../services/oauth';
import { storage } from '../services/storage';

export default function SenderCard({ sender, onUpdate, onRemove }) {
  const { theme } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState(sender.name || '');
  const [title, setTitle] = useState(sender.title || '');
  const [phone, setPhone] = useState(sender.phone || '');
  const [signature, setSignature] = useState(sender.signature || '');
  const [dailyLimit, setDailyLimit] = useState(String(sender.dailyLimit || 500));
  const [campaignLimit, setCampaignLimit] = useState(
    sender.campaignLimit != null ? String(sender.campaignLimit) : ''
  );
  const [attachment, setAttachment] = useState(sender.attachment || null);
  const [refreshing, setRefreshing] = useState(false);

  const hasRefreshToken = !!sender.refreshToken;
  const isTokenValid = sender.tokenExpiresAt && Date.now() < sender.tokenExpiresAt;

  const handleSave = () => {
    onUpdate({
      ...sender,
      name: name.trim(),
      title: title.trim(),
      phone: phone.trim(),
      signature: signature.trim(),
      dailyLimit: parseInt(dailyLimit, 10) || 500,
      campaignLimit: campaignLimit ? parseInt(campaignLimit, 10) : null,
      attachment: attachment || null,
    });
    setExpanded(false);
    Alert.alert('Saved ✨', `Updated profile and limits for ${sender.email}`);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const newToken = await oauthService.ensureValidToken(sender);
      Alert.alert('Token Refreshed ✓', `Access token for ${sender.email} has been refreshed.`);
      onUpdate({
        ...sender,
        token: newToken,
        tokenExpiresAt: Date.now() + 3600 * 1000,
      });
    } catch (e) {
      Alert.alert('Refresh Failed', e.message);
    } finally {
      setRefreshing(false);
    }
  };

  const pickCustomAttachment = async () => {
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

      const newAttach = {
        name: file.name,
        mimeType: file.mimeType || 'application/pdf',
        base64Data,
        size: file.size,
      };

      setAttachment(newAttach);
      onUpdate({
        ...sender,
        name: name.trim(),
        title: title.trim(),
        phone: phone.trim(),
        signature: signature.trim(),
        dailyLimit: parseInt(dailyLimit, 10) || 500,
        campaignLimit: campaignLimit ? parseInt(campaignLimit, 10) : null,
        attachment: newAttach,
      });
      Alert.alert('Resume Attached 📎', `Custom CV/Resume set to "${file.name}" for ${sender.email}`);
    } catch (e) {
      Alert.alert('Attachment Error', e.message);
    }
  };

  const removeCustomAttachment = () => {
    setAttachment(null);
    onUpdate({
      ...sender,
      attachment: null,
    });
    Alert.alert('Attachment Removed', `This sender will now use the master campaign attachment.`);
  };

  const handleResetDaily = () => {
    Alert.alert(
      'Reset Daily Count',
      `Are you sure you want to reset today's sent counter for ${sender.email} back to 0?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset to 0',
          style: 'destructive',
          onPress: async () => {
            await storage.resetSenderDailyCount(sender.email);
            onUpdate({ ...sender, sentToday: 0 });
            Alert.alert('Reset ✓', `Today's count for ${sender.email} is now 0.`);
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {/* Header row */}
      <TouchableOpacity
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
        style={styles.headerRow}
      >
        {/* Status dot */}
        <View
          style={[
            styles.statusDot,
            {
              backgroundColor: hasRefreshToken || isTokenValid
                ? theme.success
                : theme.danger,
            },
          ]}
        />

        <View style={styles.headerInfo}>
          <Text style={[styles.email, { color: theme.text }]} numberOfLines={1}>
            {sender.email}
          </Text>
          <Text style={[styles.accountMeta, { color: theme.textSecondary }]}>
            {sender.accountType || 'Personal'} • {sender.dailyLimit || 500}/day cap
            {sender.campaignLimit ? ` • Camp: ${sender.campaignLimit}` : ''}
          </Text>

          {/* Account Sent Metrics Pill Row */}
          <View style={styles.statsPillRow}>
            <View style={[styles.statBadgePill, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
              <Text style={[styles.statBadgePillText, { color: theme.textSecondary }]}>
                📤 Today: <Text style={{ color: theme.accentLight, fontWeight: '800' }}>{sender.sentToday || 0}</Text>/{sender.dailyLimit || 500}
              </Text>
            </View>
            <View style={[styles.statBadgePill, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
              <Text style={[styles.statBadgePillText, { color: theme.textSecondary }]}>
                📊 Total: <Text style={{ color: theme.success, fontWeight: '800' }}>{sender.totalSent || 0}</Text> sent
              </Text>
            </View>
          </View>

          {/* Attachment status tag */}
          <View style={styles.attachPillRow}>
            {sender.attachment ? (
              <View style={[styles.customAttachPill, { backgroundColor: theme.accentGlow, borderColor: theme.accent }]}>
                <Text style={[styles.customAttachPillText, { color: theme.accentLight }]} numberOfLines={1}>
                  📎 Custom CV: {sender.attachment.name}
                </Text>
              </View>
            ) : (
              <View style={[styles.masterAttachPill, { backgroundColor: theme.surfaceElevated }]}>
                <Text style={[styles.masterAttachPillText, { color: theme.textTertiary }]}>
                  📄 Using Master Resume
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.headerActions}>
          {/* Token badge */}
          <View
            style={[
              styles.tokenBadge,
              {
                backgroundColor: hasRefreshToken || isTokenValid
                  ? theme.successGlow
                  : theme.dangerGlow,
              },
            ]}
          >
            <Text
              style={[
                styles.tokenBadgeText,
                {
                  color: hasRefreshToken || isTokenValid
                    ? theme.success
                    : theme.danger,
                },
              ]}
            >
              {hasRefreshToken ? '✓ Auto-Renew' : isTokenValid ? '✓ Valid' : '✗ Re-auth'}
            </Text>
          </View>

          <Text style={[styles.expandIcon, { color: theme.textTertiary }]}>
            {expanded ? '▲' : '▼'}
          </Text>
        </View>
      </TouchableOpacity>

      {/* Expanded edit form */}
      {expanded && (
        <View style={[styles.expandedBody, { borderTopColor: theme.border }]}>
          {/* Dispatch Analytics Box */}
          <View style={[styles.analyticsBox, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
            <Text style={[styles.fieldLabel, { color: theme.textSecondary, marginBottom: 8 }]}>
              📊 Account Dispatch History & Limits
            </Text>
            <View style={styles.analyticsGrid}>
              <View style={styles.analyticsCol}>
                <Text style={[styles.analyticsVal, { color: theme.accentLight }]}>{sender.sentToday || 0}</Text>
                <Text style={[styles.analyticsLbl, { color: theme.textTertiary }]}>Sent Today</Text>
              </View>
              <View style={styles.analyticsCol}>
                <Text style={[styles.analyticsVal, { color: theme.text }]}>{sender.dailyLimit || 500}</Text>
                <Text style={[styles.analyticsLbl, { color: theme.textTertiary }]}>Daily Cap</Text>
              </View>
              <View style={styles.analyticsCol}>
                <Text style={[styles.analyticsVal, { color: theme.success }]}>{sender.totalSent || 0}</Text>
                <Text style={[styles.analyticsLbl, { color: theme.textTertiary }]}>Lifetime Sent</Text>
              </View>
            </View>

            {sender.lastSentAt && (
              <Text style={[styles.lastSentText, { color: theme.textTertiary }]}>
                🕒 Last email sent: {new Date(sender.lastSentAt).toLocaleString()}
              </Text>
            )}

            <TouchableOpacity
              onPress={handleResetDaily}
              style={[styles.resetDailyBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
              activeOpacity={0.7}
            >
              <Text style={[styles.resetDailyBtnText, { color: theme.textSecondary }]}>
                🔄 Reset Today's Count to 0
              </Text>
            </TouchableOpacity>
          </View>

          {/* Custom Resume / Attachment Section */}
          <View style={[styles.attachSection, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
            <View style={styles.attachSectionHeader}>
              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
                Account-Specific CV / Resume Override
              </Text>
              {attachment && (
                <TouchableOpacity onPress={removeCustomAttachment}>
                  <Text style={[styles.removeAttachText, { color: theme.danger }]}>Remove</Text>
                </TouchableOpacity>
              )}
            </View>

            {attachment ? (
              <View style={styles.currentAttachBox}>
                <Text style={[styles.attachNameText, { color: theme.accentLight }]}>
                  📎 {attachment.name}
                </Text>
                <Text style={[styles.attachNotice, { color: theme.textTertiary }]}>
                  When {sender.email} is rotated, this specific resume will be sent automatically.
                </Text>
              </View>
            ) : (
              <TouchableOpacity
                onPress={pickCustomAttachment}
                style={[styles.pickBtn, { borderColor: theme.accent, backgroundColor: theme.accentGlow }]}
                activeOpacity={0.7}
              >
                <Text style={[styles.pickBtnText, { color: theme.accentLight }]}>
                  + Attach Custom CV / Resume for this Inbox
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Identity fields */}
          <View style={styles.fieldRow}>
            <View style={styles.fieldCol}>
              <Text style={[styles.fieldLabel, { color: theme.textTertiary }]}>
                Display Name {'{Sender.Name}'}
              </Text>
              <TextInput
                style={[styles.fieldInput, { backgroundColor: theme.surfaceElevated, color: theme.text }]}
                value={name}
                onChangeText={setName}
                placeholder="e.g. Alice Johnson"
                placeholderTextColor={theme.textTertiary}
              />
            </View>
            <View style={styles.fieldCol}>
              <Text style={[styles.fieldLabel, { color: theme.textTertiary }]}>
                Job Title {'{Sender.Title}'}
              </Text>
              <TextInput
                style={[styles.fieldInput, { backgroundColor: theme.surfaceElevated, color: theme.text }]}
                value={title}
                onChangeText={setTitle}
                placeholder="Software Engineer"
                placeholderTextColor={theme.textTertiary}
              />
            </View>
          </View>

          <View style={styles.fieldRow}>
            <View style={styles.fieldCol}>
              <Text style={[styles.fieldLabel, { color: theme.textTertiary }]}>
                Phone {'{Sender.Phone}'}
              </Text>
              <TextInput
                style={[styles.fieldInput, { backgroundColor: theme.surfaceElevated, color: theme.text }]}
                value={phone}
                onChangeText={setPhone}
                placeholder="+1 555-0123"
                placeholderTextColor={theme.textTertiary}
                keyboardType="phone-pad"
              />
            </View>
            <View style={styles.fieldCol}>
              <Text style={[styles.fieldLabel, { color: theme.textTertiary }]}>Daily Sending Cap</Text>
              <TextInput
                style={[styles.fieldInput, { backgroundColor: theme.surfaceElevated, color: theme.text }]}
                value={dailyLimit}
                onChangeText={setDailyLimit}
                keyboardType="number-pad"
              />
            </View>
          </View>

          <View style={{ marginTop: 8 }}>
            <Text style={[styles.fieldLabel, { color: theme.textTertiary }]}>Campaign Limit (optional)</Text>
            <TextInput
              style={[styles.fieldInput, { backgroundColor: theme.surfaceElevated, color: theme.text }]}
              value={campaignLimit}
              onChangeText={setCampaignLimit}
              placeholder="Max emails this campaign (blank = unlimited)"
              placeholderTextColor={theme.textTertiary}
              keyboardType="number-pad"
            />
          </View>

          <View style={{ marginTop: 8 }}>
            <Text style={[styles.fieldLabel, { color: theme.textTertiary }]}>
              Signature HTML {'{Sender.Signature}'}
            </Text>
            <TextInput
              style={[
                styles.fieldInput,
                { backgroundColor: theme.surfaceElevated, color: theme.text, minHeight: 60 },
              ]}
              value={signature}
              onChangeText={setSignature}
              placeholder="Best regards,&#10;Alice"
              placeholderTextColor={theme.textTertiary}
              multiline
              textAlignVertical="top"
            />
          </View>

          {/* Action buttons */}
          <View style={styles.actionsRow}>
            <TouchableOpacity
              onPress={handleRefresh}
              disabled={refreshing}
              style={[styles.actionBtn, { backgroundColor: theme.surfaceElevated, borderWidth: 1, borderColor: theme.border }]}
            >
              <Text style={[styles.actionBtnText, { color: theme.textSecondary }]}>
                {refreshing ? '↻ Verifying…' : '⚡ Test Connection'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleSave}
              style={[styles.actionBtn, { backgroundColor: theme.accent }]}
            >
              <Text style={[styles.actionBtnText, { color: '#FFF' }]}>Save Settings</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => onRemove(sender.id)}
              style={[styles.actionBtn, { backgroundColor: theme.dangerGlow }]}
            >
              <Text style={[styles.actionBtnText, { color: theme.danger }]}>Remove</Text>
            </TouchableOpacity>
          </View>
          {hasRefreshToken && (
            <Text style={{ fontSize: 10, color: theme.success, marginTop: 8, textAlign: 'center' }}>
              ✓ Permanent session active. Access tokens renew automatically in background without interruption.
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 12,
  },
  headerInfo: {
    flex: 1,
  },
  email: {
    fontSize: 14,
    fontWeight: '700',
  },
  accountMeta: {
    fontSize: 11,
    marginTop: 2,
  },
  attachPillRow: {
    marginTop: 5,
    flexDirection: 'row',
  },
  customAttachPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    maxWidth: '90%',
  },
  customAttachPillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  masterAttachPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  masterAttachPillText: {
    fontSize: 10,
    fontWeight: '500',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tokenBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  tokenBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  expandIcon: {
    fontSize: 10,
    fontWeight: '700',
  },
  expandedBody: {
    borderTopWidth: 1,
    padding: 14,
  },
  attachSection: {
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  attachSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  removeAttachText: {
    fontSize: 11,
    fontWeight: '700',
  },
  currentAttachBox: {
    paddingVertical: 4,
  },
  attachNameText: {
    fontSize: 12,
    fontWeight: '700',
  },
  attachNotice: {
    fontSize: 10,
    marginTop: 2,
    lineHeight: 14,
  },
  pickBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  pickBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  fieldRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 6,
  },
  fieldCol: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 4,
    letterSpacing: 0.3,
  },
  fieldInput: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  actionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statsPillRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  statBadgePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  statBadgePillText: {
    fontSize: 10,
    fontWeight: '600',
  },
  analyticsBox: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 12,
  },
  analyticsGrid: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  analyticsCol: {
    flex: 1,
    alignItems: 'center',
  },
  analyticsVal: {
    fontSize: 18,
    fontWeight: '800',
  },
  analyticsLbl: {
    fontSize: 9,
    fontWeight: '600',
    marginTop: 2,
    textTransform: 'uppercase',
  },
  lastSentText: {
    fontSize: 10,
    marginTop: 4,
    textAlign: 'center',
  },
  resetDailyBtn: {
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
  },
  resetDailyBtnText: {
    fontSize: 10,
    fontWeight: '700',
  },
});
