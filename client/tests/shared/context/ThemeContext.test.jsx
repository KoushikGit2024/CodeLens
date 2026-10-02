import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ThemeProvider, useTheme, COLOR_THEMES } from '../../../src/shared/context/ThemeContext';

describe('ThemeContext', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
  });

  it('defaults to system mode and graphite color if nothing is persisted', () => {
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });
    expect(result.current.mode).toBe('system');
    expect(result.current.colorTheme).toBe('graphite');
  });

  it('applies the correct theme class to <html> for light mode', () => {
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });

    act(() => {
      result.current.setMode('light');
    });

    expect(result.current.resolvedMode).toBe('light');
    expect(document.documentElement.classList.contains('theme-light')).toBe(true);
  });

  it('applies the correct theme class for custom color themes', () => {
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });

    act(() => {
      result.current.setColorTheme('high-contrast');
      result.current.setMode('dark');
    });

    expect(result.current.colorTheme).toBe('high-contrast');
    expect(document.documentElement.classList.contains('theme-high-contrast-dark')).toBe(true);
  });

  it('persists mode and color selection in localStorage', () => {
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });

    act(() => {
      result.current.setMode('light');
      result.current.setColorTheme('ocean');
    });

    expect(localStorage.getItem('codelens:themeMode')).toBe('light');
    expect(localStorage.getItem('codelens:colorTheme')).toBe('ocean');
  });

  it('restores theme from localStorage on mount', () => {
    localStorage.setItem('codelens:themeMode', 'light');
    localStorage.setItem('codelens:colorTheme', 'forest');
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });

    expect(result.current.mode).toBe('light');
    expect(result.current.colorTheme).toBe('forest');
  });

  it('exposes all available color themes in the COLOR_THEMES export', () => {
    const themeIds = COLOR_THEMES.map(t => t.id);
    expect(themeIds).toContain('graphite');
    expect(themeIds).toContain('ocean');
    expect(themeIds).toContain('high-contrast');
  });
});
