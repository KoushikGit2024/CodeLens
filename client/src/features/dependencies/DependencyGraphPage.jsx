/**
 * DependencyGraphPage.jsx — Clustered, heat-mapped dependency graph
 *
 * Innovations:
 *  1. **Directory Clusters**: Files are grouped into rounded "swimlane" groups
 *     by their parent directory, making module boundaries instantly visible.
 *  2. **Coupling Heat-Map**: Nodes are colored on a gradient from cool-blue
 *     (low coupling) to hot-red (highly connected/coupled) based on their
 *     combined in+out degree.
 *  3. **Focus Mode**: Clicking a node instantly fades everything except its
 *     direct connections, creating a 1-hop neighbourhood view.
 *  4. **Minimap cluster colors** reflect directory assignment.
 *  5. All three layout engines: Clustered (default), Force physics, Flat LR.
 */

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  Handle,
  Position,
  Panel,
  getBezierPath,
  EdgeLabelRenderer,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { ChevronLeft, Loader2, AlertCircle, Database, Package, File, RefreshCw, X, ExternalLink, GitBranch, Layers, Zap, LayoutGrid, Filter, Info } from 'lucide-react';
import { repositoryApi } from '../../shared/api';
import { ResizableLayout } from '../../shared/components/ResizableLayout';
import ContextBreadcrumbs from '../../shared/components/ContextBreadcrumbs';
import dagre from 'dagre';
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from 'd3-force';

// ── Palette ───────────────────────────────────────────────────────────────────

// 12 distinct directory colors — assigned round-robin
const DIR_PALETTE = [
  '#1f6feb', '#2ea043', '#d29922', '#da3633', '#8957e5',
  '#0096c7', '#e85d04', '#06d6a0', '#ef476f', '#ffd166',
  '#118ab2', '#7209b7',
];

// Coupling heat: low→high degree = blue→amber→red
function couplingColor(degree, maxDegree) {
  if (maxDegree === 0) return '#1f6feb';
  const t = Math.min(degree / maxDegree, 1);
  if (t < 0.4) return `hsl(${210 - t * 60 / 0.4}, 70%, 55%)`;  // blue → cyan
  if (t < 0.7) return `hsl(${150 - (t - 0.4) * 110 / 0.3}, 70%, 50%)`; // cyan → amber
  return `hsl(${40 - (t - 0.7) * 130 / 0.3}, 80%, 50%)`; // amber → red
}

const NODE_W = 150;
const NODE_H = 34;
const PKG_W  = 110;
const PKG_H  = 30;

const CustomNode = ({ data }) => {
  const isFile = data.nodeType === 'file';
  const w = isFile ? NODE_W : PKG_W;
  return (
    <div
      className="shadow-md rounded transition-all duration-150"
      style={{
        opacity: data.isFaded ? 0.10 : 1,
        width: w,
        border: data.isFocused
          ? `2px solid ${data.heatColor || '#58a6ff'}`
          : `1px solid ${(data.heatColor || '#30363d')}${data.isFaded ? '18' : '55'}`,
        background: data.isFocused ? 'rgba(26, 39, 64, 0.9)' : 'rgba(22, 27, 34, 0.7)',
        // backdropFilter: 'blur(6px)',
        boxShadow: data.isFocused ? `0 0 10px ${data.heatColor || '#58a6ff'}33` : 'none',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} isConnectable={false} />
      <div className="flex items-center gap-1.5 px-2 py-1.5" style={{ overflow: 'hidden' }}>
        {isFile
          ? <File className="w-3 h-3 shrink-0" style={{ color: data.heatColor || '#58a6ff', minWidth: 12 }} />
          : <Package className="w-3 h-3 shrink-0 text-amber-400" style={{ minWidth: 12 }} />
        }
        <div style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
          <div
            className="text-white font-semibold leading-tight"
            style={{ fontSize: 10, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}
            title={data.label}
          >
            {data.label}
          </div>
          {isFile && data.shortDir && (
            <div
              className="leading-tight"
              style={{ fontSize: 9, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', color: data.dirColor || '#8b949e' }}
              title={data.dir}
            >
              {data.shortDir}
            </div>
          )}
        </div>
        {data.degree > 0 && (
          <span
            style={{
              fontSize: 9, fontWeight: 700, borderRadius: 99,
              padding: '0 4px', flexShrink: 0, lineHeight: '14px',
              background: `${data.heatColor || '#58a6ff'}22`,
              color: data.heatColor || '#58a6ff',
            }}
          >
            {data.degree}
          </span>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} isConnectable={false} />
    </div>
  );
};

// Group header node (non-interactive background label)
const GroupNode = ({ data }) => (
  <div
    style={{
      width: '100%', height: '100%',
      border: `1.5px solid ${data.color}44`,
      borderRadius: 12,
      background: `${data.color}08`,
    }}
  >
    <div
      className="absolute top-2 left-3 text-[10px] font-bold uppercase tracking-widest"
      style={{ color: `${data.color}bb` }}
    >
      {data.label}
    </div>
  </div>
);

const nodeTypes = { custom: CustomNode, group: GroupNode };

// ── Spring Edge ───────────────────────────────────────────────────────────────
// Renders a sinusoidal "spring" wave between two handles
const SpringEdge = ({ id, sourceX, sourceY, targetX, targetY, style = {}, markerEnd, data }) => {
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length < 1) return null;

  // Perpendicular unit vector
  const perpX = -dy / length;
  const perpY =  dx / length;

  // Coils proportional to distance, amplitude small so it doesn't overwhelm
  const coils = Math.max(2, Math.round(length / 50));
  const amplitude = Math.min(6, length / (coils * 3));

  // Build polyline points along a sinusoidal path
  const steps = coils * 16;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // Envelope: taper to 0 at both ends so the spring doesn't jut out at handles
    const envelope = Math.sin(t * Math.PI);
    const wave = Math.sin(t * coils * Math.PI * 2) * amplitude * envelope;
    pts.push(`${sourceX + t * dx + wave * perpX},${sourceY + t * dy + wave * perpY}`);
  }

  const pathD = `M ${pts.join(' L ')}`;
  return (
    <>
      <path id={id} className="react-flow__edge-path" d={pathD} style={{ ...style, fill: 'none' }} markerEnd={markerEnd} />
      {/* wider transparent hit-area so edges are hoverable */}
      <path d={pathD} style={{ fill: 'none', stroke: 'transparent', strokeWidth: 12 }} />
    </>
  );
};

const edgeTypes = { spring: SpringEdge };

// ── Clustering helper ─────────────────────────────────────────────────────────

function getDir(filePath) {
  if (!filePath) return '(root)';
  const parts = filePath.split('/');
  return parts.length > 1 ? parts.slice(0, -1).join('/') : '(root)';
}

// ── Dagre layout ──────────────────────────────────────────────────────────────

function getDagreLayout(nodes, edges, direction = 'LR') {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, ranksep: 50, nodesep: 20, edgesep: 10 });
  nodes.forEach(n => g.setNode(n.id, {
    width: parseInt(n.style?.width ?? n.width ?? NODE_W, 10),
    height: parseInt(n.style?.height ?? n.height ?? NODE_H, 10)
  }));
  edges.forEach(e => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return nodes.map(n => {
    const pos = g.node(n.id);
    const w = parseInt(n.style?.width ?? n.width ?? NODE_W, 10);
    const h = parseInt(n.style?.height ?? n.height ?? NODE_H, 10);
    return { ...n, position: { x: pos.x - w / 2, y: pos.y - h / 2 } };
  });
}

// ── Force layout (Initial Positions Only) ───────────────────────────────────
// We now just scatter the nodes randomly; the live effect will animate them.
function getForceLayout(nodes, edges) {
  return nodes.map(n => ({
    ...n,
    position: { 
      x: (Math.random() - 0.5) * 600, 
      y: (Math.random() - 0.5) * 600 
    }
  }));
}

// ── Clustered layout (groups) ─────────────────────────────────────────────────

function getClusteredLayout(fileNodes, edges, dirColorMap) {
  const groups = {};
  for (const n of fileNodes) {
    const d = n.data.dir || '(root)';
    if (!groups[d]) groups[d] = [];
    groups[d].push(n);
  }

  const PAD = 16, GAP_X = 10, GAP_Y = 10, GROUP_GAP_X = 60, GROUP_GAP_Y = 60;
  const HEADER_H = 24;
  // Max columns: sqrt of count, capped at 6
  function optCols(count) { return Math.min(6, Math.max(1, Math.round(Math.sqrt(count)))); }

  const sortedDirs = Object.keys(groups).sort();
  // Layout groups in a 2-column arrangement
  const GROUP_COLS = 2;

  const builtGroups = sortedDirs.map((dir) => {
    const members = groups[dir];
    const cols = optCols(members.length);
    const rows = Math.ceil(members.length / cols);
    const gW = cols * (NODE_W + GAP_X) - GAP_X + PAD * 2;
    const gH = rows * (NODE_H + GAP_Y) - GAP_Y + PAD * 2 + HEADER_H;
    const color = dirColorMap.get(dir) || '#8b949e';
    return { dir, members, cols, gW, gH, color };
  });

  // Place groups in a 2-column grid
  let colX = [0, 0];
  let colY = [0, 0];
  const groupPositions = {};

  builtGroups.forEach((g, idx) => {
    const col = idx % GROUP_COLS;
    groupPositions[g.dir] = { x: colX[col], y: colY[col] };
    colY[col] += g.gH + GROUP_GAP_Y;
    // Update the x for the next column — track max width per column
    if (col === 0) colX[1] = Math.max(colX[1], g.gW + GROUP_GAP_X);
  });

  const groupNodes = [];
  const positionedNodes = [];

  builtGroups.forEach(({ dir, members, cols, gW, gH, color }) => {
    const { x: gx, y: gy } = groupPositions[dir];
    // Background group node — non-interactive overlay
    groupNodes.push({
      id: `__group__${dir}`,
      type: 'group',
      data: { label: dir.split('/').pop() || dir, color },
      position: { x: gx, y: gy },
      style: { width: gW, height: gH, pointerEvents: 'none' },
      selectable: false,
      draggable: false,
      zIndex: -100,
    });

    // Nodes get ABSOLUTE positions (not parent-relative)
    // so that ReactFlow edges draw correctly across clusters
    members.forEach((n, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      positionedNodes.push({
        ...n,
        // No parentNode — use absolute coords so edges connect properly
        position: {
          x: gx + PAD + col * (NODE_W + GAP_X),
          y: gy + HEADER_H + PAD + row * (NODE_H + GAP_Y),
        },
      });
    });
  });

  return [...groupNodes, ...positionedNodes];
}

// ── Main graph transformer ────────────────────────────────────────────────────

function graphToFlow(graph, selectedId, showExternalPackages, layoutType) {
  let fileNodes = graph.nodes.filter(n => n.type === 'file');
  let pkgNodes = showExternalPackages ? graph.nodes.filter(n => n.type === 'package') : [];
  const renderableNodes = [...fileNodes, ...pkgNodes];
  const nodeIds = new Set(renderableNodes.map(n => n.id));
  // DEBUG: print first node id and first edge source to spot mismatches
  if (import.meta.env.DEV && renderableNodes.length > 0 && graph.edges.length > 0) {
    console.log('[DepGraph] sample nodeId :', renderableNodes[0].id);
    console.log('[DepGraph] sample edge.src:', graph.edges[0].source);
    console.log('[DepGraph] sample edge.tgt:', graph.edges[0].target);
  }
  const edgesToRender = graph.edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));

  // Degree map for heat-coloring
  const degreeMap = new Map();
  for (const e of edgesToRender) {
    degreeMap.set(e.source, (degreeMap.get(e.source) || 0) + 1);
    degreeMap.set(e.target, (degreeMap.get(e.target) || 0) + 1);
  }
  const maxDegree = degreeMap.size === 0 ? 0 : Math.max(...Array.from(degreeMap.values()));

  // Directory → color assignment
  const dirs = [...new Set(fileNodes.map(n => getDir(n.filePath)))].sort();
  const dirColorMap = new Map(dirs.map((d, i) => [d, DIR_PALETTE[i % DIR_PALETTE.length]]));

  // Connected subgraph for focus mode
  const connectedNodes = new Set();
  if (selectedId) {
    connectedNodes.add(selectedId);
    let changed = true;
    while (changed) {
      changed = false;
      for (const e of edgesToRender) {
        if (connectedNodes.has(e.source) && !connectedNodes.has(e.target)) {
          connectedNodes.add(e.target); changed = true;
        }
        if (connectedNodes.has(e.target) && !connectedNodes.has(e.source)) {
          connectedNodes.add(e.source); changed = true;
        }
      }
    }
  }

  const rfFileNodes = fileNodes.map(n => {
    const dir = getDir(n.filePath);
    const shortDir = dir === '(root)' ? '' : dir.split('/').pop();
    const degree = degreeMap.get(n.id) || 0;
    const isFaded = selectedId ? !connectedNodes.has(n.id) : false;
    return {
      id: n.id,
      type: 'custom',
      data: {
        label: (n.filePath || '').split('/').pop(),
        fullLabel: n.filePath || '',
        nodeType: 'file',
        dir,
        shortDir,
        dirColor: dirColorMap.get(dir),
        heatColor: couplingColor(degree, maxDegree),
        degree,
        isFaded,
        isFocused: n.id === selectedId,
      },
      style: { width: NODE_W, height: NODE_H },
      position: { x: 0, y: 0 },
      zIndex: 2,
    };
  });

  const rfPkgNodes = pkgNodes.map(n => {
    const degree = degreeMap.get(n.id) || 0;
    const isFaded = selectedId ? !connectedNodes.has(n.id) : false;
    return {
      id: n.id,
      type: 'custom',
      data: {
        label: (n.name || 'Unknown'),
        fullLabel: n.name || '',
        nodeType: 'package',
        heatColor: '#d29922',
        degree,
        isFaded,
        isFocused: n.id === selectedId,
      },
      style: { width: PKG_W, height: PKG_H },
      position: { x: 0, y: 0 },
      zIndex: 2,
    };
  });

  const rfEdges = edgesToRender.map(e => {
    const isFaded = selectedId ? (!connectedNodes.has(e.source) || !connectedNodes.has(e.target)) : false;
    const isDirect = selectedId && (e.source === selectedId || e.target === selectedId);
    const isCjs = e.type === 'requires';
    const sameDir = (() => {
      const sn = graph.nodes.find(n => n.id === e.source);
      const tn = graph.nodes.find(n => n.id === e.target);
      return sn && tn && getDir(sn.filePath) === getDir(tn.filePath);
    })();

    // Default: subtle, glassy edges that don't clutter
    // Focus: vivid highlighted edge for the selected node's connections
    const strokeColor = isFaded
      ? '#ffffff08'
      : isDirect
        ? '#58a6ff'
        : sameDir
          ? '#7d8590'
          : '#58a6ff55';

    const strokeWidth = isFaded ? 0.5 : isDirect ? 2 : 0.8;
    const opacity = isFaded ? 0.08 : isDirect ? 1 : sameDir ? 0.35 : 0.45;

    return {
      id: `${e.source}->${e.target}`,
      source: e.source,
      target: e.target,
      type: 'spring',   // sinusoidal spring shape
      animated: isDirect,
      style: {
        stroke: strokeColor,
        strokeWidth,
        strokeDasharray: isCjs ? '5 3' : undefined,
        opacity,
      },
      markerEnd: isDirect || !isFaded ? {
        type: MarkerType.ArrowClosed,
        color: strokeColor,
        width: isDirect ? 12 : 8,
        height: isDirect ? 12 : 8,
      } : undefined,
      label: isCjs && isDirect ? 'cjs' : undefined,
      labelStyle: { fill: '#6e7681', fontSize: 8, fontFamily: 'monospace' },
      labelBgStyle: { fill: '#0d1117', fillOpacity: 0.7 },
      data: { edgeType: e.type },
    };
  });


  if (layoutType === 'clustered') {
    const layouted = getClusteredLayout(rfFileNodes, rfEdges, dirColorMap);
    // Position external package nodes in a row below the clustered file nodes
    // so they don't all pile up at (0,0) and crash ReactFlow
    const positionedPkgNodes = rfPkgNodes.map((n, i) => ({
      ...n,
      position: { x: i * (PKG_W + 20), y: 1200 },
    }));
    return { rfNodes: [...layouted, ...positionedPkgNodes], rfEdges, dirColorMap };
  } else if (layoutType === 'force') {
    const allRfNodes = [...rfFileNodes, ...rfPkgNodes];
    return { rfNodes: getForceLayout(allRfNodes, rfEdges), rfEdges, dirColorMap };
  } else {
    const allRfNodes = [...rfFileNodes, ...rfPkgNodes];
    return { rfNodes: getDagreLayout(allRfNodes, rfEdges, 'LR'), rfEdges, dirColorMap };
  }
}

// ── Main component ────────────────────────────────────────────────────────────

const LAYOUT_OPTIONS = [
  { key: 'clustered', label: 'Clustered', icon: LayoutGrid, tip: 'Group files by directory into visual clusters' },
  { key: 'force',     label: 'Force',     icon: Zap,         tip: 'Physics-based organic layout' },
  { key: 'flat',      label: 'Flat',      icon: Layers,      tip: 'Left-to-right hierarchical layout' },
];

export default function DependencyGraphPage() {
  const { repoId } = useParams();
  const navigate   = useNavigate();

  const [graph,    setGraph]    = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [selected, setSelected] = useState(null);
  const [fileInfo, setFileInfo] = useState(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const [showExternalPackages, setShowExternalPackages] = useState(false);
  const [layoutType, setLayoutType] = useState('clustered');
  const [dirColorMap, setDirColorMap] = useState(new Map());

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const simRef = useRef(null);

  // Load graph
  const loadGraph = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await repositoryApi.getDependencyGraph(repoId);
      setGraph(res.data);
    } catch (err) {
      setError(err?.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, [repoId]);

  useEffect(() => { loadGraph(); }, [loadGraph]);

  // Poll if analyzing
  useEffect(() => {
    let timer;
    if (graph?.status === 'analyzing') {
      timer = setTimeout(() => loadGraph(), 2000);
    }
    return () => clearTimeout(timer);
  }, [graph, loadGraph]);

  // Rebuild when graph/settings change
  useEffect(() => {
    if (!graph) return;
    
    const { rfNodes, rfEdges, dirColorMap: dcm } = graphToFlow(graph, selected, showExternalPackages, layoutType);
    
    setDirColorMap(dcm || new Map());
    
    // Live physics for 'force' layout
    if (layoutType === 'force') {
      // If simulation is already running and graph hasn't changed, just update styles/faded states
      if (simRef.current) {
        setNodes(currentNodes => {
           // We just merge the new rfNode styles (like fading) into the current positions
           return currentNodes.map(cn => {
             const updated = rfNodes.find(n => n.id === cn.id);
             return updated ? { ...updated, position: cn.position, fx: cn.fx, fy: cn.fy } : cn;
           });
        });
        setEdges(rfEdges); // edges don't hold physical position, safe to replace
        return; // Early return to avoid stopping/rebuilding simulation
      }

      // Initialize new simulation
      setNodes(rfNodes);
      setEdges(rfEdges);
      
      const simNodes = rfNodes.map(n => ({ id: n.id, x: n.position.x, y: n.position.y }));
      const nodeIndex = new Map(simNodes.map((n, i) => [n.id, i]));
      const simEdges = rfEdges
        .filter(e => nodeIndex.has(e.source) && nodeIndex.has(e.target))
        .map(e => ({ source: nodeIndex.get(e.source), target: nodeIndex.get(e.target) }));

      const linkDist = Math.max(80, Math.min(160, 6000 / Math.max(1, rfNodes.length)));

      simRef.current = forceSimulation(simNodes)
        .force('charge', forceManyBody().strength(-500))
        .force('link', forceLink(simEdges).distance(linkDist).strength(0.5)) // Weaker spring strength
        .force('center', forceCenter(0, 0))
        .force('collide', forceCollide().radius(60))
        .velocityDecay(0.6) // Higher friction to settle faster
        .alpha(1) // Heat up the simulation
        .on('tick', () => {
          setNodes(currentNodes => {
            return currentNodes.map(node => {
              const simNode = simNodes.find(sn => sn.id === node.id);
              if (!simNode) return node;
              const w = parseInt(node.style?.width ?? NODE_W, 10);
              const h = parseInt(node.style?.height ?? NODE_H, 10);
              return {
                ...node,
                position: { x: simNode.x - w / 2, y: simNode.y - h / 2 }
              };
            });
          });
        });
    } else {
      // Non-force layouts: full replace
      if (simRef.current) {
        simRef.current.stop();
        simRef.current = null;
      }
      setNodes(rfNodes);
      setEdges(rfEdges);
    }

  }, [graph, selected, showExternalPackages, layoutType]); // eslint-disable-line

  // Cleanup simulation on unmount
  useEffect(() => {
    return () => {
      if (simRef.current) simRef.current.stop();
    };
  }, []);

  // Node Drag events for live physics interaction
  const onNodeDragStart = useCallback((event, node) => {
    if (layoutType !== 'force' || !simRef.current) return;
    simRef.current.alphaTarget(0.3).restart();
    const simNode = simRef.current.nodes().find(n => n.id === node.id);
    if (simNode) {
      simNode.fx = simNode.x;
      simNode.fy = simNode.y;
    }
  }, [layoutType]);

  const onNodeDrag = useCallback((event, node) => {
    if (layoutType !== 'force' || !simRef.current) return;
    const simNode = simRef.current.nodes().find(n => n.id === node.id);
    const w = parseInt(node.style?.width ?? NODE_W, 10);
    const h = parseInt(node.style?.height ?? NODE_H, 10);
    if (simNode) {
      simNode.fx = node.position.x + w / 2;
      simNode.fy = node.position.y + h / 2;
    }
  }, [layoutType]);

  const onNodeDragStop = useCallback((event, node) => {
    if (layoutType !== 'force' || !simRef.current) return;
    simRef.current.alphaTarget(0);
    const simNode = simRef.current.nodes().find(n => n.id === node.id);
    if (simNode) {
      simNode.fx = null;
      simNode.fy = null;
    }
  }, [layoutType]);

  // Node click → focus + load detail
  const onNodeClick = useCallback(async (_ev, rfNode) => {
    if (rfNode.type === 'group') return;
    const nodeId = rfNode.id;
    setSelected(prev => prev === nodeId ? null : nodeId); // toggle deselect

    if (rfNode.data.nodeType !== 'file') {
      setFileInfo(null);
      return;
    }

    const filePath = rfNode.data.fullLabel;
    setInfoLoading(true);
    setFileInfo(null);
    try {
      const res = await repositoryApi.getFileDependencyInfo(repoId, filePath);
      setFileInfo(res.data);
    } catch {
      setFileInfo(null);
    } finally {
      setInfoLoading(false);
    }
  }, [repoId]);

  const onPaneClick = useCallback(() => {
    setSelected(null);
    setFileInfo(null);
  }, []);

  // Stats
  const stats = useMemo(() => {
    if (!graph || graph.status === 'analyzing' || !graph.meta) return null;
    return {
      files:      graph.meta.totalFiles,
      packages:   graph.meta.totalPackages,
      edges:      graph.meta.totalEdges,
      unresolved: graph.meta.unresolvedImports,
      cycles:     graph.cycles?.length ?? 0,
      isolated:   graph.isolatedFiles?.length ?? 0,
    };
  }, [graph]);

  if (loading && !graph) {
    return (
      <div className="min-h-screen flex items-center justify-center gap-3">
        <Loader2 className="w-5 h-5 text-accent animate-spin" />
        <span className="text-muted text-sm">Building dependency graph…</span>
      </div>
    );
  }

  if (error) {
    const isNotReady = error.toLowerCase().includes('not ready') || error.toLowerCase().includes('pending');
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-6 h-6 text-danger mx-auto mb-3" />
          <p className="text-danger mb-4 text-sm">{error}</p>
          {isNotReady ? (
            <button 
              onClick={async () => {
                await repositoryApi.analyze(repoId);
                window.location.reload();
              }}
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors"
            >
              Start Analysis
            </button>
          ) : (
            <button onClick={() => navigate(-1)} className="text-sm text-accent hover:underline">← Go back</button>
          )}
        </div>
      </div>
    );
  }

  if (graph?.status === 'analyzing') {
    return (
      <div className="min-h-screen flex items-center justify-center gap-3">
        <Loader2 className="w-5 h-5 text-accent animate-spin" />
        <span className="text-muted text-sm">Analysis in progress. Please wait…</span>
      </div>
    );
  }

  return (
    <ResizableLayout
      panels={[
        {
          id: 'controls',
          defaultSize: 14,
          minWidth: 170,
          collapsible: true,
          collapseDirection: 'left',
          title: 'Filters',
          icon: <Filter />,
          content: (
            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-4 custom-scrollbar bg-panel h-full text-xs">

              {/* Stats */}
              {stats && (
                <section>
                  <p className="text-muted uppercase tracking-wider mb-2">Overview</p>
                  <StatRow label="Files"      value={stats.files} />
                  <StatRow label="Packages"   value={stats.packages} />
                  <StatRow label="Edges"      value={stats.edges} />
                  <StatRow label="Unresolved" value={stats.unresolved} warn={stats.unresolved > 0} />
                  <StatRow label="Cycles"     value={stats.cycles}     warn={stats.cycles > 0} />
                  <StatRow label="Isolated"   value={stats.isolated} />
                </section>
              )}

              {/* Layout toggle */}
              <section>
                <p className="text-muted uppercase tracking-wider mb-2">Layout</p>
                <div className="flex flex-col gap-1.5">
                  {LAYOUT_OPTIONS.map(({ key, label, icon: Icon, tip }) => (
                    <button
                      key={key}
                      onClick={() => setLayoutType(key)}
                      title={tip}
                      className={`flex items-center gap-2 rounded px-2 py-1.5 transition-colors text-left ${
                        layoutType === key
                          ? 'bg-accent/20 text-accent border border-accent/40'
                          : 'text-muted hover:text-white hover:bg-[#30363d] border border-transparent'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      {label}
                    </button>
                  ))}
                </div>
              </section>

              {/* External packages toggle */}
              <section className="border-t border-border pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-white font-medium">Externals</span>
                  <button
                    onClick={() => setShowExternalPackages(p => !p)}
                    className={`w-8 h-4 rounded-full transition-colors ${showExternalPackages ? 'bg-accent' : 'bg-surface border border-border'}`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${showExternalPackages ? 'translate-x-4' : 'translate-x-0'} border`} />
                  </button>
                </div>
                <p className="text-muted mt-1" style={{ fontSize: 10 }}>Show npm packages as nodes</p>
              </section>

              {/* Directory colour key (clustered mode) */}
              {layoutType === 'clustered' && dirColorMap.size > 0 && (
                <section className="border-t border-border pt-3">
                  <p className="text-muted uppercase tracking-wider mb-2">Directories</p>
                  <div className="flex flex-col gap-1">
                    {[...dirColorMap.entries()].map(([dir, color]) => (
                      <div key={dir} className="flex items-center gap-2">
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: color, display: 'inline-block', flexShrink: 0 }} />
                        <span className="truncate text-muted" title={dir}>{dir.split('/').pop() || dir}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Heat map legend */}
              <section className="border-t border-border pt-3">
                <p className="text-muted uppercase tracking-wider mb-2">Coupling Heat</p>
                <div className="flex h-3 rounded overflow-hidden mb-1">
                  {Array.from({ length: 20 }, (_, i) => (
                    <div key={i} style={{ flex: 1, background: couplingColor(i, 19) }} />
                  ))}
                </div>
                <div className="flex justify-between text-muted" style={{ fontSize: 9 }}>
                  <span>Low</span><span>High</span>
                </div>
                <p className="text-muted mt-1" style={{ fontSize: 10 }}>Node color = total connections (in + out)</p>
              </section>

              {/* Cycles */}
              {graph?.cycles?.length > 0 && (
                <section className="border-t border-border pt-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-warning uppercase tracking-wider" style={{ fontSize: 10 }}>⚠ Cycles ({graph.cycles.length})</p>
                    <Link to={`/explore/${repoId}/refactoring`} className="text-warning underline hover:text-white" style={{ fontSize: 10 }}>Fix</Link>
                  </div>
                  {graph.cycles.slice(0, 5).map((cycle, i) => (
                    <p key={i} className="text-muted mb-0.5 truncate" title={cycle.join(' → ')} style={{ fontSize: 10 }}>
                      {cycle.map(f => f.split('/').pop()).join(' → ')}
                    </p>
                  ))}
                  {graph.cycles.length > 5 && <p className="text-muted" style={{ fontSize: 10 }}>+{graph.cycles.length - 5} more…</p>}
                </section>
              )}

              {/* Isolated */}
              {graph?.isolatedFiles?.length > 0 && (
                <section className="border-t border-border pt-3">
                  <p className="text-muted uppercase tracking-wider mb-1.5" style={{ fontSize: 10 }}>Isolated files ({graph.isolatedFiles.length})</p>
                  {graph.isolatedFiles.slice(0, 8).map(f => (
                    <p key={f} className="text-muted truncate mb-0.5" title={f} style={{ fontSize: 10 }}>{f.split('/').pop()}</p>
                  ))}
                </section>
              )}
            </div>
          )
        },
        {
          id: 'graph',
          defaultSize: 60,
          minWidth: 300,
          collapsible: false,
          content: (
            <div className="relative bg-[#0d1117] flex flex-col h-full w-full">
              <ContextBreadcrumbs 
                domain="Dependency Graph" 
                activeNode={selected} 
                onClear={() => setSelected(null)} 
              />
              {nodes.length === 0 ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                  <Database className="w-12 h-12 text-muted" />
                  <h2 className="text-white text-lg font-medium">No dependencies detected</h2>
                  <p className="text-muted text-sm max-w-sm text-center">No resolvable internal dependency relationships were found.</p>
                </div>
              ) : (
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  nodeTypes={nodeTypes}
                  edgeTypes={edgeTypes}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onNodeClick={onNodeClick}
                  onNodeDragStart={onNodeDragStart}
                  onNodeDrag={onNodeDrag}
                  onNodeDragStop={onNodeDragStop}
                  onPaneClick={onPaneClick}
                  fitView
                  fitViewOptions={{ padding: 0.15 }}
                  className="bg-transparent"
                  minZoom={0.05}
                  maxZoom={2}
                  elementsSelectable={false}
                  elevateEdgesOnSelect={false}
                  nodesConnectable={false}
                  proOptions={{ hideAttribution: true }}
                  defaultEdgeOptions={{ zIndex: 1 }}
                >
                  <Background color="#21262d" gap={20} size={1} variant="dots" />
                  <Controls className="bg-panel border-border" />
                  <MiniMap
                    nodeColor={n => {
                      if (n.type === 'group') return '#ffffff08';
                      return n.data?.heatColor || '#1f6feb';
                    }}
                    maskColor="rgba(13,17,23,0.85)"
                    style={{ background: '#161b22', border: '1px solid #30363d' }}
                  />
                  
                </ReactFlow>
              )}
            </div>
          )
        },
        {
          id: 'detail',
          defaultSize: 26,
          minWidth: 200,
          collapsible: true,
          collapseDirection: 'right',
          title: 'Details',
          icon: <Info />,
          content: (
            <div className="flex-1 overflow-y-auto p-3 custom-scrollbar bg-panel h-full text-xs">
              {!selected && (
                <div className="mt-8 text-center flex flex-col items-center gap-3 text-muted">
                  <GitBranch className="w-8 h-8 opacity-30" />
                  <p>Click any file node to inspect its connections</p>
                  <p className="text-[10px] opacity-60">Click again to deselect</p>
                </div>
              )}

              {selected && infoLoading && (
                <div className="flex items-center gap-2 mt-4 justify-center">
                  <Loader2 className="w-4 h-4 text-accent animate-spin" />
                  <span className="text-muted">Loading…</span>
                </div>
              )}

              {selected && !infoLoading && fileInfo && (
                <FileDetailPanel info={fileInfo} repoId={repoId} />
              )}

              {selected && !infoLoading && !fileInfo && (
                <PackageDetailPanel nodeId={selected} graph={graph} />
              )}
            </div>
          )
        }
      ]}
    />
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatRow({ label, value, warn = false }) {
  return (
    <div className="flex justify-between items-center py-0.5">
      <span className="text-xs text-muted">{label}</span>
      <span className={`text-xs font-mono ${warn && value > 0 ? 'text-warning' : 'text-white'}`}>{value}</span>
    </div>
  );
}

function FileDetailPanel({ info, repoId }) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-muted uppercase tracking-wider mb-1">File</p>
        <p className="text-white font-mono whitespace-nowrap overflow-x-auto custom-scrollbar pb-1 mb-1 text-[11px]">{info.filePath}</p>
        <Link
          to={`/explore/${repoId}/source?path=${encodeURIComponent(info.filePath)}`}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-accent/10 border border-accent/40 rounded text-accent hover:bg-accent/20 transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          View in Explorer
        </Link>
      </div>

      <div className="flex gap-3">
        <Chip label={`${info.dependencyCount} deps`} color="accent" />
        <Chip label={`${info.dependentCount} users`} color="success" />
      </div>

      {info.dependencies.length > 0 && (
        <section>
          <p className="text-muted uppercase tracking-wider mb-1.5">Imports ({info.dependencyCount})</p>
          {info.dependencies.map((dep, i) => <DepEntry key={i} dep={dep} repoId={repoId} />)}
        </section>
      )}

      {info.dependents.length > 0 && (
        <section>
          <p className="text-muted uppercase tracking-wider mb-1.5">Imported by ({info.dependentCount})</p>
          {info.dependents.map((dep, i) => <DepEntry key={i} dep={dep} reverse repoId={repoId} />)}
        </section>
      )}

      {info.externalPackages?.length > 0 && (
        <section>
          <p className="text-muted uppercase tracking-wider mb-1.5">External packages</p>
          {info.externalPackages.map(pkg => (
            <div key={pkg} className="flex items-center gap-1.5 py-0.5">
              <Package className="w-3 h-3 text-amber-400 shrink-0" />
              <span className="text-white font-mono truncate">{pkg}</span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function PackageDetailPanel({ nodeId, graph }) {
  const node = graph?.nodes?.find(n => n.id === nodeId);
  if (!node) return null;

  if (node.type === 'package') {
    const users = graph.edges
      .filter(e => e.target === nodeId)
      .map(e => graph.nodes.find(n => n.id === e.source)?.filePath ?? e.source);

    return (
      <div className="flex flex-col gap-3">
        <div>
          <p className="text-muted uppercase tracking-wider mb-1">Package</p>
          <div className="flex items-center gap-1.5">
            <Package className="w-4 h-4 text-amber-400 shrink-0" />
            <p className="text-white font-mono break-all">{node.name}</p>
          </div>
        </div>
        {users.length > 0 && (
          <section>
            <p className="text-muted uppercase tracking-wider mb-1.5">Imported by ({users.length})</p>
            {users.map((f, i) => (
              <div key={i} className="flex items-center gap-1.5 py-0.5">
                <File className="w-3 h-3 text-accent shrink-0" />
                <span className="text-white font-mono truncate">{f.split('/').pop()}</span>
              </div>
            ))}
          </section>
        )}
      </div>
    );
  }
  return null;
}

function DepEntry({ dep, repoId }) {
  const name  = dep.filePath ? dep.filePath.split('/').pop() : dep.package;
  const Icon  = dep.package ? Package : File;
  const color = dep.package ? 'text-amber-400' : 'text-accent';

  return (
    <div className="flex items-center gap-1.5 py-0.5 group">
      <Icon className={`w-3 h-3 ${color} shrink-0`} />
      <span className="text-white font-mono truncate flex-1" title={dep.filePath || dep.package}>{name}</span>
      {dep.filePath && (
        <Link
          to={`/explore/${repoId}/source?path=${encodeURIComponent(dep.filePath)}`}
          className="opacity-0 group-hover:opacity-100 text-accent hover:underline shrink-0"
          title="View in Explorer"
        >
          <ExternalLink className="w-3 h-3" />
        </Link>
      )}
    </div>
  );
}

function Chip({ label, color }) {
  const cls = color === 'accent' ? 'text-accent border-accent/30' : 'text-green-400 border-green-400/30';
  return <span className={`border rounded px-1.5 py-0.5 ${cls}`}>{label}</span>;
}
