import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function ResizableLayout({ panels, className = "h-full w-full" }) {
  const containerRef = useRef(null);
  const [sizes, setSizes] = useState(() => {
    return panels.map(p => p.defaultSize || (100 / panels.length));
  });
  
  // Track which panels are collapsed
  const [collapsed, setCollapsed] = useState(() => {
    return panels.map(p => !!p.defaultCollapsed);
  });

  const draggingState = useRef(null);

  const toggleCollapse = (index) => {
    setCollapsed(prev => {
      const next = [...prev];
      next[index] = !next[index];
      return next;
    });
  };

  const handlePointerDown = (e, resizerIndex) => {
    e.preventDefault();
    if (!containerRef.current) return;
    
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    
    const rect = containerRef.current.getBoundingClientRect();
    draggingState.current = {
      resizerIndex,
      startX: e.clientX,
      startSizes: [...sizes],
      containerWidth: rect.width
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const handlePointerMove = useCallback((e) => {
    if (!draggingState.current) return;

    const { resizerIndex, startX, startSizes, containerWidth } = draggingState.current;
    
    const deltaX = e.clientX - startX;
    const deltaPercentage = (deltaX / containerWidth) * 100;

    const leftIndex = resizerIndex;
    const rightIndex = resizerIndex + 1;

    // If either adjacent panel is collapsed, we cannot drag this resizer easily
    // without expanding it first, or we just ignore the drag.
    if (collapsed[leftIndex] || collapsed[rightIndex]) return;

    let newSizes = [...startSizes];

    let newLeftSize = startSizes[leftIndex] + deltaPercentage;
    let newRightSize = startSizes[rightIndex] - deltaPercentage;

    const leftMinWidthPct = (panels[leftIndex].minWidth / containerWidth) * 100;
    const rightMinWidthPct = (panels[rightIndex].minWidth / containerWidth) * 100;

    const maxLeftSize = startSizes[leftIndex] + startSizes[rightIndex] - rightMinWidthPct;
    const minLeftSize = leftMinWidthPct;

    newLeftSize = Math.max(minLeftSize, Math.min(newLeftSize, maxLeftSize));
    newRightSize = startSizes[leftIndex] + startSizes[rightIndex] - newLeftSize;

    newLeftSize = Math.max(0, newLeftSize);
    newRightSize = Math.max(0, newRightSize);

    newSizes[leftIndex] = newLeftSize;
    newSizes[rightIndex] = newRightSize;

    setSizes(newSizes);
  }, [panels, collapsed]);

  const handlePointerUp = useCallback(() => {
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
    draggingState.current = null;
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
  }, [handlePointerMove]);

  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [handlePointerMove, handlePointerUp]);

  return (
    <div ref={containerRef} className={`flex flex-row overflow-hidden ${className}`}>
      {panels.map((panel, index) => {
        const isCollapsed = collapsed[index];
        const isCollapsible = panel.collapsible;
        const dir = panel.collapseDirection || 'left'; // 'left' or 'right'

        // Determine Flex style
        // If collapsed, use fixed 48px width.
        // If expanded, use the flex percentage.
        const flexStyle = isCollapsed 
          ? { flex: '0 0 48px', width: '48px', minWidth: '48px' } 
          : { flex: `${sizes[index]} 1 0%`, width: 0, minWidth: `${panel.minWidth}px` };

        return (
          <React.Fragment key={panel.id || index}>
            <div 
              style={flexStyle}
              className="flex flex-col relative overflow-hidden transition-all duration-200 ease-in-out bg-surface"
            >
              {isCollapsed ? (
                // --- COLLAPSED STATE ---
                <div 
                  className="flex flex-col items-center py-4 w-full h-full cursor-pointer hover:bg-white/5 transition-colors"
                  onClick={() => toggleCollapse(index)}
                  title={`Expand ${panel.title || 'Panel'}`}
                >
                  {panel.icon && (
                    <div className="mb-4 text-muted hover:text-accent transition-colors">
                      {React.cloneElement(panel.icon, { className: 'w-5 h-5' })}
                    </div>
                  )}
                  {panel.title && (
                    <span 
                      className="text-xs font-semibold text-muted tracking-wider uppercase whitespace-nowrap"
                      style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                    >
                      {panel.title}
                    </span>
                  )}
                </div>
              ) : (
                // --- EXPANDED STATE ---
                <div className="flex flex-col flex-1 h-full relative bg-surface">
                  {panel.content}
                </div>
              )}
            </div>

            {/* The Resizer (between panels) */}
            {index < panels.length - 1 && (
              <div
                onPointerDown={(e) => handlePointerDown(e, index)}
                className={`relative w-2 flex flex-col items-center justify-center z-40 shrink-0
                  ${(collapsed[index] || collapsed[index + 1]) ? 'cursor-default' : 'cursor-col-resize group'}
                `}
              >
                {/* Resizer visible line */}
                <div className={`absolute inset-y-0 left-[3px] w-[1px] transition-all
                  ${(collapsed[index] || collapsed[index + 1]) 
                    ? 'bg-border' 
                    : 'bg-border group-hover:bg-accent group-active:bg-accent'}
                `} />

                {/* Collapse Buttons on Resizer */}
                {!(collapsed[index] || collapsed[index + 1]) && (
                  <div className="absolute top-6 flex flex-col gap-2 z-50">
                    {panels[index].collapsible && panels[index].collapseDirection === 'left' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleCollapse(index); }}
                        className="w-4 h-8 flex items-center justify-center bg-surface border border-border rounded-l shadow-sm text-muted hover:text-accent hover:border-accent transition-colors -translate-x-[15px] cursor-pointer"
                        title={`Collapse ${panels[index].title || 'Panel'}`}
                      >
                        <ChevronLeft className="w-3 h-3" />
                      </button>
                    )}
                    {panels[index + 1].collapsible && panels[index + 1].collapseDirection === 'right' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleCollapse(index + 1); }}
                        className="w-4 h-8 flex items-center justify-center bg-surface border border-border rounded-r shadow-sm text-muted hover:text-accent hover:border-accent transition-colors translate-x-[1px] cursor-pointer"
                        title={`Collapse ${panels[index + 1].title || 'Panel'}`}
                      >
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
