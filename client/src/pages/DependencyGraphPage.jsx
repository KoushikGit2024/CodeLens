/**
 * DependencyGraphPage.jsx
 *
 * Renders the dependency graph for a repository using React Flow.
 *
 * Layout:
 *   ┌─────────────┬───────────────────────────────┬──────────────────┐
 *   │  Header bar                                                      │
 *   ├─────────────┼───────────────────────────────┼──────────────────┤
 *   │  Legend /   │  React Flow graph canvas       │  File detail     │
 *   │  stats      │  (nodes + edges)               │  panel           │
 *   └─────────────┴───────────────────────────────┴──────────────────┘
 *
 * Node colours:
 *   Blue   — internal file node
 *   Orange — external package node
 *
 * Selecting a node opens the detail panel showing:
 *   - direct dependencies (what this file imports)
 *   - direct dependents  (what imports this file)
 *   - external packages used
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { Loader2, ChevronLeft, Package, File, AlertCircle, RefreshCw } from 'lucide-react';
import { repositoryApi } from '../api';

// ── Layout constants ──────────────────────────────────────────────────────────

const FILE_NODE_COLOR    = '#1f6feb';   // blue-ish
const PKG_NODE_COLOR     = '#d29922';   // amber/orange
const SELECTED_COLOR     = '#58a6ff';
const FILE_NODE_WIDTH    = 180;
const FILE_NODE_HEIGHT   = 36;
const PKG_NODE_WIDTH     = 140;
const PKG_NODE_HEIGHT    = 32;
const H_GAP              = 220;
const V_GAP              = 70;
const NODES_PER_ROW      = 6;

// ── Auto-layout helper ────────────────────────────────────────────────────────

/**
 * Assign (x, y) positions to nodes using a simple grid layout.
 * File nodes come first, then package nodes.
 */
function autoLayout(nodes) {
  const fileNodes = nodes.filter(n => n.data.nodeType === 'file');
  const pkgNodes  = nodes.filter(n => n.data.nodeType === 'package');

  function place(list, startY) {
    return list.map((n, i) => ({
      ...n,
      position: {
        x: (i % NODES_PER_ROW) * H_GAP,
        y: startY + Math.floor(i / NODES_PER_ROW) * V_GAP,
      },
    }));
  }

  const fileRows = Math.ceil(fileNodes.length / NODES_PER_ROW);
  const pkgStartY = fileRows * V_GAP + 80;

  return [
    ...place(fileNodes, 0),
    ...place(pkgNodes, pkgStartY),
  ];
}

// ── Node/edge transformation ──────────────────────────────────────────────────

function graphToFlow(graph, selectedId) {
  const rfNodes = graph.nodes.map(n => {
    const isFile    = n.type === 'file';
    const isSelected = n.id === selectedId;
    const label     = isFile
      ? n.filePath.split('/').pop()       // basename
      : n.name;

    return {
      id:   n.id,
      type: 'default',
      data: {
        label,
        fullLabel: isFile ? n.filePath : n.name,
        nodeType: n.type,
      },
      style: {
        background:  isSelected ? SELECTED_COLOR : (isFile ? FILE_NODE_COLOR : PKG_NODE_COLOR),
        color:       '#ffffff',
        border:      isSelected ? '2px solid #ffffff' : '1px solid rgba(255,255,255,0.2)',
        borderRadius: isFile ? 6 : 12,
        fontSize:    11,
        padding:     '4px 8px',
        width:       isFile ? FILE_NODE_WIDTH : PKG_NODE_WIDTH,
        height:      isFile ? FILE_NODE_HEIGHT : PKG_NODE_HEIGHT,
        display:     'flex',
        alignItems:  'center',
        justifyContent: 'center',
        cursor:      'pointer',
        fontFamily:  'monospace',
        whiteSpace:  'nowrap',
        overflow:    'hidden',
        textOverflow: 'ellipsis',
      },
      position: { x: 0, y: 0 }, // will be set by autoLayout
    };
  });

  const rfEdges = graph.edges.map(e => ({
    id:           `${e.source}->${e.target}`,
    source:       e.source,
    target:       e.target,
    animated:     false,
    style:        { stroke: '#30363d', strokeWidth: 1.5 },
    markerEnd:    { type: MarkerType.ArrowClosed, color: '#30363d', width: 12, height: 12 },
    label:        e.type === 'requires' ? 'cjs' : undefined,
    labelStyle:   { fill: '#8b949e', fontSize: 9 },
    data:         { edgeType: e.type, evidence: e.evidence },
  }));

  return { rfNodes: autoLayout(rfNodes), rfEdges };
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DependencyGraphPage() {
  const { repoId }  = useParams();
  const navigate    = useNavigate();

  const [graph,    setGraph]    = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [selected, setSelected] = useState(null);   // node id
  const [fileInfo, setFileInfo] = useState(null);   // FileDependencies from /graph/file
  const [infoLoading, setInfoLoading] = useState(false);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // ── Load graph ──────────────────────────────────────────────────────────────

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

  // ── Build React Flow nodes/edges when graph changes ─────────────────────────

  useEffect(() => {
    if (!graph) return;
    const { rfNodes, rfEdges } = graphToFlow(graph, selected);
    setNodes(rfNodes);
    setEdges(rfEdges);
  }, [graph, selected]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Node selection → load file detail ───────────────────────────────────────

  const onNodeClick = useCallback(async (_event, rfNode) => {
    const nodeId = rfNode.id;
    setSelected(nodeId);

    // Only fetch detail for file nodes
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

  // ── Derived stats ────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    if (!graph) return null;
    return {
      files:        graph.meta.totalFiles,
      packages:     graph.meta.totalPackages,
      edges:        graph.meta.totalEdges,
      unresolved:   graph.meta.unresolvedImports,
      cycles:       graph.cycles?.length ?? 0,
      isolated:     graph.isolatedFiles?.length ?? 0,
    };
  }, [graph]);

  // ── Render states ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center gap-3">
        <Loader2 className="w-5 h-5 text-accent animate-spin" />
        <span className="text-muted text-sm">Building dependency graph…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-6 h-6 text-danger mx-auto mb-3" />
          <p className="text-danger mb-4 text-sm">{error}</p>
          <button onClick={() => navigate(-1)} className="text-sm text-accent hover:underline">
            ← Go back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-surface text-white">
      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <header className="h-12 flex items-center px-4 border-b border-border bg-panel shrink-0 gap-4">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-muted hover:text-white transition-colors text-sm"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>
        <span className="text-white font-medium">Dependency Graph</span>
        <button
          onClick={loadGraph}
          className="ml-auto flex items-center gap-1 text-muted hover:text-white transition-colors text-xs"
          title="Reload graph"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Reload
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Left sidebar — stats & legend ──────────────────────────────────── */}
        <aside className="w-52 border-r border-border bg-panel shrink-0 overflow-y-auto p-3 flex flex-col gap-4">
          {stats && (
            <section>
              <p className="text-xs text-muted uppercase tracking-wider mb-2">Stats</p>
              <StatRow label="Files"       value={stats.files} />
              <StatRow label="Packages"    value={stats.packages} />
              <StatRow label="Edges"       value={stats.edges} />
              <StatRow label="Unresolved"  value={stats.unresolved} warn={stats.unresolved > 0} />
              <StatRow label="Cycles"      value={stats.cycles}     warn={stats.cycles > 0} />
              <StatRow label="Isolated"    value={stats.isolated} />
            </section>
          )}

          <section>
            <p className="text-xs text-muted uppercase tracking-wider mb-2">Legend</p>
            <LegendItem color={FILE_NODE_COLOR}    label="Source file"      shape="square" />
            <LegendItem color={PKG_NODE_COLOR}     label="External package" shape="pill" />
            <LegendItem color={SELECTED_COLOR}     label="Selected"         shape="square" />
          </section>

          {graph?.isolatedFiles?.length > 0 && (
            <section>
              <p className="text-xs text-muted uppercase tracking-wider mb-2">Isolated files</p>
              {graph.isolatedFiles.map(f => (
                <p key={f} className="text-xs text-muted truncate" title={f}>{f.split('/').pop()}</p>
              ))}
            </section>
          )}

          {graph?.cycles?.length > 0 && (
            <section>
              <p className="text-xs text-warning uppercase tracking-wider mb-2">
                ⚠ Cycles ({graph.cycles.length})
              </p>
              {graph.cycles.map((cycle, i) => (
                <p key={i} className="text-xs text-muted mb-1 truncate" title={cycle.join(' → ')}>
                  {cycle.map(f => f.split('/').pop()).join(' → ')}
                </p>
              ))}
            </section>
          )}
        </aside>

        {/* ── Graph canvas ──────────────────────────────────────────────────── */}
        <main className="flex-1 relative" style={{ background: '#0d1117' }}>
          {nodes.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center text-muted text-sm">
              No dependency data available for this repository.
            </div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              minZoom={0.1}
              maxZoom={3}
              attributionPosition="bottom-right"
            >
              <Background color="#30363d" gap={24} size={1} />
              <Controls
                style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 6 }}
              />
              <MiniMap
                nodeColor={n => n.data?.nodeType === 'package' ? PKG_NODE_COLOR : FILE_NODE_COLOR}
                maskColor="rgba(13,17,23,0.8)"
                style={{ background: '#161b22', border: '1px solid #30363d' }}
              />
            </ReactFlow>
          )}
        </main>

        {/* ── Right panel — file detail ─────────────────────────────────────── */}
        <aside className="w-72 border-l border-border bg-panel shrink-0 overflow-y-auto p-3">
          {!selected && (
            <p className="text-xs text-muted mt-4 text-center">
              Click a node to inspect its dependencies
            </p>
          )}

          {selected && infoLoading && (
            <div className="flex items-center gap-2 mt-4 justify-center">
              <Loader2 className="w-4 h-4 text-accent animate-spin" />
              <span className="text-xs text-muted">Loading…</span>
            </div>
          )}

          {selected && !infoLoading && fileInfo && (
            <FileDetailPanel info={fileInfo} repoId={repoId} />
          )}

          {selected && !infoLoading && !fileInfo && (
            /* Package node — show package name */
            <PackageDetailPanel nodeId={selected} graph={graph} />
          )}
        </aside>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatRow({ label, value, warn = false }) {
  return (
    <div className="flex justify-between items-center py-0.5">
      <span className="text-xs text-muted">{label}</span>
      <span className={`text-xs font-mono ${warn && value > 0 ? 'text-warning' : 'text-white'}`}>
        {value}
      </span>
    </div>
  );
}

function LegendItem({ color, label, shape }) {
  return (
    <div className="flex items-center gap-2 mb-1">
      <span
        style={{
          display: 'inline-block',
          width: 12,
          height: 12,
          background: color,
          borderRadius: shape === 'pill' ? 6 : 2,
          flexShrink: 0,
        }}
      />
      <span className="text-xs text-muted">{label}</span>
    </div>
  );
}

function FileDetailPanel({ info, repoId }) {
  const explorerUrl = `/explore/${repoId}?path=${encodeURIComponent(info.filePath)}`;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-xs text-muted uppercase tracking-wider mb-1">File</p>
        <p className="text-xs text-white font-mono break-all mb-2">{info.filePath}</p>
        <Link 
          to={explorerUrl}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-accent/10 border border-accent/40 rounded text-xs text-accent hover:bg-accent/20 transition-colors"
        >
          <File className="w-3.5 h-3.5" />
          View in Explorer
        </Link>
      </div>

      <div className="flex gap-4">
        <Chip label={`${info.dependencyCount} deps`}  color="accent" />
        <Chip label={`${info.dependentCount} users`}  color="success" />
      </div>

      {info.dependencies.length > 0 && (
        <section>
          <p className="text-xs text-muted uppercase tracking-wider mb-1">
            Dependencies ({info.dependencyCount})
          </p>
          {info.dependencies.map((dep, i) => (
            <DepEntry key={i} dep={dep} repoId={repoId} />
          ))}
        </section>
      )}

      {info.dependents.length > 0 && (
        <section>
          <p className="text-xs text-muted uppercase tracking-wider mb-1">
            Used by ({info.dependentCount})
          </p>
          {info.dependents.map((dep, i) => (
            <DepEntry key={i} dep={dep} reverse repoId={repoId} />
          ))}
        </section>
      )}

      {info.externalPackages.length > 0 && (
        <section>
          <p className="text-xs text-muted uppercase tracking-wider mb-1">
            External packages
          </p>
          {info.externalPackages.map(pkg => (
            <div key={pkg} className="flex items-center gap-1.5 py-0.5">
              <Package className="w-3 h-3 text-warning shrink-0" />
              <span className="text-xs text-white font-mono truncate">{pkg}</span>
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
    // Find who imports this package
    const users = graph.edges
      .filter(e => e.target === nodeId)
      .map(e => {
        const src = graph.nodes.find(n => n.id === e.source);
        return src?.filePath ?? e.source;
      });

    return (
      <div className="flex flex-col gap-3">
        <div>
          <p className="text-xs text-muted uppercase tracking-wider mb-1">Package</p>
          <div className="flex items-center gap-1.5">
            <Package className="w-4 h-4 text-warning shrink-0" />
            <p className="text-xs text-white font-mono break-all">{node.name}</p>
          </div>
        </div>
        {users.length > 0 && (
          <section>
            <p className="text-xs text-muted uppercase tracking-wider mb-1">
              Imported by ({users.length})
            </p>
            {users.map((f, i) => (
              <div key={i} className="flex items-center gap-1.5 py-0.5">
                <File className="w-3 h-3 text-accent shrink-0" />
                <span className="text-xs text-white font-mono truncate" title={f}>
                  {f.split('/').pop()}
                </span>
              </div>
            ))}
          </section>
        )}
      </div>
    );
  }

  return null;
}

function DepEntry({ dep, reverse = false, repoId }) {
  const name  = dep.filePath ? dep.filePath.split('/').pop() : dep.package;
  const Icon  = dep.package ? Package : File;
  const color = dep.package ? 'text-warning' : 'text-accent';
  const badge = dep.edgeType === 'requires' ? 'cjs' : null;

  return (
    <div className="flex items-center gap-1.5 py-0.5 group">
      <Icon className={`w-3 h-3 ${color} shrink-0`} />
      <span className="text-xs text-white font-mono truncate flex-1" title={dep.filePath || dep.package}>
        {name}
      </span>
      {badge && (
        <span className="text-xs text-muted bg-surface rounded px-1">{badge}</span>
      )}
      {dep.filePath && (
        <Link
          to={`/explore/${repoId}?path=${encodeURIComponent(dep.filePath)}`}
          className="opacity-0 group-hover:opacity-100 text-xs text-accent hover:underline shrink-0"
          title={`View in Explorer`}
        >
          View
        </Link>
      )}
    </div>
  );
}

function Chip({ label, color }) {
  const cls = color === 'accent' ? 'text-accent border-accent/30' : 'text-success border-success/30';
  return (
    <span className={`text-xs border rounded px-1.5 py-0.5 ${cls}`}>
      {label}
    </span>
  );
}
