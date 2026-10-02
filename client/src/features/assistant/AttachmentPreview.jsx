/**
 * AttachmentPreview.jsx
 *
 * A glassmorphic floating modal that shows a full preview of an attached chip:
 *   • image   → full-size lightbox with zoom
 *   • file    → syntax-highlighted code with language detection and line numbers
 *   • snippet → formatted text block with word-wrap
 *
 * Triggered by clicking the chip's preview button (Eye icon).
 * Closes on Escape, backdrop click, or the X button.
 */
import React, { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, FileCode, AlignLeft, Image as ImageIcon } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

// ── Language detection from file extension ─────────────────────────────────────
const EXT_LANG = {
  js: 'javascript',
  jsx: 'jsx',
  ts: 'typescript',
  tsx: 'tsx',
  py: 'python',
  java: 'java',
  go: 'go',
  rs: 'rust',
  rb: 'ruby',
  cs: 'csharp',
  cpp: 'cpp',
  c: 'c',
  h: 'c',
  html: 'html',
  css: 'css',
  scss: 'scss',
  less: 'less',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  md: 'markdown',
  sh: 'bash',
  bash: 'bash',
  sql: 'sql',
  xml: 'xml',
  graphql: 'graphql',
};

function detectLanguage(name) {
  const ext = name?.split('.').pop()?.toLowerCase() || '';
  return EXT_LANG[ext] || 'text';
}

// ── Download helper ────────────────────────────────────────────────────────────
function downloadText(content, filename) {
  const dateStamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('_');
  const uniqueName = filename.includes('.')
    ? filename.replace(/(\.[^.]+)$/, `_${dateStamp}$1`)
    : `${filename}_${dateStamp}`;
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = uniqueName;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadImage(dataUrl, filename) {
  const dateStamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('_');
  const uniqueName = filename.includes('.')
    ? filename.replace(/(\.[^.]+)$/, `_${dateStamp}$1`)
    : `${filename}_${dateStamp}`;
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = uniqueName;
  a.click();
}

// ── Type meta ──────────────────────────────────────────────────────────────────
const TYPE_META = {
  file: { icon: FileCode, label: 'Code File', color: '#61dafb' },
  image: { icon: ImageIcon, label: 'Image', color: '#a855f7' },
  snippet: { icon: AlignLeft, label: 'Text Snippet', color: '#e3b341' },
};

// ── Component ──────────────────────────────────────────────────────────────────
export default function AttachmentPreview({ attachment, onClose }) {
  const backdropRef = useRef(null);
  const meta = TYPE_META[attachment.type] || TYPE_META.file;
  const Icon = meta.icon;

  // Close on Escape
  useEffect(() => {
    const handle = e => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [onClose]);

  // Close on backdrop click
  const handleBackdropClick = useCallback(
    e => {
      if (e.target === backdropRef.current) onClose();
    },
    [onClose]
  );

  const lang = detectLanguage(attachment.name);
  const lineCount = attachment.content ? attachment.content.split('\n').length : 0;

  const modal = (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
    >
      <div
        className="relative flex flex-col rounded-xl border border-border shadow-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(135deg,#0d1117ee,#161b22ee)',
          backdropFilter: 'blur(16px)',
          width: attachment.type === 'image' ? 'auto' : 'min(900px, 95vw)',
          maxWidth: '95vw',
          maxHeight: '90vh',
        }}
      >
        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div
          className="shrink-0 flex items-center gap-3 px-5 py-3 border-b border-border/60"
          style={{ background: 'rgba(255,255,255,0.03)' }}
        >
          <Icon className="w-4 h-4 shrink-0" style={{ color: meta.color }} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-text truncate" title={attachment.name}>
              {attachment.name}
            </div>
            <div className="text-[10px] text-muted flex items-center gap-2 mt-0.5">
              <span className="uppercase tracking-widest font-medium" style={{ color: meta.color }}>
                {meta.label}
              </span>
              {attachment.sizeLabel && <span>· {attachment.sizeLabel}</span>}
              {attachment.type !== 'image' && lineCount > 0 && (
                <span>
                  · {lineCount.toLocaleString()} line{lineCount !== 1 ? 's' : ''}
                </span>
              )}
              {attachment.path && <span className="font-mono text-muted/70 truncate">· {attachment.path}</span>}
            </div>
          </div>

          {/* Download */}
          {attachment.type === 'image' && attachment.dataUrl && (
            <button
              onClick={() => downloadImage(attachment.dataUrl, attachment.name)}
              title="Download image"
              className="text-muted hover:text-text transition-colors p-1.5 rounded hover:bg-text/5"
            >
              <Download className="w-4 h-4" />
            </button>
          )}
          {attachment.type !== 'image' && attachment.content && (
            <button
              onClick={() => downloadText(attachment.content, attachment.name)}
              title="Download as file"
              className="text-muted hover:text-text transition-colors p-1.5 rounded hover:bg-text/5"
            >
              <Download className="w-4 h-4" />
            </button>
          )}

          {/* Close */}
          <button
            onClick={onClose}
            className="text-muted hover:text-text transition-colors p-1.5 rounded hover:bg-text/5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Body ─────────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-auto custom-scrollbar">
          {/* IMAGE ─────────────────────────────────────────────────────────── */}
          {attachment.type === 'image' && attachment.dataUrl && (
            <div className="flex items-center justify-center p-6 min-h-[200px]">
              <img
                src={attachment.dataUrl}
                alt={attachment.name}
                className="rounded-lg shadow-2xl max-w-full"
                style={{ maxHeight: '75vh', objectFit: 'contain' }}
              />
            </div>
          )}

          {/* CODE FILE ─────────────────────────────────────────────────────── */}
          {attachment.type === 'file' && attachment.content && (
            <SyntaxHighlighter
              language={lang}
              style={vscDarkPlus}
              showLineNumbers
              wrapLongLines={false}
              customStyle={{
                margin: 0,
                background: 'transparent',
                fontSize: '12px',
                padding: '16px 0',
                minHeight: '100%',
              }}
              lineNumberStyle={{
                color: 'rgba(255,255,255,0.2)',
                minWidth: '3em',
                paddingRight: '1em',
                userSelect: 'none',
              }}
              codeTagProps={{ style: { fontFamily: '"JetBrains Mono","Fira Code",monospace' } }}
            >
              {attachment.content}
            </SyntaxHighlighter>
          )}

          {/* TEXT SNIPPET ──────────────────────────────────────────────────── */}
          {attachment.type === 'snippet' && attachment.content && (
            <div className="p-5">
              <pre
                className="text-[12px] text-text/80 font-mono whitespace-pre-wrap break-words leading-relaxed"
                style={{ fontFamily: '"JetBrains Mono","Fira Code",monospace' }}
              >
                {attachment.content}
              </pre>
            </div>
          )}

          {/* Fallback */}
          {!attachment.content && !attachment.dataUrl && (
            <div className="p-8 text-center text-muted text-sm">No preview available for this attachment.</div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
