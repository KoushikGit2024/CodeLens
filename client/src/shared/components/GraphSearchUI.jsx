import React, { useState } from 'react';
import { Search, ChevronUp, ChevronDown, X } from 'lucide-react';

export default function GraphSearchUI({ onSearch, onNext, onPrev, onClear, matchCount, currentMatchIndex }) {
  const [inputValue, setInputValue] = useState('');

  const handleKeyDown = e => {
    if (e.key === 'Enter') {
      if (matchCount && matchCount > 0) {
        if (e.shiftKey) {
          onPrev();
        } else {
          onNext();
        }
      } else {
        onSearch(inputValue.trim());
      }
    }
  };

  const handleClear = () => {
    setInputValue('');
    onClear();
  };

  const isZeroMatches = matchCount === 0;

  return (
    <div
      className={`flex items-center bg-panel border rounded-lg shadow-lg h-9 w-64 md:w-80 overflow-hidden transition-colors ${
        isZeroMatches ? 'border-danger/60 ring-1 ring-danger/30' : 'border-border'
      }`}
    >
      <div className={`pl-3 pr-2 ${isZeroMatches ? 'text-danger' : 'text-muted'}`}>
        <Search className="w-4 h-4" />
      </div>
      <input
        data-graph-search="true"
        type="text"
        placeholder="Search nodes (Press / to focus)"
        value={inputValue}
        onChange={e => {
          setInputValue(e.target.value);
          if (!e.target.value) {
            onClear();
          }
        }}
        onKeyDown={handleKeyDown}
        className="flex-1 bg-transparent border-none outline-none text-sm text-text placeholder-muted/60 min-w-0"
      />
      {matchCount !== null && (
        <span
          className={`text-[10px] whitespace-nowrap px-2 font-mono ${isZeroMatches ? 'text-danger' : 'text-muted'}`}
        >
          {matchCount > 0 ? `${currentMatchIndex} / ${matchCount}` : '0 matches'}
        </span>
      )}
      <div className="flex items-center border-l border-border h-full">
        <button
          onClick={onPrev}
          disabled={!matchCount}
          title="Previous match (Shift+Enter)"
          className="px-2 h-full text-muted hover:text-text hover:bg-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
        <button
          onClick={onNext}
          disabled={!matchCount}
          title="Next match (Enter)"
          className="px-2 h-full text-muted hover:text-text hover:bg-surface disabled:opacity-30 disabled:cursor-not-allowed transition-colors border-l border-border"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
        <button
          onClick={handleClear}
          title="Clear search"
          className="px-2 h-full text-muted hover:text-danger hover:bg-danger/10 transition-colors border-l border-border"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
