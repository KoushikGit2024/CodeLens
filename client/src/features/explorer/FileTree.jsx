import React, { useState, useEffect } from 'react';
import { ChevronRight, Folder, FolderOpen, FileCode } from 'lucide-react';

// Maps file extensions to a colour class for the file icon
const EXT_COLOR = {
  js: '#f7df1e', jsx: '#61dafb', mjs: '#f7df1e', cjs: '#f7df1e',
  ts: '#3178c6', tsx: '#61dafb', mts: '#3178c6', cts: '#3178c6',
  py: '#3572A5', java: '#b07219', kt: '#A97BFF', kts: '#A97BFF',
  cpp: '#f34b7d', cc: '#f34b7d', cxx: '#f34b7d', h: '#6e4c13', hpp: '#6e4c13',
  json: '#f7c948', md: '#083fa1', css: '#563d7c', html: '#e34c26',
  xml: '#0060ac', yaml: '#cc1018', yml: '#cc1018', sh: '#89e051',
  env: '#6d8086', sql: '#e38c00', txt: '#aaa',
};

function fileIconColor(name) {
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  return EXT_COLOR[ext] || '#9ca3af';
}

function defaultHighlightMatch(text, query) {
  if (!query) return text;
  const parts = text.split(new RegExp(`(${query})`, 'gi'));
  return (
    <>
      {parts.map((part, i) => 
        part.toLowerCase() === query.toLowerCase() 
          ? <span key={i} className="bg-accent/40 text-white font-semibold rounded-sm px-0.5">{part}</span> 
          : part
      )}
    </>
  );
}

// Recursively checks if a node or its children match the search term
function nodeMatchesSearch(node, term) {
  if (!term) return true;
  const lowerTerm = term.toLowerCase();
  if (node.path.toLowerCase().includes(lowerTerm)) return true;
  if (node.type === 'directory' && node.children) {
    return node.children.some(child => nodeMatchesSearch(child, term));
  }
  return false;
}

export function FileTree({ 
  nodes, 
  selectedPath, 
  onSelectFile, 
  depth = 0,
  mode = 'navigate', // 'navigate' | 'select'
  selectedFiles = [],
  onToggleFile = () => {},
  searchTerm = '',
  highlightMatch = defaultHighlightMatch
}) {
  return (
    <ul className="select-none">
      {nodes.map((node) => {
        if (searchTerm && !nodeMatchesSearch(node, searchTerm)) return null;
        
        return (
          <FileTreeNode
            key={node.path}
            node={node}
            depth={depth}
            selectedPath={selectedPath}
            onSelectFile={onSelectFile}
            mode={mode}
            selectedFiles={selectedFiles}
            onToggleFile={onToggleFile}
            searchTerm={searchTerm}
            highlightMatch={highlightMatch}
          />
        );
      })}
    </ul>
  );
}

function FileTreeNode({ 
  node, depth, selectedPath, onSelectFile, 
  mode, selectedFiles, onToggleFile, searchTerm, highlightMatch 
}) {
  // Sets all folders to be open by default
  const [open, setOpen] = useState(true);
  
  const isSelected = mode === 'navigate' ? node.path === selectedPath : false;
  const isChecked = mode === 'select' ? selectedFiles.includes(node.path) : false;
  const isAncestor = selectedPath?.startsWith(node.path + '/');
  const indentPx = depth * 14;

  useEffect(() => {
    if (isAncestor || Boolean(searchTerm)) {
      setOpen(true);
    }
  }, [isAncestor, searchTerm]);

  if (node.type === 'directory') {
    const hasChildren = node.children?.length > 0;
    return (
      <li>
        <button
          onClick={() => setOpen((o) => !o)}
          style={{ paddingLeft: `${indentPx + 4}px` }}
          className="w-full text-left flex items-center gap-1.5 py-[3px] pr-2 rounded text-xs group text-white/60 hover:text-white hover:bg-white/5 transition-colors"
          title={node.name}
        >
          {/* chevron */}
          <span className="shrink-0 w-3 h-3 flex items-center justify-center text-white/30 group-hover:text-white/60">
            <ChevronRight
              className={`w-3 h-3 transition-transform duration-150 ${
                open && hasChildren ? 'rotate-90' : ''
              }`}
            />
          </span>
          {/* folder icon */}
          <span className="shrink-0">
            {open && hasChildren
              ? <FolderOpen className="w-3.5 h-3.5 text-yellow-400/80" />
              : <Folder className="w-3.5 h-3.5 text-yellow-400/60" />
            }
          </span>
          {/* label */}
          <span className="whitespace-nowrap min-w-0 font-medium truncate" title={node.name}>
            {highlightMatch(node.name, searchTerm)}
          </span>
          {/* child count badge */}
          {hasChildren && (
            <span className="ml-auto shrink-0 text-[9px] text-white/20 group-hover:text-white/40 tabular-nums">
              {node.children.filter(c => c.type === 'file').length > 0
                ? node.children.filter(c => c.type === 'file').length
                : ''}
            </span>
          )}
        </button>

        {/* children */}
        {open && hasChildren && (
          <div className="relative overflow-hidden">
            <span
              className="absolute top-0 bottom-0 border-l border-white/[0.06]"
              style={{ left: `${indentPx + 11}px` }}
            />
            <FileTree
              nodes={node.children}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelectFile={onSelectFile}
              mode={mode}
              selectedFiles={selectedFiles}
              onToggleFile={onToggleFile}
              searchTerm={searchTerm}
              highlightMatch={highlightMatch}
            />
          </div>
        )}
      </li>
    );
  }

  // ── File node ──────────────────────────────────────────────────────────────
  const iconColor = fileIconColor(node.name);
  
  const commonClasses = `w-full text-left flex items-center gap-1.5 py-[3px] pr-2 rounded text-xs transition-colors group ${
    mode === 'navigate' ? 'cursor-pointer' : 'cursor-default'
  } ${
    isSelected
      ? 'text-white bg-accent/15 border-l-2 border-accent'
      : 'text-white/60 hover:text-white hover:bg-white/5 border-l-2 border-transparent'
  }`;

  const nodeContent = (
    <>
      <span className="shrink-0 w-3" />
      
      {mode === 'select' && (
        <input 
          type="checkbox"
          checked={isChecked}
          onChange={() => onToggleFile(node.path)}
          className="shrink-0 w-3.5 h-3.5 rounded border-border text-accent focus:ring-accent bg-panel cursor-pointer"
        />
      )}
      
      <FileCode
        className="w-3.5 h-3.5 shrink-0"
        style={{ color: isSelected || isChecked ? iconColor : iconColor + 'aa' }}
      />
      
      <span className={`whitespace-nowrap min-w-0 font-mono text-[11px] truncate ${
        isSelected || isChecked ? 'text-white font-medium' : 'group-hover:text-white'
      }`}>
        {highlightMatch(node.name, searchTerm)}
      </span>
    </>
  );

  return (
    <li>
      {mode === 'select' ? (
        <label 
          style={{ paddingLeft: `${indentPx + 4}px` }} 
          className={commonClasses}
          title={node.path}
        >
          {nodeContent}
        </label>
      ) : (
        <button 
          style={{ paddingLeft: `${indentPx + 4}px` }} 
          className={commonClasses}
          onClick={() => onSelectFile(node.path)}
          title={node.path}
        >
          {nodeContent}
        </button>
      )}
    </li>
  );
}