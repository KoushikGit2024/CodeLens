import React from 'react';
import { ChevronRight, X, LayoutTemplate, Network, Box } from 'lucide-react';

export default function ContextBreadcrumbs({ domain, activeNode, onClear }) {
  const formatNodeName = (name) => {
    if (typeof name !== 'string') return name;
    return name.split('/').map((part, index, array) => (
      <React.Fragment key={index}>
        {part}
        {index < array.length - 1 && <><wbr />/</>}
      </React.Fragment>
    ));
  };

  return (
    <div className="flex flex-wrap sm:flex-nowrap items-start sm:items-center gap-2 max-w-full min-w-0">
      <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 bg-surface/90 backdrop-blur-md border border-border px-3 py-1.5 rounded-lg shadow-lg max-w-full min-w-0">
        
        {/* Domain Icon & Name */}
        <div className="flex items-center gap-1.5 text-muted shrink-0">
          {domain === 'Architecture' ? (
            <LayoutTemplate className="w-4 h-4" />
          ) : (
            <Network className="w-4 h-4" />
          )}
          <span className="text-xs font-semibold tracking-wide uppercase whitespace-nowrap shrink-0">{domain}</span>
        </div>

        {/* Active Node Breadcrumb */}
        {activeNode && (
          <>
            <ChevronRight className="w-4 h-4 text-muted/50 shrink-0" />
            <div className="flex items-start sm:items-center gap-1.5 text-text min-w-0">
              <Box className="w-4 h-4 text-accent shrink-0 mt-0.5 sm:mt-0" />
              <span className="text-sm font-medium leading-tight break-all sm:break-normal">{formatNodeName(activeNode)}</span>
            </div>
          </>
        )}
      </div>

      {/* Clear Button */}
      {activeNode && (
        <button
          onClick={onClear}
          className="flex shrink-0 items-center gap-1.5 bg-danger/10 hover:bg-danger/20 text-danger border border-danger/30 px-3 py-1.5 rounded-lg shadow-lg transition-colors group"
          title="Clear Context"
        >
          <X className="w-4 h-4" />
          <span className="text-xs font-semibold uppercase tracking-wide">Clear</span>
        </button>
      )}
    </div>
  );
}
