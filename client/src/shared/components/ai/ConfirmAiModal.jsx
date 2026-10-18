import React, { useEffect } from 'react';
import { Sparkles, AlertTriangle, X } from 'lucide-react';

/**
 * ConfirmAiModal
 *
 * A high-visibility confirmation dialog shown before executing any AI token-consuming
 * action. Protects users from accidental clicks and explains token deductions.
 */
export default function ConfirmAiModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm AI Action',
  subtitle,
  description,
  findingContext,
  tokenEstimate = '~800 tokens',
  confirmText = 'Confirm & Generate',
  confirmIcon: ConfirmIcon = Sparkles,
  loading = false,
}) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = e => {
      if (e.key === 'Escape' && !loading) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, loading]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/70 backdrop-blur-sm transition-opacity"
        onClick={loading ? undefined : onClose}
      />

      {/* Modal Dialog */}
      <div className="relative bg-surface border border-accent/30 shadow-2xl rounded-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-panel">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center text-accent">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-text">{title}</h2>
              {subtitle && <p className="text-xs text-muted truncate max-w-[340px]">{subtitle}</p>}
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-1.5 text-muted hover:text-text rounded-lg hover:bg-surface transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 flex flex-col gap-4">
          {description && (
            <p className="text-sm text-text leading-relaxed">
              {description}
            </p>
          )}

          {findingContext && (
            <div className="p-3.5 rounded-xl bg-panel border border-border flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-text truncate max-w-[320px]">
                  {findingContext.title}
                </span>
                {findingContext.severity && (
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-amber-500/15 text-amber-500 border border-amber-500/30 shrink-0">
                    {findingContext.severity}
                  </span>
                )}
              </div>
              {findingContext.file && (
                <span className="text-[11px] font-mono text-muted truncate">
                  {findingContext.file}
                </span>
              )}
            </div>
          )}

          {/* Token notice banner */}
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1 text-xs text-text/90 leading-relaxed">
              <span className="font-semibold text-amber-500 block mb-0.5">
                AI Token Consumption Warning
              </span>
              This action invokes the AI provider and deducts quota from your plan ({tokenEstimate}).
              If you clicked by mistake, you can cancel now without spending tokens.
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border bg-panel">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm text-muted hover:text-text border border-border hover:border-text/20 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded-lg transition-all shadow-md shadow-accent/20 flex items-center gap-2 disabled:opacity-50"
          >
            <ConfirmIcon className="w-4 h-4" />
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
