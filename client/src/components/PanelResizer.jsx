import React from 'react';
import { Separator as PanelResizeHandle } from 'react-resizable-panels';
import { GripVertical } from 'lucide-react';

export function PanelResizer({ className = '', id }) {
  return (
    <PanelResizeHandle
      id={id}
      className={`w-1.5 flex flex-col justify-center items-center group bg-border hover:bg-accent/50 active:bg-accent transition-colors shrink-0 cursor-col-resize z-10 ${className}`}
    >
      <div className="h-6 w-1 rounded-full bg-white/20 group-hover:bg-white/60 transition-colors flex items-center justify-center">
        <GripVertical className="w-2.5 h-2.5 text-transparent group-hover:text-white/80 transition-colors" />
      </div>
    </PanelResizeHandle>
  );
}
