import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  RefreshCw,
  AlertCircle,
  Loader2,
  File,
  Box,
  Wrench,
  Layers,
  Cpu,
  Sparkles,
  GitBranch,
  ChevronDown,
  ChevronRight,
  X,
} from 'lucide-react';
import { ResizableLayout } from '../../shared/components/ResizableLayout';
import { repositoryApi } from '../../shared/api';
import AiResponse from '../../shared/components/ai/AiResponse';
import ContextBreadcrumbs from '../../shared/components/ContextBreadcrumbs';
import { useToast } from '../../shared/context/ToastContext';
import { useAIState } from '../../shared/context/AIContext';
import { useRepository } from '../../shared/context/RepositoryContext';
import ReactFlow, { Background, Controls, MiniMap, MarkerType, Handle, Position } from 'reactflow';
import 'reactflow/dist/style.css';
import * as d3Force from 'd3-force';
import MermaidViewer from './MermaidViewer';
import { toMermaid } from '../../services/analyzer/advanced/mermaid.transformer';
import OpenSourceButton from '../../shared/components/OpenSourceButton';
import { tryMakeSourceRef } from '../../shared/navigation/sourceRef';
import { ExportDiagramButton } from '../../shared/components/ExportDiagramButton';
import { useTheme } from '../../shared/context/ThemeContext';

// ── Layer color map ───────────────────────────────────────────────────────

const LAYER_COLORS = {
  Presentation: { bg: '#238636', border: '#2ea043' },
  API: { bg: '#8957e5', border: '#a371f7' },
  Service: { bg: '#1f6feb', border: '#388bfd' },
  Domain: { bg: '#0096c7', border: '#22b8cf' },
  Data: { bg: '#d29922', border: '#e3b341' },
  Config: { bg: '#6e7681', border: '#8b949e' },
  External: { bg: '#da3633', border: '#ff7b72' },
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
        border: isViolating
          ? '2px solid #ff7b72'
          : isFocused
            ? `2px solid ${colors.border}`
            : `1px solid ${colors.border}66`,
        background: isViolating ? '#3d1a1acc' : isFocused ? `${colors.bg}dd` : `${colors.bg}55`,
        boxShadow: isFocused ? `0 0 16px ${colors.border}66` : 'none',
        opacity: data.isFaded ? 0.15 : 1,
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} isConnectable={false} />
      <div style={{ padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 1 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: '#CBD5E8',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          title={data.label}
        >
          {data.label}
        </div>
        {!data.isExternal && data.layer && (
          <div
            style={{
              fontSize: 9,
              color: colors.border,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {data.layer}
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} isConnectable={false} />
      {isViolating && (
        <div
          style={{
            position: 'absolute',
            top: -3,
            right: -3,
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: '#e05252',
            boxShadow: '0 0 0 2px #0C0E14',
          }}
          title="Rule Violation"
        />
      )}
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
  const CORE_W = 160,
    CORE_H = 46;
  const LEAF_W = 120,
    LEAF_H = 40;
  const GOLDEN_ANGLE = 2.3999632327;

  // ── Base tuning constants (visually calibrated) ───────────────────────────
  // These are deliberately small — all actual spacing is MULTIPLIED by node weight,
  // so heavy (hub) nodes automatically get proportionally more room.
  const BASE_COLLISION = 100; // minimum exclusion radius for any core node (px)
  const BASE_LINK_DIST = 260; // minimum edge length between two core nodes (px)
  const BASE_CHARGE = -700; // base repulsion strength
  const LEAF_INNER = 95; // distance from parent center to first leaf (px)
  const LEAF_SCALE_BASE = 48; // golden spiral expansion at 1 leaf
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
  const avgWeight = coreNodes.reduce((sum, n) => sum + nodeWeight(n.id), 0) / Math.max(coreNodes.length, 1);
  const seedRadius = Math.max(180, avgWeight * 1.4);

  // ── Step A: d3-force simulation for core nodes ────────────────────────────
  const simNodes = coreNodes.map((n, i) => {
    const theta = (i / Math.max(coreNodes.length, 1)) * 2 * Math.PI;
    return { id: n.id, x: seedRadius * Math.cos(theta), y: seedRadius * Math.sin(theta) };
  });
  const simLinks = coreEdges.map(e => ({ source: e.source, target: e.target }));

  const simulation = d3Force
    .forceSimulation(simNodes)
    .force(
      'charge',
      d3Force.forceManyBody().strength(d => nodeCharge(d))
    )
    .force(
      'link',
      d3Force
        .forceLink(simLinks)
        .id(d => d.id)
        .distance(linkDist)
        .strength(0.45)
    )
    .force('collision', d3Force.forceCollide(d => nodeWeight(d.id) * 0.75).strength(0.9))
    .force('center', d3Force.forceCenter(0, 0))
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
      const theta = idx * GOLDEN_ANGLE;
      const radius = LEAF_INNER + leafScale * Math.sqrt(idx);
      leaf.position = {
        x: parentPos.x + radius * Math.cos(theta) - LEAF_W / 2,
        y: parentPos.y + radius * Math.sin(theta) - LEAF_H / 2,
      };
    });
  });

  return nodes;
}

function graphToFlow(components = [], relations = [], selectedId, violations = []) {
  const violatingNames = new Set();
  violations.forEach(v => {
    violatingNames.add(v.sourceComponent);
    violatingNames.add(v.targetComponent);
  });

  const connectedNodes = new Set();
  if (selectedId) {
    connectedNodes.add(selectedId);
    relations.forEach(r => {
      if (r.source === selectedId) connectedNodes.add(r.target);
      if (r.target === selectedId) connectedNodes.add(r.source);
    });
  }

  let rfNodes = components.map(c => {
    const label = c.data?.label ?? c.id;
    const layer = c.data?.layer ?? c.layer;
    const isViolating = violatingNames.has(label);
    const colors = layerColor(layer, false);
    return {
      id: label,
      type: 'archNode',
      data: {
        label,
        layer,
        isExternal: false,
        isViolating,
        isFocused: label === selectedId,
        isFaded: selectedId ? !connectedNodes.has(label) : false,
        health: c.health,
        exportBg: isViolating ? '#3d1a1a' : `${colors.bg}dd`,
        exportBorder: isViolating ? '#ff7b72' : colors.border,
        exportText: '#CBD5E8',
      },
      position: { x: 0, y: 0 },
      zIndex: 2,
    };
  });

  // External targets
  relations.forEach(r => {
    if (r.targetType === 'external' && !rfNodes.find(n => n.id === r.target)) {
      const colors = layerColor(null, true);
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
          exportBg: `${colors.bg}dd`,
          exportBorder: colors.border,
          exportText: '#CBD5E8',
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
        stroke: isViolating ? '#e05252' : isFocused ? '#4D7EFF' : '#1D2130cc',
        strokeWidth: isViolating || isFocused ? 2 : 1,
        opacity: isFaded ? 0.15 : 1,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: isViolating ? '#e05252' : isFocused ? '#4D7EFF' : '#1D2130cc',
        width: isFocused || isViolating ? 12 : 10,
        height: isFocused || isViolating ? 12 : 10,
      },
      label: r.type || undefined,
      labelStyle: { fill: '#6B7A99', fontSize: 8, fontFamily: 'monospace' },
      labelBgStyle: { fill: '#0C0E14', fillOpacity: 0.8 },
      zIndex: isFocused || isViolating ? 1 : 0,
    };
  });

  return { rfNodes: getHybridRadialLayout(rfNodes, rfEdges), rfEdges };
}

export default function ArchitecturePage() {
  const { theme } = useTheme();
  const isLight = theme?.id?.includes('light');
  const { repoId } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { aiState } = useAIState();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [selectedComponent, setSelectedComponent] = useState(null);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const { repo, livePhase } = useRepository();
  const isGloballyAnalyzing = !!livePhase || repo?.status === 'analyzing';
  const [aiError, setAiError] = useState(null);
  const [expandedComponents, setExpandedComponents] = useState(new Set());

  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false);
  const [mobileInsightsOpen, setMobileInsightsOpen] = useState(false);
  const [viewMode, setViewMode] = useState('interactive');
  const diagramRef = useRef(null);

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
    if (aiState.authState === 'unauthenticated') {
      navigate('/auth/signin');
      return;
    }
    setIsGeneratingAi(true);
    setAiError(null);
    try {
      const res = await repositoryApi.getArchitecture(repoId, { generateAi: true });
      setData(prev => ({ ...prev, insights: res.data.insights }));
      addToast({
        title: 'Insights Generated',
        description: 'Architecture insights have been successfully generated.',
        type: 'success',
      });
    } catch (err) {
      setAiError(err?.response?.data?.error || err.message || 'Failed to generate AI insights.');
      addToast({
        title: 'Generation Failed',
        description: err.message || 'Failed to generate AI insights.',
        type: 'error',
      });
    } finally {
      setIsGeneratingAi(false);
    }
  };

  useEffect(() => {
    loadArchitecture();
  }, [repoId]);

  const { rfNodes, rfEdges, mermaidStr } = useMemo(() => {
    if (!data?.model) return { rfNodes: [], rfEdges: [], mermaidStr: '' };

    const flow = graphToFlow(
      data.model.components || [],
      data.model.relations || [],
      selectedComponent,
      data.model.violations || []
    );

    const mStr = toMermaid(data.model);

    return { ...flow, mermaidStr: mStr };
  }, [data, selectedComponent]);

  const onNodeClick = useCallback(
    (_, node) => {
      setSelectedComponent(node.id);
      if (isMobile) setMobileControlsOpen(true);
    },
    [isMobile]
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center gap-3 bg-surface text-text">
        <Loader2 className="w-5 h-5 text-accent animate-spin" />
        <span className="text-muted text-sm">Analyzing architecture...</span>
      </div>
    );
  }

  if (error) {
    const isNotReady = error.toLowerCase().includes('not ready') || error.toLowerCase().includes('pending');

    const handleReanalyze = async () => {
      setIsReanalyzing(true);
      try {
        await repositoryApi.reanalyze(repoId);
        navigate(`/explore/${repoId}`);
      } catch (err) {
        addToast({
          title: 'Reanalysis Failed',
          description: err.message || 'An error occurred while trying to reanalyze.',
          type: 'error',
        });
        setIsReanalyzing(false);
      }
    };

    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center p-8 bg-surface rounded-lg shadow border border-text/10 max-w-md w-full">
          <AlertCircle className="w-10 h-10 text-danger mx-auto mb-4 opacity-80" />
          <h2 className="text-lg font-medium text-text mb-2">Analysis Error</h2>
          <p className="text-muted mb-6 text-sm leading-relaxed">{error}</p>

          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="px-4 py-2 text-sm text-text bg-panel hover:bg-text/5 border border-border rounded-lg transition-colors"
            >
              Go Back
            </button>
            <button
              onClick={handleReanalyze}
              disabled={isReanalyzing || isGloballyAnalyzing}
              className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-text rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {(isReanalyzing || isGloballyAnalyzing) ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Starting...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" /> Re-analyze Repo
                </>
              )}
            </button>

          </div>
        </div>
      </div>
    );
  }

  const layoutPanels = [
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
            <div className="flex flex-col gap-2 mb-4 pb-4 border-b border-text/5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" /> Security & Health
                </span>
                <Link to={`/explore/${repoId}/health`} className="text-[10px] text-accent hover:underline">
                  View Health
                </Link>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted flex items-center gap-1.5">
                  <Wrench className="w-3.5 h-3.5" /> Refactoring
                </span>
                <Link to={`/explore/${repoId}/refactoring`} className="text-[10px] text-accent hover:underline">
                  View Refactoring
                </Link>
              </div>
            </div>

            {!selectedComponent ? (
              <div className="text-center p-4 border border-dashed border-text/5 rounded-lg">
                <Box className="w-8 h-8 text-muted mx-auto mb-2 opacity-50" />
                <p className="text-xs text-muted">
                  Click a component in the graph to view its details and specific violations.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {/* Component Info */}
                <div className="pb-3 border-b border-text/5">
                  <p className="text-xs text-muted uppercase tracking-wider mb-2">Component Details</p>
                  <div className="flex items-center gap-2 mb-2">
                    <Box className="w-4 h-4 text-accent" />
                    <span className="text-sm font-semibold text-text truncate" title={selectedComponent}>
                      {selectedComponent}
                    </span>
                  </div>

                  {(() => {
                    const compData = data?.model?.components?.find(c => (c.data?.label ?? c.id) === selectedComponent);
                    if (!compData) return null;
                    const compLabel = compData.data?.label ?? compData.id;
                    const compLayer = compData.data?.layer ?? compData.layer;
                    const compHealth = compData.health;

                    const getSeverityColor = severity => {
                      switch (severity) {
                        case 'critical':
                          return 'text-danger border-danger/30 bg-danger/10';
                        case 'high':
                          return 'text-warning border-warning/30 bg-warning/10';
                        case 'warning':
                          return 'text-amber-400 border-amber-400/30 bg-amber-400/10';
                        default:
                          return 'text-success border-success/30 bg-success/10';
                      }
                    };

                    return (
                      <div className="flex flex-col gap-1.5 mt-3">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-muted">Layer</span>
                          <span className="text-xs font-mono" style={{ color: layerColor(compLayer, false).border }}>
                            {compLayer}
                          </span>
                        </div>

                        {compHealth && (
                          <div className="flex justify-between items-start mt-2 pt-2 border-t border-text/5">
                            <span className="text-xs text-muted">Health</span>
                            <div className="flex flex-col items-end gap-1">
                              <span
                                className={`border rounded px-1.5 py-0.5 text-[10px] font-medium capitalize flex items-center gap-1 ${getSeverityColor(compHealth.severity)}`}
                              >
                                {compHealth.severity !== 'healthy' ? (
                                  <AlertCircle className="w-3 h-3" />
                                ) : (
                                  <GitBranch className="w-3 h-3" />
                                )}
                                {compHealth.severity}
                              </span>
                              {compHealth.risks?.length > 0 && (
                                <span className="text-[10px] text-muted">{compHealth.risks.length} Risk(s)</span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Node Specific Violations */}
                {(() => {
                  const nodeViolations = (data?.model?.violations || []).filter(
                    v => v.sourceComponent === selectedComponent || v.targetComponent === selectedComponent
                  );

                  if (nodeViolations.length === 0) {
                    return (
                      <div className="bg-success/10 border border-success/30 p-3 rounded flex items-center gap-2 mb-2">
                        <AlertCircle className="w-4 h-4 text-success" />
                        <span className="text-xs text-success">No architecture violations</span>
                      </div>
                    );
                  }

                  return (
                    <div className="flex flex-col gap-2">
                      <p className="text-xs text-danger uppercase tracking-wider mb-1 flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5" /> Violations ({nodeViolations.length})
                      </p>
                      {nodeViolations.map((v, i) => (
                        <div key={i} className="bg-danger/10 border border-danger/30 p-2 rounded flex flex-col gap-1">
                          <span className="text-[11px] font-semibold text-danger">{v.name}</span>
                          <span className="text-[10px] text-text/80">
                            {v.sourceComponent} → {v.targetComponent}
                          </span>
                          <span className="text-[10px] text-muted italic line-clamp-2" title={v.description}>
                            {v.description}
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}
            <p className="text-xs text-muted uppercase tracking-wider mb-3">Entry Points</p>
            {data?.model?.entryPoints?.length > 0 ? (
              <div className="flex flex-col gap-2">
                {data.model.entryPoints.map((ep, i) => {
                  const epRef = tryMakeSourceRef({ filePath: ep });
                  return (
                    <div key={i} className="flex items-center gap-2 group min-w-0">
                      {epRef ? (
                        <OpenSourceButton ref={epRef} className="flex-1 truncate" />
                      ) : (
                        <>
                          <File className="w-4 h-4 text-accent shrink-0" />
                          <span className="text-xs font-mono truncate flex-1 text-text" title={ep}>
                            {ep}
                          </span>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <span className="text-xs text-muted">No explicit entry points found.</span>
            )}
          </section>

          <section>
            <p className="text-xs text-muted uppercase tracking-wider mb-3">Detected Components</p>
            {data?.model?.components?.length > 0 ? (
              <div className="flex flex-col gap-1">
                {data.model.components
                  .filter(c => (selectedComponent ? (c.data?.label ?? c.id) === selectedComponent : true))
                  .map((comp, i) => {
                    const compLabel = comp.data?.label ?? comp.id;
                    const compLayer = comp.data?.layer ?? comp.layer;
                    const compFiles = comp.data?.files || [];
                    const isExpanded = expandedComponents.has(compLabel);
                    const toggle = () =>
                      setExpandedComponents(prev => {
                        const next = new Set(prev);
                        if (next.has(compLabel)) next.delete(compLabel);
                        else next.add(compLabel);
                        return next;
                      });
                    return (
                      <div key={compLabel} className="rounded-md overflow-hidden border border-text/5">
                        {/* Header row — click to expand/collapse */}
                        <button
                          onClick={toggle}
                          className="w-full flex items-center justify-between px-2 py-1.5 hover:bg-text/5 transition-colors text-left"
                        >
                          <span className="flex items-center gap-1.5 min-w-0 flex-1">
                            {isExpanded ? (
                              <ChevronDown className="w-3.5 h-3.5 text-muted shrink-0" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5 text-muted shrink-0" />
                            )}
                            <Box className="w-3.5 h-3.5 text-warning shrink-0" />
                            <span className="text-xs font-medium truncate" title={compLabel}>
                              {compLabel}
                            </span>
                          </span>
                          <span
                            className="text-[9px] uppercase shrink-0 ml-2 px-1.5 py-0.5 rounded border"
                            style={{
                              color: layerColor(compLayer, false).border,
                              borderColor: layerColor(compLayer, false).border + '55',
                              background: layerColor(compLayer, false).bg + '22',
                            }}
                          >
                            {compLayer}
                          </span>
                        </button>

                        {/* File list — shown when expanded */}
                        {isExpanded && (
                          <div className="border-t border-text/5 flex flex-col">
                            {compFiles.length === 0 ? (
                              <span className="text-[10px] text-muted px-3 py-1.5 italic">No files</span>
                            ) : (
                              compFiles.map((file, j) => {
                                const fileRef = tryMakeSourceRef({ filePath: file });
                                return (
                                  <div
                                    key={j}
                                    className="flex items-center justify-between gap-2 px-3 py-1 hover:bg-text/5 group min-w-0"
                                  >
                                    {fileRef ? (
                                      <OpenSourceButton ref={fileRef} className="flex-1 truncate text-[10px]" />
                                    ) : (
                                      <>
                                        <File className="w-3 h-3 text-muted shrink-0" />
                                        <span className="text-[10px] text-muted font-mono truncate flex-1" title={file}>
                                          {file.split('/').pop()}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                );
                              })
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            ) : (
              <span className="text-xs text-muted">No components detected.</span>
            )}
          </section>
        </div>
      ),
    },
    {
      id: 'diagram',
      defaultSize: 55,
      minWidth: 300,
      collapsible: false,
      content: (
        <main
          ref={diagramRef}
          className="flex-1 bg-surface shadow-inner relative flex flex-col justify-center h-full w-full"
        >
          <div className="absolute top-4 left-4 right-4 z-20 pointer-events-none flex flex-col lg:flex-row flex-wrap justify-between items-start lg:items-center gap-3">
            <div className="export-element-breadcrumbs pointer-events-auto max-w-full">
              <ContextBreadcrumbs
                domain="Architecture"
                activeNode={selectedComponent}
                onClear={() => setSelectedComponent(null)}
              />
            </div>
            <div className="export-element-breadcrumbs flex flex-wrap items-center gap-2 pointer-events-auto">
              <ExportDiagramButton
                elementRef={diagramRef}
                filename={`architecture-diagram-${repoId.replace(/[^a-zA-Z0-9-]/g, '_')}`}
                nodes={rfNodes}
                edges={rfEdges}
              />
              <div className="flex bg-panel border border-border rounded-lg overflow-hidden p-0.5 shadow-sm">
                <button
                  onClick={() => setViewMode('interactive')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${viewMode === 'interactive' ? 'bg-surface text-text shadow-sm' : 'text-muted hover:text-text'}`}
                >
                  Interactive Graph
                </button>
                <button
                  onClick={() => setViewMode('mermaid')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${viewMode === 'mermaid' ? 'bg-surface text-text shadow-sm' : 'text-muted hover:text-text'}`}
                >
                  Mermaid
                </button>
              </div>
            </div>
          </div>

          {viewMode === 'mermaid' ? (
            <div className="w-full h-full pt-16 overflow-auto custom-scrollbar">
              <MermaidViewer diagramStr={mermaidStr} repoId={repoId} />
            </div>
          ) : rfNodes.length > 0 ? (
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
              <Background color="#1D2130" gap={20} size={1} variant="dots" />
              <Controls
                position="bottom-right"
                className="bg-panel border-border"
                style={{ bottom: isMobile ? 80 : 12, right: 12, margin: 0 }}
              />
              <MiniMap
                position="top-right"
                nodeColor={n => {
                  const c = layerColor(n.data?.layer, n.data?.isExternal);
                  return c.bg;
                }}
                maskColor={isLight ? 'rgba(255,255,255,0.7)' : 'rgba(12,14,20,0.75)'}
                className="bg-panel border border-border mt-28 lg:mt-16 hidden sm:block"
              />

              {/* Layer legend */}
              <div
                className="export-element-legend"
                style={{
                  position: 'absolute',
                  bottom: isMobile ? 80 : 12,
                  left: 12,
                  zIndex: 10,
                  background: 'rgba(17,19,24,0.93)',
                  border: '1px solid #1D2130',
                  borderRadius: 8,
                  padding: '8px 12px',
                }}
              >
                <div
                  style={{
                    fontSize: 9,
                    color: '#6B7A99',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    marginBottom: 6,
                  }}
                >
                  Layers
                </div>
                {Object.entries(LAYER_COLORS)
                  .filter(([k]) => k !== 'External')
                  .map(([layer, { bg, border }]) => (
                    <div key={layer} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 2,
                          background: bg,
                          border: `1px solid ${border}`,
                          display: 'inline-block',
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ fontSize: 10, color: '#CBD5E8' }}>{layer}</span>
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
      ),
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

              {(() => {
                let btnText = 'Generate AI Insights';
                let isDisabled = false;
                let action = handleGenerateAi;
                let title = '';

                if (aiState.status === 'loading') {
                  btnText = 'Loading...';
                  isDisabled = true;
                } else if (aiState.authState === 'unauthenticated') {
                  btnText = 'Sign in to use AI';
                  action = () => navigate('/auth/signin');
                } else if (aiState.status === 'offline') {
                  btnText = 'AI Provider Offline';
                  isDisabled = true;
                  title = 'No AI provider configured on the server.';
                } else if (aiState.quotaStatus === 'exhausted') {
                  btnText = 'AI Quota Exceeded';
                  isDisabled = true;
                  title = 'You have reached your AI usage limit.';
                } else if (isGeneratingAi) {
                  btnText = 'Analyzing...';
                  isDisabled = true;
                }

                return (
                  <button
                    onClick={action}
                    disabled={isDisabled}
                    title={title}
                    className="flex items-center gap-2 px-4 py-2 bg-accent/10 hover:bg-accent/20 text-accent rounded transition-colors text-sm font-medium disabled:opacity-50"
                  >
                    {isGeneratingAi ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    {btnText}
                  </button>
                );
              })()}

              {aiError && (
                <div className="mt-4 p-3 bg-danger/10 border border-danger/20 rounded text-danger text-xs text-left flex items-start gap-2 w-full">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="flex-1">{aiError}</span>
                </div>
              )}
            </div>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <ResizableLayout panels={isMobile ? [layoutPanels[1]] : layoutPanels} />

      {/* Mobile Bottom Navigation Bar */}
      {isMobile && (
        <div className="fixed bottom-0 left-0 right-0 bg-panel border-t border-border shadow-[0_-4px_20px_rgba(0,0,0,0.5)] z-[80] p-1 flex justify-around items-center">
          <button
            onClick={() => setMobileControlsOpen(true)}
            className={`flex flex-col items-center p-2 rounded-lg transition-all w-20 ${mobileControlsOpen || selectedComponent ? 'text-accent bg-accent/10' : 'text-muted hover:text-text'}`}
          >
            <Layers className="w-5 h-5 mb-1" />
            <span className="text-[10px] font-medium">Controls</span>
          </button>
          <button
            onClick={() => setMobileInsightsOpen(true)}
            className={`flex flex-col items-center p-2 rounded-lg transition-all w-20 ${mobileInsightsOpen ? 'text-accent bg-accent/10' : 'text-muted hover:text-text'}`}
          >
            <Sparkles className="w-5 h-5 mb-1" />
            <span className="text-[10px] font-medium">Insights</span>
          </button>
        </div>
      )}

      {/* Mobile Controls Bottom Sheet */}
      {isMobile && (
        <div
          className={`fixed inset-0 z-[100] transition-opacity ${mobileControlsOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMobileControlsOpen(false)} />
          <div
            className={`absolute bottom-0 left-0 right-0 bg-panel rounded-t-xl border-t border-border transform transition-transform duration-300 h-[95vh] flex flex-col ${mobileControlsOpen ? 'translate-y-0' : 'translate-y-full'}`}
          >
            <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
              <span className="font-semibold text-text text-sm flex items-center gap-2">
                <Layers className="w-4 h-4" /> Controls
              </span>
              <button
                onClick={() => setMobileControlsOpen(false)}
                className="p-1.5 bg-surface/50 rounded text-muted hover:text-text"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {layoutPanels[0].content}
          </div>
        </div>
      )}

      {/* Mobile AI Insights Bottom Sheet */}
      {isMobile && (
        <div
          className={`fixed inset-0 z-[100] transition-opacity ${mobileInsightsOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMobileInsightsOpen(false)} />
          <div
            className={`absolute bottom-0 left-0 right-0 bg-panel rounded-t-xl border-t border-border transform transition-transform duration-300 h-[95vh] flex flex-col ${mobileInsightsOpen ? 'translate-y-0' : 'translate-y-full'}`}
          >
            <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
              <span className="font-semibold text-text text-sm flex items-center gap-2">
                <Sparkles className="w-4 h-4" /> AI Insights
              </span>
              <button
                onClick={() => setMobileInsightsOpen(false)}
                className="p-1.5 bg-surface/50 rounded text-muted hover:text-text"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {layoutPanels[2].content}
          </div>
        </div>
      )}
    </>
  );
}
