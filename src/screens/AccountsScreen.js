/**
 * AccountsScreen — Manage Google sender accounts with refresh tokens and custom CVs
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Modal,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import SenderCard from '../components/SenderCard';
import { oauthService } from '../services/oauth';
import { storage } from '../services/storage';

export default function AccountsScreen() {
  const { theme } = useTheme();
  const [senders, setSenders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [authCodeInput, setAuthCodeInput] = useState('');
  const [showCodeInput, setShowCodeInput] = useState(false);

  useEffect(() => {
    loadSenders();
  }, []);

  const loadSenders = async () => {
    const list = await storage.getSenders();
    setSenders(list);
    // Background proactive auto-refresh
    oauthService.autoRefreshAllAccounts().then((refreshed) => {
      if (refreshed && refreshed.length > 0) {
        setSenders(refreshed);
      }
    });
  };

  const handleExchangeManualCode = async () => {
    if (!authCodeInput.trim()) {
      Alert.alert('Notice', 'Please paste the authorization code or redirect URL from the browser.');
      return;
    }
    setShowAddModal(false);
    setLoading(true);
    try {
      const newAcc = await oauthService.exchangeCodeForAccount(authCodeInput);
      const existingIdx = senders.findIndex(
        s => s.email.toLowerCase() === newAcc.email.toLowerCase()
      );

      let updatedList = [...senders];
      if (existingIdx !== -1) {
        updatedList[existingIdx] = {
          ...updatedList[existingIdx],
          ...newAcc,
          attachment: updatedList[existingIdx].attachment || newAcc.attachment || null,
        };
        Alert.alert('Refreshed ✓', `Updated credentials for ${newAcc.email}`);
      } else {
        updatedList.push(newAcc);
        Alert.alert('Account Connected ✨', `Successfully connected ${newAcc.email} with permanent session!`);
      }

      await storage.saveSenders(updatedList);
      setSenders(updatedList);
      setAuthCodeInput('');
      setShowCodeInput(false);
    } catch (e) {
      Alert.alert('Connection Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddAccount = async (specificEmail = null, mode = 'auto') => {
    setShowAddModal(false);
    setLoading(true);
    try {
      const emailToUse = specificEmail ? specificEmail.trim() : null;
      const effectiveMode = mode === 'new' ? 'new' : (emailToUse ? 'hint' : 'chooser');
      const newAcc = await oauthService.addGoogleAccount(null, null, emailToUse, effectiveMode);
      const existingIdx = senders.findIndex(
        s => s.email.toLowerCase() === newAcc.email.toLowerCase()
      );

      let updatedList = [...senders];
      if (existingIdx !== -1) {
        updatedList[existingIdx] = {
          ...updatedList[existingIdx],
          ...newAcc,
          attachment: updatedList[existingIdx].attachment || newAcc.attachment || null,
        };
        Alert.alert('Refreshed ✓', `Updated credentials for ${newAcc.email}`);
      } else {
        updatedList.push(newAcc);
        Alert.alert('Account Connected ✨', `Successfully connected ${newAcc.email} with permanent session!`);
      }

      await storage.saveSenders(updatedList);
      setSenders(updatedList);
      setLoginEmail('');
    } catch (e) {
      Alert.alert('Authentication Notice', e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateSender = async (updated) => {
    const newList = senders.map(s => (s.id === updated.id ? updated : s));
    setSenders(newList);
    await storage.saveSenders(newList);
  };

  const handleRemoveSender = (id) => {
    Alert.alert(
      'Remove Account',
      'Are you sure? This inbox will be removed from your sending pool.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const newList = senders.filter(s => s.id !== id);
            setSenders(newList);
            await storage.saveSenders(newList);
          },
        },
      ]
    );
  };

  const totalPoolCap = senders.reduce((sum, s) => sum + (s.dailyLimit || 500), 0);
  const validCount = senders.filter(s => s.tokenExpiresAt && Date.now() < s.tokenExpiresAt).length;

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1, paddingRight: 10 }}>
          <Text style={[styles.title, { color: theme.text }]}>Sender Inboxes</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]} numberOfLines={1}>
            {senders.length} connected • {totalPoolCap.toLocaleString()}/day cap
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => setShowAddModal(true)}
          disabled={loading}
          style={[styles.addBtn, { backgroundColor: theme.accent }]}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Text style={styles.addBtnText}>+ Add Account</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Info pill */}
      <View style={[styles.infoPill, { backgroundColor: theme.accentGlow, borderColor: theme.accentGlowStrong }]}>
        <Text style={[styles.infoPillText, { color: theme.accentLight }]}>
          ✓ Permanent Session Active: Inboxes rotate automatically in round-robin and tokens renew in the background without any manual action. Expand any inbox to set a custom CV or daily limits.
        </Text>
      </View>

      {/* Account list */}
      <FlatList
        data={senders}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <SenderCard
            sender={item}
            onUpdate={handleUpdateSender}
            onRemove={handleRemoveSender}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyIcon]}>📬</Text>
            <Text style={[styles.emptyTitle, { color: theme.textSecondary }]}>No Inboxes Connected</Text>
            <Text style={[styles.emptyDesc, { color: theme.textTertiary }]}>
              Tap "+ Add Account" to connect your outreach Gmail or Google Workspace accounts.
            </Text>
          </View>
        }
      />

      {/* Connect Account Modal with Direct Email Selector */}
      <Modal
        visible={showAddModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Connect Google Account</Text>
            <Text style={[styles.modalDesc, { color: theme.textSecondary }]}>
              Enter your outreach email address below to open Google directly to that account and prevent Chrome from auto-selecting your default phone profile.
            </Text>

            <View style={{ marginTop: 12 }}>
              <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>
                Outreach Account Email (Recommended)
              </Text>
              <TextInput
                style={[
                  styles.modalInput,
                  {
                    backgroundColor: theme.surfaceElevated,
                    color: theme.text,
                    borderColor: theme.border,
                  },
                ]}
                placeholder="e.g. myoutreach@gmail.com"
                placeholderTextColor={theme.textTertiary}
                value={loginEmail}
                onChangeText={setLoginEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.modalActions}>
              {loginEmail.trim() ? (
                <TouchableOpacity
                  onPress={() => handleAddAccount(loginEmail, 'hint')}
                  style={[styles.primaryModalBtn, { backgroundColor: theme.accent }]}
                >
                  <Text style={styles.primaryModalBtnText}>
                    👉 Sign in as {loginEmail.trim()}
                  </Text>
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                onPress={() => handleAddAccount(null, 'new')}
                style={[
                  styles.primaryModalBtn,
                  {
                    backgroundColor: loginEmail.trim() ? theme.surfaceElevated : theme.accent,
                    borderColor: theme.accent,
                    borderWidth: loginEmail.trim() ? 1 : 0,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.primaryModalBtnText,
                    { color: loginEmail.trim() ? theme.accentLight : '#FFF' },
                  ]}
                >
                  ➕ Sign in to Another Account (Fresh Login)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => handleAddAccount(null, 'chooser')}
                style={[styles.secondaryModalBtn, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}
              >
                <Text style={[styles.secondaryModalBtnText, { color: theme.textSecondary }]}>
                  👥 Pick from Phone Accounts
                </Text>
              </TouchableOpacity>

              {/* Paste Code / URL Fallback */}
              {!showCodeInput ? (
                <TouchableOpacity
                  onPress={() => setShowCodeInput(true)}
                  style={{ marginTop: 10, paddingVertical: 8, alignItems: 'center' }}
                >
                  <Text style={{ color: theme.accentLight, fontSize: 13, textDecorationLine: 'underline' }}>
                    🔗 Browser didn't redirect back? Paste Code / URL
                  </Text>
                </TouchableOpacity>
              ) : (
                <View style={{ marginTop: 10, padding: 10, borderRadius: 8, backgroundColor: theme.surfaceElevated, borderWidth: 1, borderColor: theme.border }}>
                  <Text style={[styles.inputLabel, { color: theme.textSecondary, marginBottom: 4 }]}>
                    Paste browser URL or code:
                  </Text>
                  <TextInput
                    style={[styles.modalInput, { backgroundColor: theme.surface, color: theme.text, borderColor: theme.border, fontSize: 12, height: 44 }]}
                    placeholder="https://auth.expo.io/... or 4/0A..."
                    placeholderTextColor={theme.textTertiary}
                    value={authCodeInput}
                    onChangeText={setAuthCodeInput}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TouchableOpacity
                    onPress={handleExchangeManualCode}
                    style={[styles.primaryModalBtn, { backgroundColor: theme.accent, marginTop: 8 }]}
                  >
                    <Text style={styles.primaryModalBtnText}>⚡ Complete Sign-In</Text>
                  </TouchableOpacity>
                </View>
              )}

              <TouchableOpacity
                onPress={() => {
                  setShowAddModal(false);
                  setShowCodeInput(false);
                }}
                style={[styles.cancelModalBtn, { borderColor: theme.border }]}
              >
                <Text style={[styles.cancelModalBtnText, { color: theme.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
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
  infoPill: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
  },
  infoPillText: {
    fontSize: 11,
    lineHeight: 16,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalBox: {
    width: '100%',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 6,
  },
  modalDesc: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  modalInput: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
  },
  modalActions: {
    marginTop: 18,
    gap: 8,
  },
  primaryModalBtn: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryModalBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  cancelModalBtn: {
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
  },
  cancelModalBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  secondaryModalBtn: {
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    borderWidth: 1,
  },
  secondaryModalBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
