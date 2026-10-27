/**
 * StepIndicator — 3-step wizard progress dots for Campaign flow
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';

const STEPS = ['Template', 'Preview', 'Send'];

export default function StepIndicator({ currentStep = 1 }) {
  const { theme } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {STEPS.map((label, i) => {
        const stepNum = i + 1;
        const isActive = stepNum === currentStep;
        const isCompleted = stepNum < currentStep;
        const isLast = i === STEPS.length - 1;

        return (
          <View key={label} style={styles.stepWrapper}>
            <View style={styles.stepRow}>
              {/* Dot */}
              <View
                style={[
                  styles.dot,
                  isCompleted && { backgroundColor: theme.accent },
                  isActive && { backgroundColor: theme.accent, ...styles.activeDot },
                  !isActive && !isCompleted && { backgroundColor: theme.surfacePressed, borderWidth: 2, borderColor: theme.textTertiary },
                ]}
              >
                {isCompleted ? (
                  <Text style={styles.checkmark}>✓</Text>
                ) : (
                  <Text style={[
                    styles.dotNumber,
                    (isActive || isCompleted) && { color: '#FFF' },
                    !isActive && !isCompleted && { color: theme.textTertiary },
                  ]}>
                    {stepNum}
                  </Text>
                )}
              </View>

              {/* Connector line */}
              {!isLast && (
                <View
                  style={[
                    styles.connector,
                    { backgroundColor: isCompleted ? theme.accent : theme.border },
                  ]}
                />
              )}
            </View>

            {/* Label */}
            <Text
              style={[
                styles.label,
                { color: isActive ? theme.accent : isCompleted ? theme.textSecondary : theme.textTertiary },
                isActive && styles.labelActive,
              ]}
            >
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  stepWrapper: {
    alignItems: 'center',
    flex: 1,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    justifyContent: 'center',
  },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  dotNumber: {
    fontSize: 12,
    fontWeight: '700',
  },
  checkmark: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '800',
  },
  connector: {
    flex: 1,
    height: 2,
    borderRadius: 1,
    marginHorizontal: 4,
  },
  label: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: '600',
  },
  labelActive: {
    fontWeight: '700',
  },
});
