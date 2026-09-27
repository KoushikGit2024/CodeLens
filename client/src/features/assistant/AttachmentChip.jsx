/**
 * AttachmentChip.jsx
 *
 * It receives an attachment object, then extracts its type and label,
 * and then it applies a small pill chip with image preview, a preview
 * button (Eye icon) that opens the full AttachmentPreview modal, and
 * a remove button.
 *
 * Attachment types: 'file' | 'image' | 'snippet'
 */
import React, { useState } from 'react';
import { FileCode, Image as ImageIcon, AlignLeft, X, Eye } from 'lucide-react';
import AttachmentPreview from './AttachmentPreview';

const TYPE_CONFIG = {
  file:    { icon: FileCode,  color: '#61dafb', bg: 'rgba(97,218,251,0.10)' },
  image:   { icon: ImageIcon, color: '#a855f7', bg: 'rgba(168,85,247,0.10)' },
  snippet: { icon: AlignLeft, color: '#e3b341', bg: 'rgba(227,179,65,0.10)' },
};

export default function AttachmentChip({ attachment, onRemove, isFlashing = false }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const cfg = TYPE_CONFIG[attachment.type] || TYPE_CONFIG.file;
  const Icon = cfg.icon;

  const isImage = attachment.type === 'image';

  // Determine if a preview is possible
  const canPreview = !!(
    (isImage && attachment.dataUrl) ||
    (!isImage && attachment.content)
  );

  return (
    <>
      {/* Inline shake keyframe — injected once per flashing chip */}
      {isFlashing && (
        <style>{`
          @keyframes cl-shake {
            0%,100%{ transform:translateX(0); }
            20%     { transform:translateX(-5px); }
            40%     { transform:translateX(5px); }
            60%     { transform:translateX(-4px); }
            80%     { transform:translateX(4px); }
          }
        `}</style>
      )}

      {/* Full preview modal — rendered via portal */}
      {previewOpen && (
        <AttachmentPreview
          attachment={attachment}
          onClose={() => setPreviewOpen(false)}
        />
      )}

      <div
        className="relative group flex flex-col rounded-lg border overflow-hidden shrink-0"
        style={{
          borderColor: isFlashing ? '#ff7b72' : cfg.color + '44',
          background: isFlashing ? 'rgba(255,123,114,0.12)' : cfg.bg,
          animation: isFlashing ? 'cl-shake 0.6s ease' : undefined,
          maxWidth: isImage && attachment.dataUrl ? 120 : 220,
        }}
      >
        {/* Image thumbnail */}
        {isImage && attachment.dataUrl && (
          <div
            className="relative cursor-pointer overflow-hidden"
            style={{ height: 72 }}
            onClick={() => setPreviewOpen(true)}
            title="Click to preview"
          >
            <img
              src={attachment.dataUrl}
              alt={attachment.name}
              className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
            />
            {/* Hover overlay */}
            <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-colors duration-200">
              <Eye className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
        )}

        {/* Header row */}
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 min-w-0">
          {!isImage && (
            <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: cfg.color }} />
          )}

          <span
            className="text-[11px] font-medium truncate flex-1"
            style={{ color: cfg.color, maxWidth: isImage ? 80 : 130 }}
            title={attachment.path || attachment.name}
          >
            {attachment.name}
          </span>

          {/* Preview button */}
          {canPreview && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setPreviewOpen(true); }}
              className="text-white/30 hover:text-white/80 transition-colors shrink-0"
              title="Preview attachment"
            >
              <Eye className="w-3 h-3" />
            </button>
          )}

          {/* Remove button */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="text-white/30 hover:text-danger transition-colors shrink-0"
            title="Remove attachment"
          >
            <X className="w-3 h-3" />
          </button>
        </div>

        {/* Size badge */}
        {attachment.sizeLabel && (
          <div className="px-2.5 pb-1.5 -mt-0.5">
            <span className="text-[9px] text-white/25">{attachment.sizeLabel}</span>
          </div>
        )}
      </div>
    </>
  );
}
