/**
 * LogView — Terminal-style live activity log viewer
 * Uses a ScrollView with nestedScrollEnabled to eliminate the
 * "VirtualizedLists should never be nested inside plain ScrollViews" warning
 * and support smooth auto-scrolling to the bottom as events arrive.
 */

import React, { useRef, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';

export default function LogView({ logs = [], maxHeight = 240 }) {
  const { theme } = useTheme();
  const scrollViewRef = useRef(null);

  useEffect(() => {
    if (scrollViewRef.current && logs.length > 0) {
      scrollViewRef.current.scrollToEnd({ animated: true });
    }
  }, [logs.length]);

  const getLogColor = (type) => {
    switch (type) {
      case 'success': return theme.success;
      case 'danger':  return theme.danger;
      case 'warning': return theme.warning;
      default:        return theme.textSecondary;
    }
  };

  if (logs.length === 0) {
    return (
      <View style={[styles.emptyWrap, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.emptyText, { color: theme.textTertiary }]}>
          No activity yet. Start a campaign to see live logs here.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.surface, borderColor: theme.border, maxHeight }]}>
      <ScrollView
        ref={scrollViewRef}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        nestedScrollEnabled={true}
        showsVerticalScrollIndicator={true}
      >
        {logs.map((item, idx) => (
          <View key={item.id ? String(item.id) : String(idx)} style={[styles.logRow, { borderBottomColor: theme.border }]}>
            <Text style={[styles.logTime, { color: theme.textTertiary }]}>{item.time || ''}</Text>
            <Text style={[styles.logMsg, { color: getLogColor(item.type) }]}>
              {item.msg}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  list: {
    flexGrow: 0,
  },
  listContent: {
    padding: 8,
  },
  logRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    borderBottomWidth: 1,
  },
  logTime: {
    fontSize: 10,
    fontWeight: '600',
    width: 65,
    fontVariant: ['tabular-nums'],
  },
  logMsg: {
    fontSize: 11,
    flex: 1,
    lineHeight: 15,
  },
  emptyWrap: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 12,
    textAlign: 'center',
  },
});
