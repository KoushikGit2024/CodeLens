import React, { useState, useEffect, useRef, useCallback } from 'react';

export function ResizableLayout({ panels, className = "h-full w-full" }) {
  const containerRef = useRef(null);
  const [sizes, setSizes] = useState(() => {
    return panels.map(p => p.defaultSize || (100 / panels.length));
  });

  const draggingState = useRef(null);

  const handlePointerDown = (e, resizerIndex) => {
    e.preventDefault();
    if (!containerRef.current) return;
    
    // Disable selection during drag
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

    let newSizes = [...startSizes];

    // Compute intended sizes
    let newLeftSize = startSizes[leftIndex] + deltaPercentage;
    let newRightSize = startSizes[rightIndex] - deltaPercentage;

    // Constrain by minWidth (in pixels converted to percentage)
    const leftMinWidthPct = (panels[leftIndex].minWidth / containerWidth) * 100;
    const rightMinWidthPct = (panels[rightIndex].minWidth / containerWidth) * 100;

    const maxLeftSize = startSizes[leftIndex] + startSizes[rightIndex] - rightMinWidthPct;
    const minLeftSize = leftMinWidthPct;

    newLeftSize = Math.max(minLeftSize, Math.min(newLeftSize, maxLeftSize));
    newRightSize = startSizes[leftIndex] + startSizes[rightIndex] - newLeftSize;

    // Ensure we don't go below 0
    newLeftSize = Math.max(0, newLeftSize);
    newRightSize = Math.max(0, newRightSize);

    newSizes[leftIndex] = newLeftSize;
    newSizes[rightIndex] = newRightSize;

    setSizes(newSizes);
  }, [panels]);

  const handlePointerUp = useCallback(() => {
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
    draggingState.current = null;
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
  }, [handlePointerMove]);

  // Clean up event listeners on unmount
  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [handlePointerMove, handlePointerUp]);

  return (
    <div ref={containerRef} className={`flex flex-row overflow-hidden ${className}`}>
      {panels.map((panel, index) => {
        const currentSize = sizes[index];
        
        return (
          <React.Fragment key={panel.id || index}>
            {/* The Panel Content */}
            <div 
              style={{ flex: `${currentSize} 1 0%`, width: 0 }}
              className="flex flex-col relative overflow-hidden transition-none"
            >
              {/* Inner wrapper ensures minWidth is respected without breaking flex container */}
              <div 
                className="flex flex-col flex-1 h-full"
                style={{ 
                  minWidth: `${panel.minWidth}px`
                }}
              >
                {panel.content}
              </div>
            </div>

            {/* The Resizer (between panels) */}
            {index < panels.length - 1 && (
              <div
                onPointerDown={(e) => handlePointerDown(e, index)}
                className="relative w-1.5 flex flex-col items-center justify-center cursor-col-resize group z-40 shrink-0"
              >
                <div className="absolute inset-y-0 left-[2px] w-[1px] bg-border group-hover:bg-accent group-hover:w-[2px] group-active:bg-accent transition-all" />
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
