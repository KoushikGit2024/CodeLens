import React, { useState } from 'react';
import { Info } from 'lucide-react';

export default function InfoTooltip({ text, children }) {
  const [show, setShow] = useState(false);

  return (
    <span 
      className="relative inline-flex items-center gap-1 cursor-help group"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      <Info className="w-3.5 h-3.5 text-muted hover:text-accent transition-colors" />
      
      {show && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-surface border border-border rounded shadow-xl z-50 text-[11px] text-white leading-relaxed text-center animate-in fade-in zoom-in-95 duration-150">
          {text}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-[1px] border-4 border-transparent border-t-surface"></div>
        </div>
      )}
    </span>
  );
}
