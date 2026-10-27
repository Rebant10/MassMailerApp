/**
 * StatCard — Themed stat display card with high-contrast labels, badges & subtext
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';

export default function StatCard({
  title,
  label,
  value = 0,
  color,
  variant,
  icon,
  subtext,
}) {
  const { theme } = useTheme();

  // Resolve title / label
  const displayTitle = title || label || 'Metric';

  // Resolve color by variant or custom color
  const resolveColor = () => {
    if (color) return color;
    switch (variant) {
      case 'success':
        return theme.success || '#10B981';
      case 'danger':
      case 'error':
        return theme.danger || '#EF4444';
      case 'warning':
        return theme.warning || '#F59E0B';
      case 'info':
        return theme.info || '#06B6D4';
      default:
        return theme.accent || '#6366F1';
    }
  };

  // Resolve icon
  const resolveIcon = () => {
    if (icon) return icon;
    switch (variant) {
      case 'success': return '✓';
      case 'danger':
      case 'error':   return '✗';
      case 'warning': return '⏭';
      case 'info':    return '📊';
      default: {
        const lower = String(displayTitle).toLowerCase();
        if (lower.includes('sent')) return '✓';
        if (lower.includes('fail') || lower.includes('error')) return '✗';
        if (lower.includes('skip')) return '⏭';
        if (lower.includes('lead') || lower.includes('total')) return '📊';
        return null;
      }
    }
  };

  const displayColor = resolveColor();
  const displayIcon = resolveIcon();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.surfaceElevated || theme.surface,
          borderColor: `${displayColor}40`,
        },
      ]}
    >
      {/* Top Header Badge: Icon + Label */}
      <View style={[styles.headerBadge, { backgroundColor: `${displayColor}18` }]}>
        {displayIcon && (
          <Text style={[styles.icon, { color: displayColor }]}>{displayIcon}</Text>
        )}
        <Text style={[styles.title, { color: displayColor }]} numberOfLines={1}>
          {displayTitle}
        </Text>
      </View>

      {/* Main Stat Number */}
      <Text style={[styles.value, { color: displayColor }]}>
        {typeof value === 'number' ? value.toLocaleString() : (value !== undefined && value !== null ? value : 0)}
      </Text>

      {/* Bottom Subtext */}
      {subtext ? (
        <Text style={[styles.subtext, { color: theme.textSecondary }]} numberOfLines={1}>
          {subtext}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 6,
    marginHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
    marginBottom: 6,
  },
  icon: {
    fontSize: 11,
    fontWeight: '800',
  },
  title: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  value: {
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  subtext: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
  },
});
