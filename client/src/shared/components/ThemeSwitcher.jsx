import { useRef, useState, useEffect } from 'react';
import { useTheme, COLOR_THEMES, GROUP_COLORS, GROUP_TEXT_COLORS } from '../context/ThemeContext';
import { Sun, Moon, Monitor } from 'lucide-react';

/* ── SVG icon library (no emoji) ─────────────────────────────────────────── */
const ICONS = {
  monitor: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-4 h-4"
    >
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  ),
  droplet: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-4 h-4"
    >
      <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
    </svg>
  ),
  leaf: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-4 h-4"
    >
      <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z" />
      <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
    </svg>
  ),
  flower: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-4 h-4"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2a4 4 0 0 1 0 8" />
      <path d="M12 14a4 4 0 0 1 0 8" />
      <path d="M4.93 4.93a4 4 0 0 1 5.66 5.66" />
      <path d="M13.41 13.41a4 4 0 0 1 5.66 5.66" />
      <path d="M4.93 19.07a4 4 0 0 1 5.66-5.66" />
      <path d="M13.41 10.59a4 4 0 0 1 5.66-5.66" />
    </svg>
  ),
  contrast: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-4 h-4"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a10 10 0 0 1 0 20z" fill="currentColor" stroke="none" />
    </svg>
  ),
};

export default function ThemeSwitcher() {
  const { colorTheme, setColorTheme, mode, setMode } = useTheme();
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const click = e => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    const key = e => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', click);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', click);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  const activeTheme = COLOR_THEMES.find(t => t.id === colorTheme) || COLOR_THEMES[0];

  return (
    <div className="relative" ref={containerRef}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Appearance"
        aria-expanded={open}
        aria-haspopup="menu"
        title="Appearance"
        className="flex items-center justify-center w-7 h-7 rounded-md text-muted hover:text-text hover:bg-surface border border-transparent hover:border-border transition-colors"
      >
        {ICONS[activeTheme.iconKey]}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1.5 w-60 bg-panel border border-border rounded-xl shadow-2xl z-[200] animate-in fade-in zoom-in-95 duration-150 max-h-[75vh] overflow-y-auto custom-scrollbar"
        >
          {/* Header */}
          <div className="flex flex-col px-3 pt-3 pb-2 border-b border-border/60 gap-3">
            <p className="text-[10px] text-muted uppercase tracking-widest font-semibold">Appearance</p>

            {/* Mode Selector */}
            <div className="flex bg-surface rounded-lg p-1 border border-border">
              <button
                onClick={() => setMode('light')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[11px] font-medium transition-all ${
                  mode === 'light'
                    ? 'bg-panel text-text shadow-sm border border-border/50'
                    : 'text-muted hover:text-text hover:bg-panel/50 border border-transparent'
                }`}
              >
                <Sun className="w-3.5 h-3.5" /> Light
              </button>
              <button
                onClick={() => setMode('dark')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[11px] font-medium transition-all ${
                  mode === 'dark'
                    ? 'bg-panel text-text shadow-sm border border-border/50'
                    : 'text-muted hover:text-text hover:bg-panel/50 border border-transparent'
                }`}
              >
                <Moon className="w-3.5 h-3.5" /> Dark
              </button>
              <button
                onClick={() => setMode('system')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[11px] font-medium transition-all ${
                  mode === 'system'
                    ? 'bg-panel text-text shadow-sm border border-border/50'
                    : 'text-muted hover:text-text hover:bg-panel/50 border border-transparent'
                }`}
              >
                <Monitor className="w-3.5 h-3.5" /> Auto
              </button>
            </div>
          </div>

          {/* Color Themes */}
          <div className="py-2">
            <p className="px-4 text-[10px] text-muted font-medium tracking-wide uppercase mb-1">Color Theme</p>
            <div className="px-1.5 space-y-0.5">
              {COLOR_THEMES.map(t => {
                const isActive = colorTheme === t.id;
                return (
                  <button
                    key={t.id}
                    role="menuitem"
                    onClick={() => {
                      setColorTheme(t.id);
                      setOpen(false);
                    }}
                    aria-current={isActive ? 'true' : undefined}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors ${
                      isActive ? 'bg-accent/15 text-accent font-medium' : 'text-muted hover:text-text hover:bg-surface'
                    }`}
                  >
                    <span
                      className={`w-4 h-4 shrink-0 flex items-center justify-center ${GROUP_TEXT_COLORS[t.id] ?? 'text-muted'}`}
                    >
                      {ICONS[t.iconKey]}
                    </span>
                    <span className={`flex-1 text-left text-[13px] ${isActive ? 'font-semibold' : 'font-normal'}`}>
                      {t.label}
                    </span>
                    {isActive && <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-accent" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
