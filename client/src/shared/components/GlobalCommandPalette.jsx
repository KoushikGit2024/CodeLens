import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Search, File as FileIcon, X } from 'lucide-react';
import { useRepository } from '../context/RepositoryContext';

export default function GlobalCommandPalette() {
  const { repoId } = useParams();
  const navigate = useNavigate();
  const { fileTree } = useRepository();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);

  // Flatten the file tree to get all file paths
  const allFiles = useMemo(() => {
    if (!fileTree) return [];
    const flat = [];
    const traverse = nodes => {
      for (const node of nodes) {
        if (node.type === 'file') flat.push(node.path);
        if (node.children) traverse(node.children);
      }
    };
    traverse(fileTree);
    return flat;
  }, [fileTree]);

  // Filter files based on query
  const filteredFiles = useMemo(() => {
    if (!query) return allFiles.slice(0, 50); // Show max 50 by default
    const term = query.toLowerCase();
    return allFiles.filter(f => f.toLowerCase().includes(term)).slice(0, 100);
  }, [allFiles, query]);

  useEffect(() => {
    const handleKeyDown = e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        setIsOpen(true);
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleSelect = filePath => {
    setIsOpen(false);
    navigate(`/explore/${repoId}/source?path=${encodeURIComponent(filePath)}`);
  };

  const handleListKeyDown = e => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, filteredFiles.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredFiles[selectedIndex]) {
        handleSelect(filteredFiles[selectedIndex]);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-center items-start pt-[15vh]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-background/50 backdrop-blur-sm" onClick={() => setIsOpen(false)} />

      {/* Modal */}
      <div
        className="relative bg-surface border border-border shadow-2xl rounded-xl w-full max-w-2xl overflow-hidden flex flex-col"
        onKeyDown={handleListKeyDown}
      >
        <div className="flex items-center px-4 py-3 border-b border-border bg-panel">
          <Search className="w-5 h-5 text-muted mr-3 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent border-none text-text text-base placeholder-muted focus:outline-none"
            placeholder="Search files by name..."
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <button
            className="p-1 rounded hover:bg-text/5 text-muted hover:text-text transition-colors"
            onClick={() => setIsOpen(false)}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {filteredFiles.length > 0 ? (
          <ul className="max-h-[400px] overflow-y-auto custom-scrollbar p-2">
            {filteredFiles.map((file, idx) => (
              <li key={file}>
                <button
                  onClick={() => handleSelect(file)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 transition-colors ${
                    idx === selectedIndex ? 'bg-accent/15 text-accent' : 'text-text hover:bg-text/5'
                  }`}
                  onMouseEnter={() => setSelectedIndex(idx)}
                >
                  <FileIcon className={`w-4 h-4 shrink-0 ${idx === selectedIndex ? 'text-accent' : 'text-muted'}`} />
                  <span className="truncate">{file}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-8 text-center text-muted flex flex-col items-center justify-center gap-2">
            <Search className="w-8 h-8 opacity-20 mb-2" />
            <p>No files found matching "{query}"</p>
          </div>
        )}
      </div>
    </div>
  );
}
