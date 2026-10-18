import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle, X, BookOpen, Lightbulb } from 'lucide-react';

/**
 * MetricInfoButton
 *
 * A reusable, sleek, and accessible info button that provides users with
 * clear, contextual explanations of complex architectural, behavioral, and
 * statistical metrics (e.g., Instability Index, SDP, Tukey IQR, Churn Hotspots).
 */
export default function MetricInfoButton({
  title,
  badge,
  formula,
  description,
  bullets = [],
  resolution,
  className = '',
  iconClassName = 'w-3.5 h-3.5',
  buttonLabel = '',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 360, placement: 'top' });
  const popoverRef = useRef(null);
  const buttonRef = useRef(null);

  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const popoverWidth = Math.min(360, window.innerWidth - 32);
    const popoverHeight = 280; // approximate clearance required

    // Determine vertical placement: prefer above, flip below if tight at top of viewport
    const roomAbove = rect.top >= popoverHeight + 16;
    let top;
    let placement;

    if (roomAbove) {
      top = rect.top - 8;
      placement = 'top';
    } else {
      top = rect.bottom + 8;
      placement = 'bottom';
    }

    // Determine horizontal placement:
    // If button is in the right half of the screen, align right edge of popover with right edge of button
    const isRightHalf = rect.left > window.innerWidth / 2;
    let left;
    if (isRightHalf) {
      left = rect.right - popoverWidth;
    } else {
      left = rect.left;
    }

    // Strict clamping: never exceed 16px from left or right viewport edges
    left = Math.max(16, Math.min(window.innerWidth - popoverWidth - 16, left));

    setPosition({ top, left, width: popoverWidth, placement });
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    updatePosition();

    const handleKeyDown = e => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    const handleClickOutside = e => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target)
      ) {
        setIsOpen(false);
      }
    };

    const handleScrollOrResize = () => {
      updatePosition();
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [isOpen, updatePosition]);

  return (
    <div className={`relative inline-flex items-center ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={e => {
          e.stopPropagation();
          setIsOpen(v => !v);
        }}
        className="inline-flex items-center gap-1 text-muted hover:text-accent p-1 rounded hover:bg-surface/80 transition-colors focus:outline-none focus:ring-1 focus:ring-accent"
        title={`Learn about: ${title}`}
        aria-label={`Info: ${title}`}
      >
        <HelpCircle className={iconClassName} />
        {buttonLabel && <span className="text-[10px] font-medium">{buttonLabel}</span>}
      </button>

      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popoverRef}
            onClick={e => e.stopPropagation()}
            style={{
              position: 'fixed',
              left: `${position.left}px`,
              width: `${position.width}px`,
              ...(position.placement === 'top'
                ? { bottom: `${window.innerHeight - position.top}px` }
                : { top: `${position.top}px` }),
              zIndex: 99999,
              maxWidth: 'calc(100vw - 32px)',
            }}
            className="p-4 rounded-xl bg-panel/95 backdrop-blur-md border border-accent/40 shadow-2xl shadow-black/80 text-text text-left animate-in fade-in zoom-in-95 duration-150"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-2 mb-2 pb-2 border-b border-border/40">
              <div>
                {badge && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider bg-accent/15 text-accent border border-accent/30 inline-block mb-1">
                    {badge}
                  </span>
                )}
                <h4 className="text-xs font-bold text-text flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-accent shrink-0" />
                  <span>{title}</span>
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 rounded text-muted hover:text-text hover:bg-surface transition-colors"
                aria-label="Close"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Formula */}
            {formula && (
              <div className="mb-2.5 p-2 rounded bg-surface/80 border border-border/50 font-mono text-[11px] text-accent flex items-center justify-between">
                <span className="text-[9px] uppercase text-muted tracking-widest font-sans font-semibold">
                  Formula:
                </span>
                <span className="font-bold">{formula}</span>
              </div>
            )}

            {/* Description */}
            {description && <p className="text-[11px] text-muted leading-relaxed mb-2.5">{description}</p>}

            {/* Bullet Breakdown */}
            {bullets.length > 0 && (
              <div className="space-y-1.5 mb-2.5">
                {bullets.map((b, i) => (
                  <div key={i} className="text-[10px] text-text/80 flex items-start gap-1.5">
                    <span className="text-accent mt-0.5 shrink-0">•</span>
                    <span>{b}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Recommended Action */}
            {resolution && (
              <div className="mt-2.5 p-2 rounded bg-accent/10 border border-accent/20 flex items-start gap-1.5 text-[10px] text-text/90">
                <Lightbulb className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-accent block mb-0.5">Recommended Action:</span>
                  <span className="text-muted leading-snug">{resolution}</span>
                </div>
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
