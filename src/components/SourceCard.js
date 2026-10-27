/**
 * SourceCard — Display card for a single lead data source
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useTheme } from '../context/ThemeContext';

export default function SourceCard({ source, onPreview, onRemove, onRefresh }) {
  const { theme } = useTheme();
  const [refreshing, setRefreshing] = useState(false);

  const isGoogle = source.type === 'google';
  const icon = isGoogle ? '📄' : '📊';
  const typeLabel = isGoogle ? 'Google Sheet' : 'Local CSV';
  const rowCount = source.rows?.length || 0;
  const colCount = source.headers?.length || 0;

  const handleSyncPress = async () => {
    if (!onRefresh) return;
    try {
      setRefreshing(true);
      await onRefresh(source);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.topRow}>
        <View style={styles.iconWrap}>
          <Text style={styles.icon}>{icon}</Text>
        </View>
        <View style={styles.info}>
          <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
            {source.name || 'Untitled Source'}
          </Text>
          <Text style={[styles.meta, { color: theme.textSecondary }]}>
            {typeLabel} {isGoogle ? `• Tab: ${source.sheetName || 'Sheet1'}` : ''} • {rowCount} leads • {colCount} cols
          </Text>
          {source.importedAt && (
            <Text style={[styles.date, { color: theme.textTertiary }]}>
              Last synced {new Date(source.importedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          )}
        </View>
      </View>

      {/* Detected columns preview */}
      {source.headers && source.headers.length > 0 && (
        <View style={styles.chipRow}>
          {source.headers.slice(0, 5).map((h, i) => (
            <View key={i} style={[styles.chip, { backgroundColor: theme.accentGlow }]}>
              <Text style={[styles.chipText, { color: theme.accentLight }]}>{`{${h}}`}</Text>
            </View>
          ))}
          {source.headers.length > 5 && (
            <Text style={[styles.moreText, { color: theme.textTertiary }]}>
              +{source.headers.length - 5} more
            </Text>
          )}
        </View>
      )}

      {/* Actions */}
      <View style={styles.actionsRow}>
        {onPreview && (
          <TouchableOpacity
            onPress={() => onPreview(source)}
            style={[styles.actionBtn, { backgroundColor: theme.accentGlow }]}
            activeOpacity={0.7}
          >
            <Text style={[styles.actionBtnText, { color: theme.accent }]}>👁️ Preview</Text>
          </TouchableOpacity>
        )}

        {isGoogle && onRefresh && (
          <TouchableOpacity
            onPress={handleSyncPress}
            disabled={refreshing}
            style={[styles.actionBtn, { backgroundColor: theme.infoGlow }]}
            activeOpacity={0.7}
          >
            {refreshing ? (
              <ActivityIndicator size="small" color={theme.info} style={{ transform: [{ scale: 0.8 }] }} />
            ) : (
              <Text style={[styles.actionBtnText, { color: theme.info }]}>🔄 Sync</Text>
            )}
          </TouchableOpacity>
        )}

        {source.tabs && source.tabs.length > 1 && (
          <View style={[styles.tabBadge, { backgroundColor: theme.surfaceElevated }]}>
            <Text style={[styles.tabBadgeText, { color: theme.textTertiary }]}>
              {source.tabs.length} tabs
            </Text>
          </View>
        )}

        <View style={{ flex: 1 }} />

        {onRemove && (
          <TouchableOpacity
            onPress={() => onRemove(source.id)}
            style={[styles.actionBtn, { backgroundColor: theme.dangerGlow }]}
            activeOpacity={0.7}
          >
            <Text style={[styles.actionBtnText, { color: theme.danger }]}>Remove</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  icon: {
    fontSize: 22,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 14,
    fontWeight: '700',
  },
  meta: {
    fontSize: 11,
    marginTop: 2,
  },
  date: {
    fontSize: 10,
    marginTop: 1,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 10,
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
  moreText: {
    fontSize: 10,
    alignSelf: 'center',
    marginLeft: 4,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    minHeight: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  tabBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  tabBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
});
