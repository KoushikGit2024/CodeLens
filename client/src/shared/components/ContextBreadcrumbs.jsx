import React from 'react';
import { ChevronRight, X, LayoutTemplate, Network, Box } from 'lucide-react';

export default function ContextBreadcrumbs({ domain, activeNode, onClear }) {
  return (
    <div className="absolute top-4 left-4 z-50 flex items-center gap-2">
      <div className="flex items-center gap-2 bg-[#161b22ee] backdrop-blur-md border border-[#30363d] px-3 py-1.5 rounded-lg shadow-lg">
        
        {/* Domain Icon & Name */}
        <div className="flex items-center gap-1.5 text-muted">
          {domain === 'Architecture' ? (
            <LayoutTemplate className="w-4 h-4" />
          ) : (
            <Network className="w-4 h-4" />
          )}
          <span className="text-xs font-semibold tracking-wide uppercase">{domain}</span>
        </div>

        {/* Active Node Breadcrumb */}
        {activeNode && (
          <>
            <ChevronRight className="w-4 h-4 text-muted/50" />
            <div className="flex items-center gap-1.5 text-white">
              <Box className="w-4 h-4 text-accent" />
              <span className="text-sm font-medium">{activeNode}</span>
            </div>
          </>
        )}
      </div>

      {/* Clear Button */}
      {activeNode && (
        <button
          onClick={onClear}
          className="flex items-center gap-1.5 bg-danger/10 hover:bg-danger/20 text-danger border border-danger/30 px-3 py-1.5 rounded-lg shadow-lg transition-colors group"
          title="Clear Context"
        >
          <X className="w-4 h-4" />
          <span className="text-xs font-semibold uppercase tracking-wide">Clear</span>
        </button>
      )}
    </div>
  );
}
