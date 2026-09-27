/**
 * FileMentionMenu.jsx
 *
 * It receives a search query and the flat list of repository file paths,
 * then filters the list, and then it applies a floating dropdown directly
 * above the cursor so the user can quickly attach a file by typing @.
 */
import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { FileCode, Folder } from 'lucide-react';

const MAX_RESULTS = 100;

const FileMentionMenu = forwardRef(function FileMentionMenu({ query, filePaths, onSelect, onClose, anchorRef }, ref) {
  const menuRef = useRef(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Parse the query into directory path and search prefix
  const lastSlash = query.lastIndexOf('/');
  const dirPath = lastSlash >= 0 ? query.slice(0, lastSlash + 1) : '';
  const searchPrefix = lastSlash >= 0 ? query.slice(lastSlash + 1).toLowerCase() : query.toLowerCase();

  const entries = new Map();

  for (const p of filePaths) {
    if (p.startsWith(dirPath)) {
      const remaining = p.slice(dirPath.length);
      if (!remaining) continue;
      
      const parts = remaining.split('/');
      const isDir = parts.length > 1;
      const name = parts[0];
      
      if (name.toLowerCase().startsWith(searchPrefix)) {
        if (!entries.has(name)) {
          entries.set(name, {
            name,
            path: dirPath + name + (isDir ? '/' : ''),
            isDir
          });
        }
      }
    }
  }

  let filtered = Array.from(entries.values()).sort((a, b) => {
    if (a.isDir && !b.isDir) return -1;
    if (!a.isDir && b.isDir) return 1;
    return a.name.localeCompare(b.name);
  }).slice(0, MAX_RESULTS);

  // Fallback: If no direct matches are found in this directory, do a global fuzzy search for files!
  if (filtered.length === 0 && searchPrefix.length > 0) {
    const globalMatches = filePaths
      .filter(p => p.toLowerCase().includes(searchPrefix))
      .slice(0, 20); // Keep global search results smaller
      
    filtered = globalMatches.map(p => {
      const parts = p.split('/');
      return {
        name: parts.pop(), // Filename
        path: p,
        isDir: false,
        dirPathFallback: parts.join('/') // To show the folder it was found in
      };
    });
  }

  // Reset selected index when filtered list changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Expose keyboard handler to parent
  useImperativeHandle(ref, () => ({
    handleKeyDown: (e) => {
      if (filtered.length === 0) return false;
      
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        const item = filtered[selectedIndex];
        if (item) onSelect(item.path, item.isDir);
        return true;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
        return true;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
        return true;
      }
      return false;
    }
  }), [filtered, selectedIndex, onSelect]);

  // Close on outside click
  useEffect(() => {
    const handle = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target) &&
          anchorRef.current && !anchorRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [onClose, anchorRef]);

  if (filtered.length === 0) {
    return (
      <div ref={menuRef} className="absolute bottom-full left-0 mb-2 bg-panel border border-border rounded-lg shadow-2xl p-3 text-xs text-muted z-50 w-72">
        No matching files in <span className="text-accent font-mono">{dirPath || '/'}</span> for <span className="font-mono">"{searchPrefix}"</span>
      </div>
    );
  }

  return (
    <div
      ref={menuRef}
      className="absolute bottom-full left-0 mb-2 bg-panel border border-border rounded-lg shadow-2xl z-50 overflow-hidden w-80"
    >
      <div className="px-3 py-1.5 border-b border-border/60 flex items-center justify-between">
        <span className="text-[10px] text-muted uppercase tracking-widest">
          {dirPath ? `Attach from /${dirPath}` : 'Attach file from repository'}
        </span>
        <span className="text-[10px] text-muted">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
      </div>
      <ul className="max-h-52 overflow-y-auto custom-scrollbar py-1">
        {filtered.map((item, idx) => {
          const isActive = idx === selectedIndex;
          return (
            <li key={item.path}>
              <button
                type="button"
                onMouseEnter={() => setSelectedIndex(idx)}
                onMouseDown={(e) => { e.preventDefault(); onSelect(item.path, item.isDir); }}
                className={`w-full flex items-center gap-2 px-3 py-2 transition-colors text-left group ${isActive ? 'bg-accent/15' : 'hover:bg-accent/10'}`}
              >
                {item.isDir ? (
                  <Folder className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-accent' : 'text-accent/70'}`} />
                ) : (
                  <FileCode className="w-3.5 h-3.5 text-accent shrink-0" />
                )}
                <div className="flex flex-col min-w-0 flex-1">
                  <span className={`text-xs truncate ${item.isDir ? 'text-white font-medium' : 'text-text font-medium'}`}>
                    {item.name}{item.isDir ? '/' : ''}
                  </span>
                  {item.dirPathFallback && (
                    <span className="text-[10px] text-muted font-mono truncate">{item.dirPathFallback}</span>
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
});

export default FileMentionMenu;
