/**
 * Mass Mailer Mobile — Theme Context
 * Manages mode (dark | light | system) + aesthetic palette (Aura Void | Cyber Matcha | Golden Hour | Glacier Drip)
 */

import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PALETTES, DarkTheme } from '../config/themes';

const THEME_MODE_STORAGE_KEY = 'MM_THEME_MODE_PREF';
const PALETTE_STORAGE_KEY = 'MM_PALETTE_PREF';

const ThemeContext = createContext({
  theme: DarkTheme,
  themeMode: 'dark', // 'dark' | 'light' | 'system'
  paletteId: 'aura_void',
  isDark: true,
  setThemeMode: () => {},
  setPaletteId: () => {},
  palettes: PALETTES,
});

export function ThemeProvider({ children }) {
  const [themeMode, setThemeModeState] = useState('dark');
  const [paletteId, setPaletteIdState] = useState('aura_void');
  const [systemScheme, setSystemScheme] = useState(Appearance.getColorScheme());

  useEffect(() => {
    // Load saved preferences
    Promise.all([
      AsyncStorage.getItem(THEME_MODE_STORAGE_KEY),
      AsyncStorage.getItem(PALETTE_STORAGE_KEY),
    ]).then(([savedMode, savedPalette]) => {
      if (savedMode && ['dark', 'light', 'system'].includes(savedMode)) {
        setThemeModeState(savedMode);
      }
      if (savedPalette && PALETTES[savedPalette]) {
        setPaletteIdState(savedPalette);
      }
    }).catch(() => {});

    // Listen for system appearance change
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme);
    });

    return () => subscription?.remove?.();
  }, []);

  const setThemeMode = async (mode) => {
    setThemeModeState(mode);
    try {
      await AsyncStorage.setItem(THEME_MODE_STORAGE_KEY, mode);
    } catch (e) {
      console.warn('Failed to save theme mode:', e);
    }
  };

  const setPaletteId = async (id) => {
    if (!PALETTES[id]) return;
    setPaletteIdState(id);
    try {
      await AsyncStorage.setItem(PALETTE_STORAGE_KEY, id);
    } catch (e) {
      console.warn('Failed to save palette preference:', e);
    }
  };

  const isDark = useMemo(() => {
    if (themeMode === 'system') {
      return (systemScheme || 'dark') === 'dark';
    }
    return themeMode === 'dark';
  }, [themeMode, systemScheme]);

  const activePalette = PALETTES[paletteId] || PALETTES.aura_void;
  const theme = isDark ? activePalette.dark : activePalette.light;

  const contextValue = useMemo(() => ({
    theme,
    themeMode,
    paletteId,
    isDark,
    setThemeMode,
    setPaletteId,
    palettes: PALETTES,
    activePaletteMeta: {
      id: activePalette.id,
      name: activePalette.name,
      emoji: activePalette.emoji,
      vibe: activePalette.vibe,
      primaryColor: activePalette.primaryColor,
    },
  }), [theme, themeMode, paletteId, isDark, activePalette]);

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export default ThemeContext;
