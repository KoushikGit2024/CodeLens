import React, { useState } from 'react';
import { Search, ChevronUp, ChevronDown, X } from 'lucide-react';

export default function GraphSearchUI({ onSearch, onNext, onPrev, onClear, matchCount, currentMatchIndex }) {
  const [inputValue, setInputValue] = useState('');

  const handleKeyDown = e => {
    if (e.key === 'Enter') {
      onSearch(inputValue.trim());
    }
  };

  const handleClear = () => {
    setInputValue('');
    onClear();
  };

  return (
    <div className="flex items-center bg-panel border border-border rounded-lg shadow-lg h-9 w-64 md:w-80 overflow-hidden">
      <div className="pl-3 pr-2 text-muted">
        <Search className="w-4 h-4" />
      </div>
      <input
        type="text"
        placeholder="Search nodes (Enter)"
        value={inputValue}
        onChange={e => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        className="flex-1 bg-transparent border-none outline-none text-sm text-text placeholder-muted/60 min-w-0"
      />
      {matchCount !== null && (
        <span className="text-[10px] text-muted whitespace-nowrap px-2 font-mono">
          {matchCount > 0 ? `${currentMatchIndex} / ${matchCount}` : '0 / 0'}
        </span>
      )}
      <div className="flex items-center border-l border-border h-full">
        <button
          onClick={onPrev}
          disabled={!matchCount}
          className="px-2 h-full text-muted hover:text-text hover:bg-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
        <button
          onClick={onNext}
          disabled={!matchCount}
          className="px-2 h-full text-muted hover:text-text hover:bg-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors border-l border-border"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
        <button
          onClick={handleClear}
          className="px-2 h-full text-muted hover:text-danger hover:bg-danger/10 transition-colors border-l border-border"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
