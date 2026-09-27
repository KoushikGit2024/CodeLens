/**
 * ChatInputArea.jsx
 *
 * Modern AI chat input — like Claude / ChatGPT — for CodeLens.
 *
 * Features:
 *  • Auto-resizing textarea (grows with content, caps at 200px)
 *  • @ mention system → opens FileMentionMenu to attach repository files from IndexedDB
 *  • File & image attachments via paperclip button and drag-and-drop
 *  • Smart paste: pastes > PASTE_THRESHOLD chars auto-collapse into snippet chips
 *  • Payload size indicator (SVG ring) with hard 16 000-char limit
 *  • Image preview in chips; sent as base64 data-URIs in the attachment array
 *  • Keyboard: Enter to send, Shift+Enter for newline, Escape to close mention menu
 */
import React, {
  useState, useRef, useEffect, useCallback, useMemo, forwardRef, useImperativeHandle
} from 'react';
import { Paperclip, Send, X } from 'lucide-react';
import SizeIndicator from './SizeIndicator';
import AttachmentChip from './AttachmentChip';
import FileMentionMenu from './FileMentionMenu';
import { loadFile } from '../../services/analyzer/repository/persistence.store';

// ── Constants ──────────────────────────────────────────────────────────────────
const MAX_PAYLOAD_CHARS = 16_000;   // hard limit for the combined prompt
const PASTE_THRESHOLD   = 500;      // chars — pastes longer than this become a snippet
const ACCEPTED_FILES    = '.js,.jsx,.ts,.tsx,.py,.java,.go,.rs,.rb,.md,.txt,.json,.yaml,.yml,.sh,.css,.html,.c,.cpp,.h';
const ACCEPTED_IMAGES   = '.png,.jpg,.jpeg,.gif,.webp,.svg';

// ── Helpers ────────────────────────────────────────────────────────────────────
function bytesToLabel(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function uuid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = e => resolve(e.target.result);
    r.onerror = reject;
    r.readAsText(file);
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = e => resolve(e.target.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// ── Component ──────────────────────────────────────────────────────────────────
const ChatInputArea = forwardRef(function ChatInputArea({
  repoId,
  filePaths = [],           // flat list of repository relative paths (for @ menu)
  disabled = false,
  onSend,                   // (text, attachments[]) => void
}, ref) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [dupeId, setDupeId] = useState(null); // id of chip to flash on duplicate

  // @ mention state
  const [mentionQuery, setMentionQuery] = useState(null);  // null = closed, string = open
  const [mentionStart, setMentionStart] = useState(-1);    // cursor index of the @

  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const containerRef = useRef(null);

  useImperativeHandle(ref, () => ({
    attachFiles: handleFileAttach
  }), []);

  // ── Payload size calculation ────────────────────────────────────────────────
  const payloadSize = useMemo(() => {
    let size = text.length;
    for (const a of attachments) {
      if (a.type === 'image' && a.dataUrl) size += a.dataUrl.length;
      else if (a.content) size += a.content.length;
    }
    return size;
  }, [text, attachments]);

  const isOverLimit = payloadSize > MAX_PAYLOAD_CHARS;
  const canSend = !disabled && !isOverLimit && (text.trim().length > 0 || attachments.length > 0);

  // ── Auto-resize textarea ───────────────────────────────────────────────────
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
  }, [text]);

  // ── @ Mention detection ────────────────────────────────────────────────────
  const handleTextChange = useCallback((e) => {
    const val = e.target.value;
    const cursor = e.target.selectionStart;
    setText(val);

    // Find the last @ before the cursor (that doesn't have a space after it)
    const segment = val.slice(0, cursor);
    const atIdx = segment.lastIndexOf('@');
    if (atIdx !== -1) {
      const afterAt = segment.slice(atIdx + 1);
      
      // Newlines break mentions unconditionally
      if (!afterAt.includes('\n')) {
        // If there's a space, verify it's actually matching a file/folder with spaces
        let isValid = true;
        if (afterAt.includes(' ')) {
          const lower = afterAt.toLowerCase();
          isValid = filePaths.some(p => p.toLowerCase().startsWith(lower));
        }

        if (isValid) {
          setMentionQuery(afterAt);
          setMentionStart(atIdx);
          return;
        }
      }
    }
    setMentionQuery(null);
    setMentionStart(-1);
  }, []);

  const handleMentionSelect = useCallback(async (selectedPath, isDir) => {
    const ta = textareaRef.current;
    const cursor = ta?.selectionStart ?? text.length;
    const before = text.slice(0, mentionStart);
    const after  = text.slice(cursor);

    if (isDir) {
      const inserted = '@' + selectedPath;
      setText(before + inserted + after);
      setMentionQuery(selectedPath);
      
      const newCursor = before.length + inserted.length;
      setTimeout(() => {
        if (ta) {
          ta.focus();
          ta.setSelectionRange(newCursor, newCursor);
        }
      }, 0);
      return;
    }

    setMentionQuery(null);
    setMentionStart(-1);

    // Replace @query in the text with empty string (we attached it as a chip)
    setText(before + after);
    const newCursor = before.length;

    // Load file content from IndexedDB
    try {
      const content = await loadFile(repoId, selectedPath);
      if (content !== null) {
        addAttachment({
          id: uuid(),
          type: 'file',
          name: selectedPath.split('/').pop(),
          path: selectedPath,
          content,
          sizeLabel: bytesToLabel(content.length),
        });
      } else {
        // File not cached — attach as path reference only
        addAttachment({
          id: uuid(),
          type: 'file',
          name: selectedPath.split('/').pop(),
          path: selectedPath,
          content: `[File reference: ${selectedPath}]`,
          sizeLabel: '–',
        });
      }
    } catch {
      addAttachment({
        id: uuid(),
        type: 'file',
        name: selectedPath.split('/').pop(),
        path: selectedPath,
        content: `[File reference: ${selectedPath}]`,
        sizeLabel: '–',
      });
    }

    // Return focus to textarea and set cursor position
    setTimeout(() => {
      if (ta) {
        ta.focus();
        ta.setSelectionRange(newCursor, newCursor);
      }
    }, 0);
  }, [text, mentionStart, repoId]);

  // ── Paste handler ──────────────────────────────────────────────────────────
  const handlePaste = useCallback((e) => {
    // Handle image pastes
    const items = Array.from(e.clipboardData?.items || []);
    const imageItem = items.find(i => i.type.startsWith('image/'));
    if (imageItem) {
      e.preventDefault();
      const file = imageItem.getAsFile();
      if (file) handleImageFile(file);
      return;
    }

    // Handle large text pastes → snippet chip
    const pastedText = e.clipboardData?.getData('text') || '';
    if (pastedText.length > PASTE_THRESHOLD) {
      e.preventDefault();
      addAttachment({
        id: uuid(),
        type: 'snippet',
        name: `Pasted text (${pastedText.length.toLocaleString()} chars)`,
        content: pastedText,
        sizeLabel: bytesToLabel(new Blob([pastedText]).size),
      });
    }
    // Short pastes pass through normally
  }, []);

  // ── File attach ────────────────────────────────────────────────────────────
  async function handleImageFile(file) {
    const dataUrl = await readFileAsDataUrl(file);
    addAttachment({
      id: uuid(),
      type: 'image',
      name: file.name || 'image.png',
      dataUrl,
      content: dataUrl,      // sent in prompt
      sizeLabel: bytesToLabel(file.size),
    });
  }

  async function handleFileAttach(files) {
    for (const file of Array.from(files)) {
      const ext = '.' + file.name.split('.').pop().toLowerCase();
      if (ACCEPTED_IMAGES.includes(ext)) {
        await handleImageFile(file);
      } else {
        const content = await readFileAsText(file);
        addAttachment({
          id: uuid(),
          type: 'file',
          name: file.name,
          content,
          sizeLabel: bytesToLabel(file.size),
        });
      }
    }
  }

  // ── Attachment helpers (with dedup) ───────────────────────────────────────
  function isDuplicate(a) {
    return attachments.some(existing => {
      if (a.type === 'file' && existing.type === 'file') {
        // Dedup by repo path if available, otherwise by name
        return a.path ? existing.path === a.path : existing.name === a.name;
      }
      if (a.type === 'image') return existing.name === a.name && existing.type === 'image';
      // Snippets are never deduped — each paste is unique
      return false;
    });
  }

  function flashDupe(id) {
    setDupeId(id);
    setTimeout(() => setDupeId(null), 700);
  }

  function addAttachment(a) {
    if (isDuplicate(a)) {
      // Find the existing chip and flash it
      const existing = attachments.find(e =>
        a.path ? e.path === a.path : e.name === a.name
      );
      if (existing) flashDupe(existing.id);
      return;
    }
    setAttachments(prev => [...prev, a]);
  }
  function removeAttachment(id) {
    setAttachments(prev => prev.filter(a => a.id !== id));
  }

  // ── Drag & drop ────────────────────────────────────────────────────────────
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);
  const handleDragLeave = useCallback((e) => {
    if (!containerRef.current?.contains(e.relatedTarget)) setIsDragging(false);
  }, []);
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer?.files?.length) handleFileAttach(e.dataTransfer.files);
  }, []);

  // ── Send ───────────────────────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    if (!canSend) return;
    onSend(text.trim(), attachments);
    setText('');
    setAttachments([]);
    setMentionQuery(null);
    setMentionStart(-1);
    textareaRef.current?.focus();
  }, [canSend, onSend, text, attachments]);

  const mentionMenuRef = useRef(null);

  const handleKeyDown = useCallback((e) => {
    if (mentionQuery !== null && mentionMenuRef.current) {
      if (['Tab', 'Enter', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
        const handled = mentionMenuRef.current.handleKeyDown(e);
        if (handled) return;
      }
    }
    
    if (e.key === 'Escape') {
      setMentionQuery(null);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend, mentionQuery]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative rounded-xl border transition-colors duration-200
        ${isDragging
          ? 'border-accent bg-accent/5 shadow-[0_0_20px_rgba(77,126,255,0.2)]'
          : isOverLimit
          ? 'border-danger/60 bg-danger/5'
          : 'border-border/60 bg-panel/80 hover:border-accent/40 focus-within:border-accent focus-within:shadow-[0_0_14px_rgba(77,126,255,0.15)]'}
      `}
      style={{ backdropFilter: 'blur(10px)' }}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 rounded-xl flex items-center justify-center bg-accent/10 border-2 border-dashed border-accent z-20 pointer-events-none">
          <span className="text-accent font-medium text-sm">Drop files here</span>
        </div>
      )}

      {/* Attachment chips row */}
      {attachments.length > 0 && (
        <div className="flex gap-2 px-3 pt-3 flex-wrap overflow-x-auto">
          {attachments.map(a => (
            <AttachmentChip
              key={a.id}
              attachment={a}
              isFlashing={dupeId === a.id}
              onRemove={() => removeAttachment(a.id)}
            />
          ))}
        </div>
      )}

      {/* Textarea + mention menu (relative wrapper) */}
      <div className="relative">
        {mentionQuery !== null && (
          <FileMentionMenu
            ref={mentionMenuRef}
            query={mentionQuery}
            filePaths={filePaths}
            onSelect={handleMentionSelect}
            onClose={() => setMentionQuery(null)}
            anchorRef={textareaRef}
          />
        )}

        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleTextChange}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={1}
          placeholder={disabled ? 'AI unavailable…' : 'Ask a question… type @ to attach a file'}
          className="w-full bg-transparent resize-none pl-4 pr-3 pt-3 pb-1 text-sm text-text placeholder-muted focus:outline-none disabled:opacity-50"
          style={{ maxHeight: 200, minHeight: 44, overflowY: 'auto' }}
        />
      </div>

      {/* Bottom toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-t border-text/5">
        {/* Attach button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          title="Attach file or image"
          className="text-muted hover:text-accent transition-colors disabled:opacity-40"
        >
          <Paperclip className="w-4 h-4" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={`${ACCEPTED_FILES},${ACCEPTED_IMAGES}`}
          className="hidden"
          onChange={(e) => handleFileAttach(e.target.files)}
        />

        {/* Spacer */}
        <div className="flex-1" />

        {/* Size indicator */}
        <SizeIndicator current={payloadSize} max={MAX_PAYLOAD_CHARS} />

        {/* Char counter */}
        <span className={`text-[10px] font-mono ${isOverLimit ? 'text-danger' : 'text-muted'}`}>
          {payloadSize.toLocaleString()} / {MAX_PAYLOAD_CHARS.toLocaleString()}
        </span>

        {/* Send button */}
        <button
          type="button"
          onClick={handleSend}
          disabled={!canSend}
          title={isOverLimit ? 'Payload too large — remove some attachments' : 'Send (Enter)'}
          className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all
            ${canSend
              ? 'bg-accent hover:bg-accent/80 text-text shadow-[0_0_10px_rgba(77,126,255,0.3)]'
              : isOverLimit
              ? 'bg-danger/30 text-danger cursor-not-allowed'
              : 'bg-surface text-muted/40 cursor-not-allowed'}
          `}
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Over-limit warning */}
      {isOverLimit && (
        <div className="px-3 pb-2 text-[10px] text-danger flex items-center gap-1">
          ⚠ Payload exceeds {MAX_PAYLOAD_CHARS.toLocaleString()} char limit — remove some attachments to send.
        </div>
      )}
    </div>
  );
});

export default ChatInputArea;
