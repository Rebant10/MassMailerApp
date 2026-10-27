import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, StatusBar, Platform } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';

WebBrowser.maybeCompleteAuthSession();
import AccountsScreen from './src/screens/AccountsScreen';
import DataScreen from './src/screens/DataScreen';
import TemplateScreen from './src/screens/TemplateScreen';
import SendScreen from './src/screens/SendScreen';
import SettingsScreen from './src/screens/SettingsScreen';

function MainAppContent() {
  const [activeTab, setActiveTab] = useState('send');
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  const renderScreen = () => {
    switch (activeTab) {
      case 'accounts': return <AccountsScreen />;
      case 'data':     return <DataScreen />;
      case 'template': return <TemplateScreen onNavigateToSend={() => setActiveTab('send')} />;
      case 'send':     return <SendScreen />;
      case 'settings': return <SettingsScreen />;
      default:         return <SendScreen />;
    }
  };

  const navItems = [
    { key: 'accounts', label: 'Inboxes',  icon: '📬' },
    { key: 'data',     label: 'Leads',    icon: '📊' },
    { key: 'template', label: 'Template', icon: '✍️' },
    { key: 'send',     label: 'Send',     icon: '🚀' },
    { key: 'settings', label: 'Settings', icon: '⚙️' },
  ];

  // Dynamic padding to prevent Android 3-button nav (Back, Home, Recents) from covering bottom bar
  const bottomPadding = Math.max(insets.bottom, Platform.OS === 'android' ? 22 : 10);
  const topPadding = Math.max(insets.top, Platform.OS === 'android' ? 14 : 0);

  return (
    <View style={[styles.container, { backgroundColor: theme.bg, paddingTop: topPadding }]}>
      <StatusBar
        barStyle={theme.statusBar}
        backgroundColor={theme.bg}
        translucent
      />

      {/* Screen View */}
      <View style={styles.screenContainer}>
        {renderScreen()}
      </View>

      {/* Bottom Navigation Bar */}
      <View
        style={[
          styles.bottomNav,
          {
            backgroundColor: theme.surface,
            borderTopColor: theme.border,
            paddingBottom: bottomPadding,
          },
        ]}
      >
        {navItems.map((item) => {
          const isActive = activeTab === item.key;
          return (
            <TouchableOpacity
              key={item.key}
              onPress={() => setActiveTab(item.key)}
              style={[
                styles.navBtn,
                isActive && {
                  backgroundColor: theme.accentGlow,
                },
              ]}
              activeOpacity={0.7}
            >
              <Text style={styles.navIcon}>{item.icon}</Text>
              <Text
                style={[
                  styles.navLabel,
                  {
                    color: isActive ? theme.accentLight : theme.textSecondary,
                    fontWeight: isActive ? '800' : '600',
                  },
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <MainAppContent />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  screenContainer: {
    flex: 1,
  },
  bottomNav: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: 8,
    paddingHorizontal: 8,
  },
  navBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: 10,
  },
  navIcon: {
    fontSize: 18,
    marginBottom: 2,
  },
  navLabel: {
    fontSize: 10,
    letterSpacing: 0.2,
  },
});
