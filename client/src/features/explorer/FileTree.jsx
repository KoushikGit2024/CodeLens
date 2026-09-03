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

export function FileTree({ nodes, selectedPath, onSelectFile, depth = 0 }) {
  return (
    <ul className="select-none">
      {nodes.map((node) => (
        <FileTreeNode
          key={node.path}
          node={node}
          depth={depth}
          selectedPath={selectedPath}
          onSelectFile={onSelectFile}
        />
      ))}
    </ul>
  );
}

function FileTreeNode({ node, depth, selectedPath, onSelectFile }) {
  // Auto-collapse only at depth > 1 so top-level folders start open
  const [open, setOpen] = useState(depth < 1);
  const isSelected = node.path === selectedPath;
  const isAncestor = selectedPath?.startsWith(node.path + '/');
  const indentPx = depth * 14;

  useEffect(() => {
    if (isAncestor) {
      setOpen(true);
    }
  }, [isAncestor]);

  if (node.type === 'directory') {
    const hasChildren = node.children?.length > 0;
    return (
      <li>
        <button
          onClick={() => setOpen((o) => !o)}
          style={{ paddingLeft: `${indentPx + 4}px` }}
          className="min-w-max text-left flex items-center gap-1.5 py-[3px] pr-2 rounded text-xs group text-white/60 hover:text-white hover:bg-white/5 transition-colors"
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
          {/* label — no truncation, allow scroll */}
          <span className="whitespace-nowrap min-w-0 font-medium" title={node.name}>{node.name}</span>
          {/* child count badge */}
          {hasChildren && (
            <span className="ml-auto shrink-0 text-[9px] text-white/20 group-hover:text-white/40 tabular-nums">
              {node.children.filter(c => c.type === 'file').length > 0
                ? node.children.filter(c => c.type === 'file').length
                : ''}
            </span>
          )}
        </button>

        {/* children — rendered with a subtle indent guide line */}
        {open && hasChildren && (
          <div className="relative">
            <span
              className="absolute top-0 bottom-0 border-l border-white/[0.06]"
              style={{ left: `${indentPx + 11}px` }}
            />
            <FileTree
              nodes={node.children}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelectFile={onSelectFile}
            />
          </div>
        )}
      </li>
    );
  }

  // ── File node ──────────────────────────────────────────────────────────────
  const iconColor = fileIconColor(node.name);
  return (
    <li>
      <button
        onClick={() => onSelectFile(node.path)}
        style={{ paddingLeft: `${indentPx + 4}px` }}
        className={`min-w-max text-left flex items-center gap-1.5 py-[3px] pr-2 rounded text-xs transition-colors group ${
          isSelected
            ? 'text-white bg-accent/15 border-l-2 border-accent'
            : 'text-white/60 hover:text-white hover:bg-white/5 border-l-2 border-transparent'
        }`}
        title={node.path}
      >
        {/* spacer to align with folder chevron */}
        <span className="shrink-0 w-3" />
        {/* coloured file icon */}
        <FileCode
          className="w-3.5 h-3.5 shrink-0"
          style={{ color: isSelected ? iconColor : iconColor + 'aa' }}
        />
        {/* filename — no truncation, allow scroll */}
        <span className={`whitespace-nowrap min-w-0 font-mono text-[11px] ${
          isSelected ? 'text-white font-medium' : 'group-hover:text-white'
        }`}>
          {node.name}
        </span>
      </button>
    </li>
  );
}
