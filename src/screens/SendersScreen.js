import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { THEME } from '../config/constants';
import SenderCard from '../components/SenderCard';
import { oauthService } from '../services/oauth';
import { storage } from '../services/storage';

export default function SendersScreen() {
  const [senders, setSenders] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadSenders();
  }, []);

  const loadSenders = async () => {
    const list = await storage.getSenders();
    setSenders(list);
  };

  const handleAddAccount = async () => {
    setLoading(true);
    try {
      const newAcc = await oauthService.addGoogleAccount();
      const existingIdx = senders.findIndex(s => s.email.toLowerCase() === newAcc.email.toLowerCase());

      let updatedList = [...senders];
      if (existingIdx !== -1) {
        updatedList[existingIdx] = { ...updatedList[existingIdx], ...newAcc };
        Alert.alert('Refreshed', `Updated credentials and refresh token for ${newAcc.email}`);
      } else {
        updatedList.push(newAcc);
        Alert.alert('Account Added', `Successfully connected ${newAcc.email} (${newAcc.accountType}) with permanent refresh token!`);
      }

      await storage.saveSenders(updatedList);
      setSenders(updatedList);
    } catch (e) {
      Alert.alert('Authentication Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateSender = async (updated) => {
    const newList = senders.map(s => s.id === updated.id ? updated : s);
    setSenders(newList);
    await storage.saveSenders(newList);
  };

  const handleRemoveSender = (id) => {
    Alert.alert(
      'Remove Account',
      'Are you sure you want to remove this inbox from your sending pool?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const newList = senders.filter(s => s.id !== id);
            setSenders(newList);
            await storage.saveSenders(newList);
          }
        }
      ]
    );
  };

  const totalPoolCap = senders.reduce((sum, s) => sum + (s.dailyLimit || 500), 0);

  return (
    <View style={styles.container}>
      {/* Header bar */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Inbox Pool</Text>
          <Text style={styles.subtitle}>
            {senders.length} Account(s) • Total Capacity: {totalPoolCap}/day
          </Text>
        </View>

        <TouchableOpacity
          onPress={handleAddAccount}
          disabled={loading}
          style={styles.addBtn}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.addBtnText}>+ Connect Account</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Info Pill */}
      <View style={styles.infoBanner}>
        <Text style={styles.infoBannerText}>
          💡 Multi-account rotation rotates sends round-robin across connected inboxes. Sessions stay permanently connected with refresh tokens.
        </Text>
      </View>

      {/* List */}
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
            <Text style={styles.emptyTitle}>No Inboxes Connected</Text>
            <Text style={styles.emptyDesc}>
              Tap the button above to authenticate your Gmail or Google Workspace accounts.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.bg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: THEME.text,
  },
  subtitle: {
    fontSize: 12,
    color: THEME.textMuted,
    marginTop: 2,
  },
  addBtn: {
    backgroundColor: THEME.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  infoBanner: {
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.2)',
  },
  infoBannerText: {
    color: THEME.primaryLight,
    fontSize: 11,
    lineHeight: 15,
  },
  listContent: {
    padding: 16,
    paddingTop: 4,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    color: THEME.textMuted,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptyDesc: {
    color: THEME.textDim,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
});
