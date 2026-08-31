import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { RefreshCw, AlertCircle, Loader2, File, Box, Wrench, Layers } from 'lucide-react';
import { ResizableLayout } from '../../shared/components/ResizableLayout';
import { repositoryApi } from '../../shared/api';
import AiResponse from '../../shared/components/ai/AiResponse';
import ReactFlow, { Background, Controls, MiniMap, MarkerType, Handle, Position } from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from 'dagre';

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

// ── Concentric Grid Layout ──────────────────────────────────────────────────

function getConcentricGridLayout(nodes) {
  const LAYER_ORDER = {
    'Domain': 0,
    'Service': 1,
    'API': 2,
    'Presentation': 3,
    'Data': 4,
    'Config': 5,
    'External': 6,
    'Unknown': 7
  };

  const layers = {};
  nodes.forEach(node => {
    let layer = node.data?.layer || (node.data?.isExternal ? 'External' : 'Unknown');
    if (!layers[layer]) layers[layer] = [];
    layers[layer].push(node);
  });

  const sortedLayerKeys = Object.keys(layers).sort((a, b) => {
    const orderA = LAYER_ORDER[a] !== undefined ? LAYER_ORDER[a] : 99;
    const orderB = LAYER_ORDER[b] !== undefined ? LAYER_ORDER[b] : 99;
    return orderA - orderB;
  });

  // Flatten nodes prioritized by layer so core is at the center
  let orderedNodes = [];
  sortedLayerKeys.forEach(key => orderedNodes.push(...layers[key]));

  // Generate dense concentric Fibonacci spiral to avoid edge overlaps
  const c = 135; // Scaling factor controls density

  orderedNodes.forEach((node, i) => {
    const w = node.data?.isExternal ? 120 : 160;
    
    if (i === 0) {
      // Put the very first core node exactly in the center
      node.position = { x: -w / 2, y: -23 };
    } else {
      // Golden angle in radians ~ 2.39996
      const theta = i * 2.3999632327;
      const radius = c * Math.sqrt(i);
      
      const x = radius * Math.cos(theta);
      const y = radius * Math.sin(theta);
      
      // Offset by half node size to center the node
      node.position = { 
        x: x - w / 2, 
        y: y - 23 
      };
    }
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

  return { rfNodes: getConcentricGridLayout(rfNodes), rfEdges };
}

export default function ArchitecturePage() {
  const { repoId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [selectedComponent, setSelectedComponent] = useState(null);

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
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
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
    <ResizableLayout
      panels={[
        {
          id: 'data',
          defaultSize: 20,
          minWidth: 200,
          collapsible: true,
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
          content: (
            <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4 custom-scrollbar bg-panel h-full">
              <p className="text-xs text-muted uppercase tracking-wider mb-2">AI Architectural Insights</p>
              
              <AiResponse data={data?.insights} title={null} repoId={repoId} chatId={`architecture-${repoId}`} />
            </div>
          )
        }
      ]}
    />
  );
}
