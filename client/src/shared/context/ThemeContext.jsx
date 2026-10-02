import { createContext, useContext, useEffect, useState } from 'react';

/**
 * Color themes (base palettes).
 */
export const COLOR_THEMES = [
  { id: 'graphite', label: 'Graphite', iconKey: 'monitor' },
  { id: 'ocean', label: 'Ocean', iconKey: 'droplet' },
  { id: 'forest', label: 'Forest', iconKey: 'leaf' },
  { id: 'rose', label: 'Rose Gold', iconKey: 'flower' },
  { id: 'high-contrast', label: 'High Contrast', iconKey: 'contrast' },
];

export const GROUP_COLORS = {
  graphite: 'bg-accent',
  ocean: 'bg-[#00BCD4]',
  forest: 'bg-[#69BD64]',
  rose: 'bg-[#F48FB1]',
  'high-contrast': 'bg-text',
};

export const GROUP_TEXT_COLORS = {
  graphite: 'text-accent',
  ocean: 'text-[#00BCD4]',
  forest: 'text-[#69BD64]',
  rose: 'text-[#F48FB1]',
  'high-contrast': 'text-text',
};

const STORAGE_KEY_COLOR = 'codelens:colorTheme';
const STORAGE_KEY_MODE = 'codelens:themeMode';

const ThemeContext = createContext({
  colorTheme: 'graphite',
  mode: 'system',
  resolvedMode: 'dark',
  setColorTheme: () => {},
  setMode: () => {},
  theme: { id: 'dark' }, // backwards compatibility
});

function resolveSystemMode() {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  return prefersDark ? 'dark' : 'light';
}

function getHtmlClass(colorTheme, resolvedMode) {
  if (colorTheme === 'graphite') {
    return resolvedMode === 'light' ? 'theme-light' : '';
  }

  return `theme-${colorTheme}-${resolvedMode}`;
}

function applyThemeClass(htmlClass) {
  const root = document.documentElement;
  // Remove all theme classes
  const classesToRemove = Array.from(root.classList).filter(c => c.startsWith('theme-'));
  classesToRemove.forEach(c => root.classList.remove(c));

  if (htmlClass) root.classList.add(htmlClass);
}

export function ThemeProvider({ children }) {
  const [colorTheme, setColorThemeState] = useState(() => {
    return localStorage.getItem(STORAGE_KEY_COLOR) || 'graphite';
  });

  const [mode, setModeState] = useState(() => {
    return localStorage.getItem(STORAGE_KEY_MODE) || 'system';
  });

  const [resolvedMode, setResolvedMode] = useState(() => {
    return mode === 'system' ? resolveSystemMode() : mode;
  });

  const setColorTheme = newColorTheme => {
    setColorThemeState(newColorTheme);
    localStorage.setItem(STORAGE_KEY_COLOR, newColorTheme);
  };

  const setMode = newMode => {
    setModeState(newMode);
    localStorage.setItem(STORAGE_KEY_MODE, newMode);
  };

  useEffect(() => {
    const currentResolvedMode = mode === 'system' ? resolveSystemMode() : mode;
    setResolvedMode(currentResolvedMode);

    const htmlClass = getHtmlClass(colorTheme, currentResolvedMode);
    applyThemeClass(htmlClass);
  }, [colorTheme, mode]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if (mode === 'system') {
        const currentResolvedMode = resolveSystemMode();
        setResolvedMode(currentResolvedMode);
        applyThemeClass(getHtmlClass(colorTheme, currentResolvedMode));
      }
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [mode, colorTheme]);

  // Backwards compatibility object for legacy components
  const backwardsCompatTheme = {
    id: `${colorTheme}-${resolvedMode}`,
    label: COLOR_THEMES.find(t => t.id === colorTheme)?.label || 'Theme',
    iconKey: COLOR_THEMES.find(t => t.id === colorTheme)?.iconKey || 'monitor',
  };

  return (
    <ThemeContext.Provider
      value={{ colorTheme, setColorTheme, mode, setMode, resolvedMode, theme: backwardsCompatTheme }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
