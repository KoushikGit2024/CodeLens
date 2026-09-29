import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import ReactFlow, { 
  Background, 
  Controls, 
  MiniMap, 
  Handle, 
  Position 
} from 'reactflow';
import 'reactflow/dist/style.css';
import clsx from 'clsx';
import { 
  Folder, 
  FileCode, 
  Image as ImageIcon,
  FileText,
  FileJson,
  Terminal,
  Database,
  Search,
  Loader2,
  FolderTree
} from 'lucide-react';
import { repositoryApi } from '../../shared/api';
import PageHeader from '../../shared/components/PageHeader';
import { ExportDiagramButton } from '../../shared/components/ExportDiagramButton';
import { useRepository } from '../../shared/context/RepositoryContext';
import { useTheme } from '../../shared/context/ThemeContext';

// Maps file extensions to specific icons and colors
const getFileIcon = (name) => {
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  const iconProps = { className: "w-5 h-5 shrink-0" };
  
  switch(ext) {
    case 'js': case 'jsx': case 'ts': case 'tsx': 
      return <FileCode {...iconProps} style={{ color: '#61dafb' }} />;
    case 'json':
      return <FileJson {...iconProps} style={{ color: '#f7c948' }} />;
    case 'md': case 'txt':
      return <FileText {...iconProps} style={{ color: '#aaa' }} />;
    case 'sh': case 'bash':
      return <Terminal {...iconProps} style={{ color: '#89e051' }} />;
    case 'sql': case 'db':
      return <Database {...iconProps} style={{ color: '#e38c00' }} />;
    case 'png': case 'jpg': case 'svg': case 'gif':
      return <ImageIcon {...iconProps} style={{ color: '#a855f7' }} />;
    default:
      return <FileCode {...iconProps} style={{ color: '#9ca3af' }} />;
  }
};

const CustomTreeNode = ({ data }) => {
  const isDir = data.type === 'directory';
  const isActive = data.isActive; // Injected from layout map

  return (
    <div className={clsx(
      "w-[180px] h-[50px] px-3 py-2 rounded-lg border shadow-lg flex items-center gap-2 transition-all",
      isActive ? "bg-accent/20 border-accent shadow-accent/20 scale-105 z-10" : "bg-panel",
      isDir && !isActive ? "border-accent/40 shadow-accent/10" : "",
      !isDir && !isActive ? "border-border/60 hover:border-accent/50 cursor-pointer" : ""
    )}>
      <Handle type="target" position={Position.Top} className="opacity-0" />
      
      <div className="flex items-center justify-center shrink-0">
        {isDir ? <Folder className="w-5 h-5 text-yellow-400" /> : getFileIcon(data.label)}
      </div>
      <span 
        className={clsx(
          "font-medium tracking-wide text-sm truncate min-w-0", 
          isActive ? "text-accent" : (isDir ? "text-text" : "text-text/80")
        )}
        title={data.label}
      >
        {data.label}
      </span>
      
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  );
};

const nodeTypes = {
  treeNode: CustomTreeNode
};

const NODE_WIDTH = 180;
const NODE_HEIGHT = 50;

const H_GAP = 40;
const V_GAP = 120;

const getLayoutedElements = (nodes, edges) => {
  if (nodes.length === 0) return { nodes, edges };

  const nodeMap = new Map();
  nodes.forEach(n => nodeMap.set(n.id, n));
  
  const childrenMap = new Map();
  nodes.forEach(n => childrenMap.set(n.id, []));
  edges.forEach(e => {
    if (childrenMap.has(e.source)) {
      childrenMap.get(e.source).push(e.target);
    }
  });

  const childSet = new Set(edges.map(e => e.target));
  const rootId = nodes.find(n => !childSet.has(n.id))?.id;
  if (!rootId) return { nodes, edges };

  // 1. BFS depth pass
  const depths = new Map();
  const visited = new Set();
  const q = [[rootId, 0]];
  
  while (q.length > 0) {
    const [id, d] = q.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    depths.set(id, d);
    childrenMap.get(id).forEach(c => {
      if (!visited.has(c)) q.push([c, d + 1]);
    });
  }

  // 2. DFS leaf-counter -> x slot
  let leaf = 0;
  const xSlot = new Map();
  
  function place(id) {
    if (!visited.has(id)) return leaf;
    const children = childrenMap.get(id).filter(c => visited.has(c));
    if (children.length === 0) {
      const slot = leaf;
      xSlot.set(id, slot);
      leaf += 1;
      return slot;
    }
    const slots = children.map(place);
    const mid = (Math.min(...slots) + Math.max(...slots)) / 2;
    xSlot.set(id, mid);
    return mid;
  }
  place(rootId);

  const slotPitch = NODE_WIDTH + H_GAP;

  const layoutedNodes = nodes.map(node => {
    const depth = depths.get(node.id) || 0;
    const slot = xSlot.get(node.id) || 0;
    return {
      ...node,
      targetPosition: Position.Top,
      sourcePosition: Position.Bottom,
      position: {
        x: slot * slotPitch,
        y: depth * V_GAP,
      }
    };
  });

  return { nodes: layoutedNodes, edges };
};

const flattenTree = (treeNodes, parentId = null, urlPath = null) => {
  let flatNodes = [];
  let edges = [];

  treeNodes.forEach(node => {
    const nodeId = node.path;
    flatNodes.push({
      id: nodeId,
      type: 'treeNode',
      data: { 
        label: node.name, 
        type: node.type, 
        path: node.path,
        isActive: urlPath && (urlPath === node.path),
        exportBg: '#1E2335',
        exportBorder: node.type === 'directory' ? '#d29922' : '#343B54',
        exportText: node.type === 'directory' ? '#e3b341' : '#CBD5E8'
      },
    });
    
    if (parentId) {
      edges.push({
        id: `${parentId}->${nodeId}`,
        source: parentId,
        target: nodeId,
        type: 'default',
        animated: true,
        style: { stroke: `rgb(${getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim()})`, strokeWidth: 1.5, opacity: 0.6 }
      });
    }

    if (node.children) {
      const children = flattenTree(node.children, nodeId, urlPath);
      flatNodes = [...flatNodes, ...children.nodes];
      edges = [...edges, ...children.edges];
    }
  });

  return { nodes: flatNodes, edges };
};

const filterTree = (treeNodes, searchTerm) => {
  if (!searchTerm) return treeNodes;
  const term = searchTerm.toLowerCase();

  const filterNode = (node) => {
    // 1. Is this node a direct match?
    const isMatch = node.name.toLowerCase().includes(term);
    
    // 2. If it's a folder match, we return it and ALL its children exactly as they are.
    if (isMatch && node.type === 'directory') {
      return { ...node }; 
    }

    // 3. Check children
    let childMatches = [];
    if (node.children) {
      childMatches = node.children.map(filterNode).filter(Boolean);
    }

    // 4. If this node is a file match, or any child matches, return it.
    if (isMatch || childMatches.length > 0) {
      return {
        ...node,
        children: childMatches.length > 0 ? childMatches : node.children
      };
    }

    return null;
  };

  return treeNodes.map(filterNode).filter(Boolean);
};

export default function FileTreePage() {
  const { theme } = useTheme();
  const isLight = theme?.id?.includes('light');
  const { repoId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlPath = searchParams.get('path');
  
  const { repo, fileTree, loading: repoLoading, error: repoError } = useRepository();
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const reactFlowInstance = useRef(null);
  const diagramRef = useRef(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const rawTree = useMemo(() => {
    if (!fileTree) return [];
    let treeData = fileTree;
    // Ensure a single root node for perfect centering and symmetry
    if (treeData.length > 1 || (treeData.length === 1 && treeData[0].type !== 'directory')) {
      treeData = [{
        path: 'root-repo',
        name: repo?.name || 'Repository Root',
        type: 'directory',
        children: treeData
      }];
    }
    return treeData;
  }, [fileTree, repo?.name]);

  // Compute Layout
  const { nodes, edges } = useMemo(() => {
    const filteredTree = filterTree(rawTree, debouncedSearch);
    const flattened = flattenTree(filteredTree, null, urlPath);
    return getLayoutedElements(flattened.nodes, flattened.edges);
  }, [rawTree, debouncedSearch, urlPath]);

  const onNodeDoubleClick = useCallback((event, node) => {
    if (node.data.path === 'root-repo') return;
    // Navigate to source browser for both files AND folders!
    navigate(`/explore/${repoId}/source?path=${encodeURIComponent(node.data.path)}`);
  }, [navigate, repoId]);

  // Auto-center when search changes (debounced)
  useEffect(() => {
    if (reactFlowInstance.current && nodes.length > 0) {
      const rootNode = nodes.find(n => n.id === 'root-repo') || nodes[0];
      if (rootNode) {
        // Small delay to ensure ReactFlow has processed the new layout dimensions
        setTimeout(() => {
          if (reactFlowInstance.current) {
            reactFlowInstance.current.setCenter(
              rootNode.position.x + 90,
              rootNode.position.y + 25,
              { zoom: 1, duration: 800 }
            );
          }
        }, 50);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, rawTree.length]);

  return (
    <div className="flex-1 h-full flex flex-col bg-surface text-text overflow-hidden">
      <div className="px-6 pt-6 shrink-0 flex items-center justify-between">
        <PageHeader 
          title="Architectural File Tree" 
          description="A visual, interactive topology of your entire codebase."
          icon={FolderTree}
        />
        <div className="flex items-center gap-4">
          <div className="relative w-72 group">
            <div className="absolute inset-0 bg-accent/20 rounded-lg blur opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-500"></div>
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted group-focus-within:text-accent transition-colors z-10" />
            <input
              type="text"
              placeholder="Search nodes by name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="relative w-full bg-panel/80 backdrop-blur border border-border/60 hover:border-accent/40 rounded-lg pl-10 pr-4 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all duration-300 z-10 shadow-sm shadow-black/20"
            />
          </div>
          <ExportDiagramButton 
            elementRef={diagramRef} 
            filename={`file-tree-${repoId.replace(/[^a-zA-Z0-9-]/g, '_')}`} 
            className="z-10" 
            availableToggles={['controls', 'minimap']}
            nodes={nodes}
            edges={edges}
          />
        </div>
      </div>

      <div ref={diagramRef} className="flex-1 overflow-hidden relative border-t border-border mt-4 bg-surface">
        {repoLoading ? (
          <div className="flex h-full items-center justify-center text-muted gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-accent" />
            <p>Building dependency layout...</p>
          </div>
        ) : repoError ? (
          <div className="m-6 rounded-lg border border-danger/30 bg-danger/10 p-4 text-danger flex items-center justify-center">
            <p>{repoError}</p>
          </div>
        ) : nodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted opacity-60">
            <FolderTree className="w-16 h-16 mb-4" />
            <p className="text-lg font-medium">No files found</p>
          </div>
        ) : (
            <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodeDoubleClick={onNodeDoubleClick}
            onInit={(rf) => {
              reactFlowInstance.current = rf;
              const rootNode = nodes.find(n => n.id === 'root-repo') || nodes[0];
              if (rootNode) {
                // Focus strictly on the root node at 1x zoom when the graph loads
                rf.setCenter(
                  rootNode.position.x + 90, // + NODE_WIDTH/2
                  rootNode.position.y + 25, // + NODE_HEIGHT/2
                  { zoom: 1, duration: 800 }
                );
              }
            }}
            minZoom={0.05}
            maxZoom={2}
            className="bg-transparent"
            elementsSelectable={false}
            nodesConnectable={false}
            proOptions={{ hideAttribution: true }}
          >
            <Background color={`rgb(${getComputedStyle(document.documentElement).getPropertyValue('--color-border').trim()})`} gap={24} size={2} variant="dots" />
            <Controls className="bg-panel border-border" />
            <MiniMap 
              maskColor={isLight ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.7)"}
              className="bg-panel border border-border"
              nodeColor={n => n.data?.type === 'directory' ? '#facc15' : `rgb(${getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim()})`}
            />
          </ReactFlow>
        )}
      </div>
    </div>
  );
}
