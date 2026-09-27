import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ThemeProvider, useTheme, THEMES } from '../../../src/shared/context/ThemeContext';

describe('ThemeContext', () => {
  let originalLocalStorage;

  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    // Reset the html element classes
    document.documentElement.className = '';
  });

  it('defaults to system theme if nothing is persisted', () => {
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });
    expect(result.current.theme.id).toBe('system');
  });

  it('applies the light theme class to <html>', () => {
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });

    act(() => {
      result.current.setTheme('light');
    });

    expect(result.current.theme.id).toBe('light');
    expect(document.documentElement.classList.contains('theme-light')).toBe(true);
    expect(document.documentElement.classList.contains('theme-high-contrast')).toBe(false);
  });

  it('applies the high-contrast theme class to <html>', () => {
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });

    act(() => {
      result.current.setTheme('high-contrast');
    });

    expect(result.current.theme.id).toBe('high-contrast');
    expect(document.documentElement.classList.contains('theme-high-contrast')).toBe(true);
    expect(document.documentElement.classList.contains('theme-light')).toBe(false);
  });

  it('removes the old theme class when switching themes', () => {
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });

    act(() => { result.current.setTheme('light'); });
    expect(document.documentElement.classList.contains('theme-light')).toBe(true);

    act(() => { result.current.setTheme('high-contrast'); });
    expect(document.documentElement.classList.contains('theme-light')).toBe(false);
    expect(document.documentElement.classList.contains('theme-high-contrast')).toBe(true);
  });

  it('persists theme selection in localStorage', () => {
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });

    act(() => { result.current.setTheme('light'); });

    expect(localStorage.getItem('codelens:theme')).toBe('light');
  });

  it('restores theme from localStorage on mount', () => {
    localStorage.setItem('codelens:theme', 'high-contrast');
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });

    expect(result.current.theme.id).toBe('high-contrast');
  });

  it('falls back to system if an unknown theme is in localStorage', () => {
    localStorage.setItem('codelens:theme', 'non-existent-theme');
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });
    expect(result.current.theme.id).toBe('system');
  });

  it('exposes all three themes in the THEMES export', () => {
    expect(Object.keys(THEMES)).toContain('dark');
    expect(Object.keys(THEMES)).toContain('light');
    expect(Object.keys(THEMES)).toContain('high-contrast');
  });
});
