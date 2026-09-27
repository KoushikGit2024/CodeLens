import React, { useState, useEffect, useRef } from 'react';
import { ChevronRight, Folder, FolderOpen, FileCode, Bookmark } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { useBookmark } from '../../services/storage/bookmark.store';

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
          ? <span key={i} className="bg-accent/40 text-text font-semibold rounded-sm px-0.5">{part}</span> 
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
  const { repoId } = useParams();
  const bookmark = useBookmark(repoId, node.type === 'file' ? node.path : null);

  const cleanSelectedPath = selectedPath ? decodeURIComponent(selectedPath).replace(/\/$/, '') : null;
  const cleanNodePath = node.path.replace(/\/$/, '');
  
  const isSelected = mode === 'navigate' ? cleanNodePath === cleanSelectedPath : false;
  const isChecked = mode === 'select' ? selectedFiles.includes(node.path) : false;
  const isAncestor = cleanSelectedPath?.startsWith(cleanNodePath + '/');
  const isSelectedFileAncestor = mode === 'select' && selectedFiles?.some(f => f.startsWith(cleanNodePath + '/'));
  
  const [open, setOpen] = useState(true);
  const indentPx = depth * 14;

  const nodeRef = useRef(null);

  useEffect(() => {
    if (isAncestor || isSelected || isSelectedFileAncestor || Boolean(searchTerm)) {
      setOpen(true);
    }
  }, [isAncestor, isSelected, isSelectedFileAncestor, searchTerm]);

  useEffect(() => {
    if (isSelected && nodeRef.current) {
      // Small delay to ensure parents have expanded first
      setTimeout(() => {
        const node = nodeRef.current;
        if (!node) return;
        
        // Find the specific sidebar scrolling container to avoid scrolling the whole page or code pane
        const container = node.closest('.overflow-y-auto') || node.closest('.custom-scrollbar');
        if (container) {
          const containerRect = container.getBoundingClientRect();
          const nodeRect = node.getBoundingClientRect();
          
          // Calculate how far the node is from the top of the container
          const relativeTop = nodeRect.top - containerRect.top;
          
          // Calculate the target scroll position to place the node in the upper-middle (~33% from top)
          const targetScroll = container.scrollTop + relativeTop - (containerRect.height * 0.33);
          
          container.scrollTo({ top: targetScroll, behavior: 'smooth' });
        } else {
          // Fallback if no container is found
          node.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
  }, [isSelected]);

  if (node.type === 'directory') {
    const hasChildren = node.children?.length > 0;
    return (
      <li ref={isSelected ? nodeRef : null}>
        <button
          onClick={() => {
            setOpen((o) => !o);
            if (mode === 'navigate' && onSelectFile) {
              onSelectFile(node.path);
            }
          }}
          style={{ paddingLeft: `${indentPx + 4}px` }}
          className={`w-full text-left flex items-center gap-1.5 py-[3px] pr-2 rounded text-xs group transition-colors ${
            isSelected 
              ? 'bg-accent/15 border-l-2 border-accent text-accent font-medium' 
              : 'text-text/60 hover:text-text hover:bg-white/5 border-l-2 border-transparent'
          }`}
          title={node.name}
        >
          {/* chevron */}
          <span className={`shrink-0 w-3 h-3 flex items-center justify-center ${isSelected ? 'text-accent' : 'text-text/30 group-hover:text-text/60'}`}>
            <ChevronRight
              className={`w-3 h-3 transition-transform duration-150 ${
                open && hasChildren ? 'rotate-90' : ''
              }`}
            />
          </span>
          {/* folder icon */}
          <span className="shrink-0">
            {open && hasChildren
              ? <FolderOpen className={`w-3.5 h-3.5 ${isSelected ? 'text-accent' : 'text-yellow-400/80'}`} />
              : <Folder className={`w-3.5 h-3.5 ${isSelected ? 'text-accent' : 'text-yellow-400/60'}`} />
            }
          </span>
          {/* label */}
          <span className="whitespace-nowrap min-w-0 font-medium truncate" title={node.name}>
            {highlightMatch(node.name, searchTerm)}
          </span>
          {/* child count badge */}
          {hasChildren && (
            <span className={`ml-auto shrink-0 text-[9px] tabular-nums ${isSelected ? 'text-accent/60' : 'text-text/20 group-hover:text-text/40'}`}>
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
      ? 'text-text bg-accent/15 border-l-2 border-accent'
      : 'text-text/60 hover:text-text hover:bg-white/5 border-l-2 border-transparent'
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
      
      <span className={`whitespace-nowrap min-w-0 font-mono text-[11px] truncate flex-1 ${
        isSelected || isChecked ? 'text-text font-medium' : 'group-hover:text-text'
      }`}>
        {highlightMatch(node.name, searchTerm)}
      </span>
      {bookmark && (
        <Bookmark className="w-3 h-3 text-accent shrink-0 ml-1 opacity-80" fill="currentColor" />
      )}
    </>
  );

  return (
    <li ref={isSelected ? nodeRef : null}>
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