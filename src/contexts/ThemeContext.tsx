import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

export type ThemeMode = 'light' | 'dark';

interface ThemeContextValue {
  theme: ThemeMode;
  isDark: boolean;
  setTheme: (mode: ThemeMode) => void;
  toggleTheme: () => void;
  applyDefaultThemeIfUnset: (defaultMode: ThemeMode) => void;
}

const THEME_STORAGE_KEY = 'vehicleapp_theme_mode';
const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredTheme(): ThemeMode | null {
  try {
    const val = localStorage.getItem(THEME_STORAGE_KEY);
    if (val === 'dark' || val === 'light') return val;
    return null;
  } catch {
    return null;
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const userHasExplicitPrefRef = useRef<boolean>(readStoredTheme() !== null);

  const [theme, setThemeState] = useState<ThemeMode>(() => readStoredTheme() ?? 'light');

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  const setTheme = useCallback((mode: ThemeMode) => {
    userHasExplicitPrefRef.current = true;
    setThemeState(mode);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch {
      // ignore storage restrictions
    }
  }, []);

  const toggleTheme = useCallback(() => {
    userHasExplicitPrefRef.current = true;
    setThemeState((prev) => {
      const next: ThemeMode = prev === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        // ignore storage restrictions
      }
      return next;
    });
  }, []);

  const applyDefaultThemeIfUnset = useCallback((defaultMode: ThemeMode) => {
    if (!userHasExplicitPrefRef.current) {
      setThemeState(defaultMode);
    }
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        isDark: theme === 'dark',
        setTheme,
        toggleTheme,
        applyDefaultThemeIfUnset,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
