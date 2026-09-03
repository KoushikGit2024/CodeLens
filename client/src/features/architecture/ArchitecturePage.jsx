import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { RefreshCw, AlertCircle, Loader2, File, Box, Wrench, Layers, Cpu, Sparkles } from 'lucide-react';
import { ResizableLayout } from '../../shared/components/ResizableLayout';
import { repositoryApi } from '../../shared/api';
import AiResponse from '../../shared/components/ai/AiResponse';
import ContextBreadcrumbs from '../../shared/components/ContextBreadcrumbs';
import ReactFlow, { Background, Controls, MiniMap, MarkerType, Handle, Position } from 'reactflow';
import 'reactflow/dist/style.css';
import * as d3Force from 'd3-force';

// ── Layer color map ───────────────────────────────────────────────────────

const LAYER_COLORS = {
  Presentation: { bg: '#238636', border: '#2ea043' },
  API:          { bg: '#8957e5', border: '#a371f7' },
  Service:      { bg: '#1f6feb', border: '#388bfd' },
  Domain:       { bg: '#0096c7', border: '#22b8cf' },
  Data:         { bg: '#d29922', border: '#e3b341' },
  Config:       { bg: '#6e7681', border: '#8b949e' },
  External:     { bg: '#da3633', border: '#ff7b72' },
};
function layerColor(layer, isExternal) {
  if (isExternal) return LAYER_COLORS.External;
  return LAYER_COLORS[layer] || { bg: '#1f6feb', border: '#388bfd' };
}

// ── Custom Architecture Node ────────────────────────────────────────────

const ArchNode = ({ data }) => {
  const colors = layerColor(data.layer, data.isExternal);
  const isViolating = data.isViolating;
  const isFocused = data.isFocused;
  return (
    <div
      style={{
        width: data.isExternal ? 120 : 160,
        borderRadius: data.isExternal ? 16 : 8,
        border: isViolating ? '2px solid #ff7b72' : isFocused ? `2px solid ${colors.border}` : `1px solid ${colors.border}66`,
        background: isViolating ? '#3d1a1acc' : isFocused ? `${colors.bg}dd` : `${colors.bg}55`,
        backdropFilter: 'blur(6px)',
        boxShadow: isFocused ? `0 0 16px ${colors.border}66` : 'none',
        opacity: data.isFaded ? 0.15 : 1,
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} isConnectable={false} />
      <div style={{ padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 1 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={data.label}>
          {data.label}
        </div>
        {!data.isExternal && data.layer && (
          <div style={{ fontSize: 9, color: colors.border, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {data.layer}
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} isConnectable={false} />
    </div>
  );
};

const archNodeTypes = { archNode: ArchNode };

// ── Hybrid Radial + Golden Flower Layout ────────────────────────────────────
//
// Strategy:
//   1. Identify "core" nodes (components with ≥2 connections, or any internal component).
//   2. Run a d3-force simulation on core nodes so they spread organically in all directions.
//   3. For each core node, place its exclusive "leaf" nodes (external deps or single-connection
//      nodes) in a golden ratio Fibonacci spiral bloom centered on that parent.

function getHybridRadialLayout(nodes, rfEdges) {
  if (!nodes || nodes.length === 0) return nodes;

  // ── Physical node dimensions ──────────────────────────────────────────────
  const CORE_W = 160, CORE_H = 46;
  const LEAF_W = 120, LEAF_H = 40;
  const GOLDEN_ANGLE = 2.3999632327;

  // ── Base tuning constants (visually calibrated) ───────────────────────────
  // These are deliberately small — all actual spacing is MULTIPLIED by node weight,
  // so heavy (hub) nodes automatically get proportionally more room.
  const BASE_COLLISION  = 100;  // minimum exclusion radius for any core node (px)
  const BASE_LINK_DIST  = 260;  // minimum edge length between two core nodes (px)
  const BASE_CHARGE     = -700; // base repulsion strength
  const LEAF_INNER      = 95;   // distance from parent center to first leaf (px)
  const LEAF_SCALE_BASE = 48;   // golden spiral expansion at 1 leaf
  // Hub bonus: each core→core connection adds this many px to a node's weight
  const HUB_BONUS_PER_CONN = 35;

  // ── Build full degree map (all edges) ─────────────────────────────────────
  const degree = new Map();
  nodes.forEach(n => degree.set(n.id, 0));
  rfEdges.forEach(e => {
    degree.set(e.source, (degree.get(e.source) || 0) + 1);
    degree.set(e.target, (degree.get(e.target) || 0) + 1);
  });

  // ── Classify leaves vs core ───────────────────────────────────────────────
  // Leaf = external node with exactly 1 connection (it blooms around its parent)
  const leafIds = new Set();
  const leafParent = new Map();
  nodes.forEach(n => {
    if (n.data?.isExternal && (degree.get(n.id) || 0) <= 1) {
      const edge = rfEdges.find(e => e.source === n.id || e.target === n.id);
      if (edge) {
        const parentId = edge.source === n.id ? edge.target : edge.source;
        leafIds.add(n.id);
        leafParent.set(n.id, parentId);
      }
    }
  });

  const coreNodes = nodes.filter(n => !leafIds.has(n.id));
  const coreEdges = rfEdges.filter(e => !leafIds.has(e.source) && !leafIds.has(e.target));

  // ── Per-node leaf count ───────────────────────────────────────────────────
  const leafCountMap = new Map();
  coreNodes.forEach(n => leafCountMap.set(n.id, 0));
  leafIds.forEach(lid => {
    const pid = leafParent.get(lid);
    leafCountMap.set(pid, (leafCountMap.get(pid) || 0) + 1);
  });

  // ── Per-node core connection count ────────────────────────────────────────
  const coreConnMap = new Map();
  coreNodes.forEach(n => coreConnMap.set(n.id, 0));
  coreEdges.forEach(e => {
    coreConnMap.set(e.source, (coreConnMap.get(e.source) || 0) + 1);
    coreConnMap.set(e.target, (coreConnMap.get(e.target) || 0) + 1);
  });

  // ── nodeWeight: locally-computed "space budget" for each core node ─────────
  // = outer radius of its leaf bloom + hub bonus for its core connections
  // This is the key recursive/local calculation: each node declares how much
  // room it actually needs based on its own neighborhood.
  function leafBloomOuterRadius(nodeId) {
    const lc = leafCountMap.get(nodeId) || 0;
    if (lc === 0) return 0;
    // Use a LEAF_SCALE that gently grows with leaf count so large fans spread more
    const leafScale = LEAF_SCALE_BASE + Math.sqrt(lc) * 4;
    return LEAF_INNER + leafScale * Math.sqrt(lc) + LEAF_W * 0.5;
  }
  function nodeWeight(nodeId) {
    const bloomR = leafBloomOuterRadius(nodeId);
    const hubBonus = (coreConnMap.get(nodeId) || 0) * HUB_BONUS_PER_CONN;
    // Clamp minimum to BASE_COLLISION so isolated nodes still have personal space
    return Math.max(BASE_COLLISION, bloomR + hubBonus);
  }

  // Per-link distance = sum of both endpoint weights → local, adaptive
  function linkDist(link) {
    const sid = typeof link.source === 'object' ? link.source.id : link.source;
    const tid = typeof link.target === 'object' ? link.target.id : link.target;
    return Math.max(BASE_LINK_DIST, nodeWeight(sid) + nodeWeight(tid));
  }

  // Per-node charge: hub nodes push neighbors harder
  function nodeCharge(simNode) {
    const lc = leafCountMap.get(simNode.id) || 0;
    const cc = coreConnMap.get(simNode.id) || 0;
    // Scale charge with leaf count (bloom size) and core connections
    return BASE_CHARGE * (1 + lc * 0.25 + cc * 0.15);
  }

  // Seed radius derived from the average node weight so initial placement
  // already respects the graph's overall scale — no arbitrary fixed number
  const avgWeight = coreNodes.reduce((sum, n) => sum + nodeWeight(n.id), 0)
    / Math.max(coreNodes.length, 1);
  const seedRadius = Math.max(180, avgWeight * 1.4);

  // ── Step A: d3-force simulation for core nodes ────────────────────────────
  const simNodes = coreNodes.map((n, i) => {
    const theta = (i / Math.max(coreNodes.length, 1)) * 2 * Math.PI;
    return { id: n.id, x: seedRadius * Math.cos(theta), y: seedRadius * Math.sin(theta) };
  });
  const simLinks = coreEdges.map(e => ({ source: e.source, target: e.target }));

  const simulation = d3Force.forceSimulation(simNodes)
    .force('charge',    d3Force.forceManyBody().strength(d => nodeCharge(d)))
    .force('link',      d3Force.forceLink(simLinks).id(d => d.id).distance(linkDist).strength(0.45))
    .force('collision', d3Force.forceCollide(d => nodeWeight(d.id) * 0.75).strength(0.9))
    .force('center',    d3Force.forceCenter(0, 0))
    .stop();

  // 400 ticks is enough for graphs up to ~50 core nodes to settle cleanly
  for (let i = 0; i < 400; i++) simulation.tick();

  // Write positions to ReactFlow nodes
  const posMap = new Map();
  simNodes.forEach(sn => posMap.set(sn.id, { x: sn.x, y: sn.y }));
  coreNodes.forEach(n => {
    const pos = posMap.get(n.id) || { x: 0, y: 0 };
    n.position = { x: pos.x - CORE_W / 2, y: pos.y - CORE_H / 2 };
  });

  // ── Step B: Golden ratio flower for leaf nodes ────────────────────────────
  const leafGroups = new Map();
  leafIds.forEach(lid => {
    const pid = leafParent.get(lid);
    if (!leafGroups.has(pid)) leafGroups.set(pid, []);
    const leafNode = nodes.find(n => n.id === lid);
    if (leafNode) leafGroups.get(pid).push(leafNode);
  });

  leafGroups.forEach((leaves, parentId) => {
    const parentPos = posMap.get(parentId) || { x: 0, y: 0 };
    const lc = leaves.length;
    // Scale the spiral gently with local leaf count: more leaves → looser flower
    const leafScale = LEAF_SCALE_BASE + Math.sqrt(lc) * 4;
    leaves.forEach((leaf, i) => {
      const idx = i + 1;
      const theta  = idx * GOLDEN_ANGLE;
      const radius = LEAF_INNER + leafScale * Math.sqrt(idx);
      leaf.position = {
        x: parentPos.x + radius * Math.cos(theta) - LEAF_W / 2,
        y: parentPos.y + radius * Math.sin(theta) - LEAF_H / 2,
      };
    });
  });

  return nodes;
}

function graphToFlow(components, relations, selectedId, violations) {
  const violatingNames = new Set();
  violations.forEach(v => { violatingNames.add(v.sourceComponent); violatingNames.add(v.targetComponent); });

  const connectedNodes = new Set();
  if (selectedId) {
    connectedNodes.add(selectedId);
    relations.forEach(r => {
      if (r.source === selectedId) connectedNodes.add(r.target);
      if (r.target === selectedId) connectedNodes.add(r.source);
    });
  }

  let rfNodes = components.map(c => ({
    id: c.name,
    type: 'archNode',
    data: {
      label: c.name,
      layer: c.layer,
      isExternal: false,
      isViolating: violatingNames.has(c.name),
      isFocused: c.name === selectedId,
      isFaded: selectedId ? !connectedNodes.has(c.name) : false,
    },
    position: { x: 0, y: 0 },
    zIndex: 2,
  }));

  // External targets
  relations.forEach(r => {
    if (r.targetType === 'external' && !rfNodes.find(n => n.id === r.target)) {
      rfNodes.push({
        id: r.target,
        type: 'archNode',
        data: { 
          label: r.target, 
          layer: null, 
          isExternal: true, 
          isViolating: false,
          isFocused: r.target === selectedId,
          isFaded: selectedId ? !connectedNodes.has(r.target) : false,
        },
        position: { x: 0, y: 0 },
        zIndex: 2,
      });
    }
  });

  const rfEdges = relations.map(r => {
    const isViolating = violations.some(v => v.sourceComponent === r.source && v.targetComponent === r.target);
    const isFocused = selectedId && (r.source === selectedId || r.target === selectedId);
    const isFaded = selectedId && !isFocused;

    return {
      id: `${r.source}->${r.target}`,
      source: r.source,
      target: r.target,
      type: 'straight', // Straight edges look best for radial hubs
      animated: isViolating || isFocused,
      style: { 
        stroke: isViolating ? '#ff7b72' : isFocused ? '#58a6ff' : '#30363dbb', 
        strokeWidth: isViolating || isFocused ? 2 : 1,
        opacity: isFaded ? 0.15 : 1
      },
      markerEnd: { 
        type: MarkerType.ArrowClosed, 
        color: isViolating ? '#ff7b72' : isFocused ? '#58a6ff' : '#30363dbb', 
        width: isFocused || isViolating ? 12 : 10, 
        height: isFocused || isViolating ? 12 : 10 
      },
      label: r.type || undefined,
      labelStyle: { fill: '#8b949e', fontSize: 8, fontFamily: 'monospace' },
      labelBgStyle: { fill: '#0d1117', fillOpacity: 0.8 },
      zIndex: isFocused || isViolating ? 1 : 0,
    };
  });

  return { rfNodes: getHybridRadialLayout(rfNodes, rfEdges), rfEdges };
}

export default function ArchitecturePage() {
  const { repoId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [selectedComponent, setSelectedComponent] = useState(null);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [aiError, setAiError] = useState(null);

  const loadArchitecture = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await repositoryApi.getArchitecture(repoId);
      setData(res.data);
    } catch (err) {
      setError(err?.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateAi = async () => {
    setIsGeneratingAi(true);
    setAiError(null);
    try {
      const res = await repositoryApi.getArchitecture(repoId, { generateAi: true });
      setData(prev => ({ ...prev, insights: res.data.insights }));
    } catch (err) {
      setAiError(err?.response?.data?.error || err.message || 'Failed to generate AI insights.');
    } finally {
      setIsGeneratingAi(false);
    }
  };

  useEffect(() => {
    loadArchitecture();
  }, [repoId]);

  const { rfNodes, rfEdges } = useMemo(() => {
    if (!data?.model) return { rfNodes: [], rfEdges: [] };
    
    return graphToFlow(
      data.model.components, 
      data.model.relations || [], 
      selectedComponent, 
      data.model.violations || []
    );
  }, [data, selectedComponent]);

  const onNodeClick = useCallback((_, node) => {
    setSelectedComponent(node.id);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center gap-3 bg-surface text-white">
        <Loader2 className="w-5 h-5 text-accent animate-spin" />
        <span className="text-muted text-sm">Analyzing architecture...</span>
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

  return (
    <ResizableLayout
      panels={[
        {
          id: 'data',
          defaultSize: 20,
          minWidth: 200,
          collapsible: true,
          collapseDirection: 'left',
          title: 'Controls',
          icon: <Layers />,
          content: (
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6 custom-scrollbar bg-panel h-full">
              <section>
                 <div className="bg-surface/50 p-3 rounded border border-border/50 flex flex-col gap-2 mb-4">
                   <div className="flex items-center justify-between">
                     <span className="text-xs text-muted flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5"/> Security & Health</span>
                     <Link to={`/explore/${repoId}/health`} className="text-[10px] text-accent hover:underline">View Health</Link>
                   </div>
                   <div className="flex items-center justify-between">
                     <span className="text-xs text-muted flex items-center gap-1.5"><Wrench className="w-3.5 h-3.5"/> Refactoring</span>
                     <Link to={`/explore/${repoId}/refactoring`} className="text-[10px] text-accent hover:underline">View Refactoring</Link>
                   </div>
                 </div>

                {data?.model?.violations?.length > 0 && (
                  <section className="mb-4">
                    <p className="text-xs text-danger uppercase tracking-wider mb-3 flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5" /> Rule Violations ({data.model.violations.length})
                    </p>
                    <div className="flex flex-col gap-2">
                      {data.model.violations.map((v, i) => (
                        <div key={i} className="bg-danger/10 border border-danger/30 p-2 rounded flex flex-col gap-1 cursor-pointer hover:bg-danger/20 transition-colors" onClick={() => setSelectedComponent(v.sourceComponent)}>
                          <span className="text-[11px] font-semibold text-danger">{v.name}</span>
                          <span className="text-[10px] text-white/80">{v.sourceComponent} → {v.targetComponent}</span>
                          <span className="text-[10px] text-muted italic line-clamp-2" title={v.description}>{v.description}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
                <p className="text-xs text-muted uppercase tracking-wider mb-3">Entry Points</p>
                {data?.model?.entryPoints?.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {data.model.entryPoints.map((ep, i) => (
                      <div key={i} className="flex items-center gap-2 group min-w-0">
                        <File className="w-4 h-4 text-accent shrink-0" />
                        <span className="text-xs font-mono truncate flex-1 text-white" title={ep}>{ep}</span>
                        <Link 
                          to={`/explore/${repoId}/source?path=${encodeURIComponent(ep)}`}
                          className="opacity-0 group-hover:opacity-100 text-xs text-accent hover:underline"
                        >
                          View
                        </Link>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-muted">No explicit entry points found.</span>
                )}
              </section>

              <section>
                <p className="text-xs text-muted uppercase tracking-wider mb-3">Detected Components</p>
                {data?.model?.components?.length > 0 ? (
                  <div className="flex flex-col gap-4">
                    {data.model.components
                      .filter(c => selectedComponent ? c.name === selectedComponent : true)
                      .map((comp, i) => (
                      <div key={i}>
                        <div className="flex justify-between items-center mb-1.5">
                          <span className="text-sm font-medium flex items-center gap-1.5">
                            <Box className="w-4 h-4 text-warning" />
                            {comp.name}
                          </span>
                          <span className="text-[10px] uppercase text-muted bg-surface px-1.5 py-0.5 rounded border border-border/50">
                            {comp.layer}
                          </span>
                        </div>
                        <div className="pl-6 border-l-2 border-border/30 ml-1.5 flex flex-col gap-1">
                          {comp.files.map((file, j) => (
                            <div key={j} className="flex items-center justify-between group min-w-0">
                              <span className="text-[11px] text-muted font-mono truncate" title={file}>
                                {file.split('/').pop()}
                              </span>
                              <Link 
                                to={`/explore/${repoId}/source?path=${encodeURIComponent(file)}`}
                                className="opacity-0 group-hover:opacity-100 text-[10px] text-accent hover:underline ml-2"
                              >
                                View
                              </Link>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-muted">No components detected.</span>
                )}
              </section>
            </div>
          )
        },
        {
          id: 'diagram',
          defaultSize: 55,
          minWidth: 300,
          collapsible: false,
          content: (
            <main className="flex-1 overflow-auto bg-[#0d1117] relative flex justify-center custom-scrollbar h-full w-full">
              <ContextBreadcrumbs 
                domain="Architecture" 
                activeNode={selectedComponent} 
                onClear={() => setSelectedComponent(null)} 
              />
              {rfNodes.length > 0 ? (
                <ReactFlow
                  nodes={rfNodes}
                  edges={rfEdges}
                  nodeTypes={archNodeTypes}
                  onNodeClick={onNodeClick}
                  onPaneClick={() => setSelectedComponent(null)}
                  fitView
                  fitViewOptions={{ padding: 0.2 }}
                  minZoom={0.1}
                  maxZoom={2}
                  elementsSelectable={false}
                  elevateEdgesOnSelect={false}
                  nodesConnectable={false}
                  proOptions={{ hideAttribution: true }}
                  className="bg-transparent"
                >
                  <Background color="#21262d" gap={20} size={1} variant="dots" />
                  <Controls position="bottom-right" className="bg-panel border-border" />
                  <MiniMap
                    position="top-right"
                    nodeColor={n => {
                      const c = layerColor(n.data?.layer, n.data?.isExternal);
                      return c.bg;
                    }}
                    maskColor="rgba(13,17,23,0.75)"
                    className="bg-[#0d1117] border border-border"
                  />

                  {/* Layer legend */}
                  <div
                    style={{
                      position: 'absolute', bottom: 12, left: 12, zIndex: 10,
                      background: '#161b22ee', border: '1px solid #30363d',
                      borderRadius: 8, padding: '8px 12px',
                    }}
                  >
                    <div style={{ fontSize: 9, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Layers</div>
                    {Object.entries(LAYER_COLORS).filter(([k]) => k !== 'External').map(([layer, { bg, border }]) => (
                      <div key={layer} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: bg, border: `1px solid ${border}`, display: 'inline-block', flexShrink: 0 }} />
                        <span style={{ fontSize: 10, color: '#c9d1d9' }}>{layer}</span>
                      </div>
                    ))}
                  </div>
                </ReactFlow>
              ) : (
                <div className="flex items-center justify-center h-full text-muted text-sm">
                  No architecture components detected.
                </div>
              )}
            </main>
          )
        },
        {
          id: 'insights',
          defaultSize: 25,
          minWidth: 200,
          collapsible: true,
          collapseDirection: 'right',
          title: 'AI Insights',
          icon: <Sparkles />,
          content: (
            <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4 custom-scrollbar bg-panel h-full">
              <p className="text-xs text-muted uppercase tracking-wider mb-2">AI Architectural Insights</p>
              
              {data?.insights ? (
                <AiResponse data={data.insights} title={null} repoId={repoId} chatId={`architecture-${repoId}`} />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center p-6 border border-border/50 rounded-lg bg-surface/30">
                  <Cpu className="w-8 h-8 text-muted mb-4 opacity-50" />
                  <p className="text-sm text-muted mb-4">AI insights are not generated by default to save resources.</p>
                  <button 
                    onClick={handleGenerateAi}
                    disabled={isGeneratingAi}
                    className="flex items-center gap-2 px-4 py-2 bg-accent/10 hover:bg-accent/20 text-accent rounded transition-colors text-sm font-medium disabled:opacity-50"
                  >
                    {isGeneratingAi ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    {isGeneratingAi ? 'Analyzing...' : 'Generate AI Insights'}
                  </button>
                  {aiError && (
                    <div className="mt-4 p-3 bg-danger/10 border border-danger/20 rounded text-danger text-xs text-left flex items-start gap-2 w-full">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span className="flex-1">{aiError}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        }
      ]}
    />
  );
}
