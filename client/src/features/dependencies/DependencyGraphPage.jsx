/**
 * DependencyGraphPage.jsx
 *
 * It initiates the React Flow layout engine, then extracts the node positions, 
 * and then it applies interactivity for exploring the architectural dependency graph.
 */
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import ReactFlow, { Background, Controls, MiniMap, useNodesState, useEdgesState } from 'reactflow';
import 'reactflow/dist/style.css';
import { Loader2, AlertCircle, AlertTriangle, Database, GitBranch, Layers, Zap, LayoutGrid, Filter, Info, RefreshCw, X } from 'lucide-react';
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, forceX, forceY } from 'd3-force';

import { repositoryApi } from '../../shared/api';
import { useToast } from '../../shared/context/ToastContext';
import { ResizableLayout } from '../../shared/components/ResizableLayout';
import ContextBreadcrumbs from '../../shared/components/ContextBreadcrumbs';

// Import abstractions
import { graphToFlow, couplingColor, NODE_W, NODE_H } from './graphUtils';
import { nodeTypes, edgeTypes } from './GraphNodes';
import { StatRow, FileDetailPanel, PackageDetailPanel } from './GraphSideBar';
import { ExportDiagramButton } from '../../shared/components/ExportDiagramButton';
import { useTheme } from '../../shared/context/ThemeContext';

const LAYOUT_OPTIONS = [
  { key: 'clustered', label: 'Clustered', icon: LayoutGrid, tip: 'Group files by directory into visual clusters' },
  { key: 'force',     label: 'Force',     icon: Zap,        tip: 'Physics-based organic layout' },
  { key: 'flat',      label: 'Flat',      icon: Layers,     tip: 'Left-to-right hierarchical layout' },
];

export default function DependencyGraphPage() {
  const { theme } = useTheme();
  const isLight = theme?.id?.includes('light');
  const { repoId } = useParams();
  const navigate   = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [graph,    setGraph]    = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [selected, setSelected] = useState(null);
  const { addToast } = useToast();
  const [fileInfo, setFileInfo] = useState(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const [showExternalPackages, setShowExternalPackages] = useState(false);
  const [visualExternal, setVisualExternal] = useState(false);
  const [isCalculatingGraph, setIsCalculatingGraph] = useState(false);
  const [showExternalWarningModal, setShowExternalWarningModal] = useState(false);
  const [edgeStyle, setEdgeStyle] = useState('spring');
  const [showChurn, setShowChurn] = useState(false);
  
  const [spread, setSpread] = useState(50);
  
  const layoutType = searchParams.get('layout') || 'clustered';
  const setLayoutType = (type) => {
    setSearchParams(prev => {
      prev.set('layout', type);
      return prev;
    });
  };

  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  const [dirColorMap, setDirColorMap] = useState(new Map());

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const simRef = useRef(null);
  const graphRef = useRef(null);

  /**
   * It requests the dependency graph, then extracts the mapped arrays from the store, 
   * and then it applies them to the component state safely.
   */
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

  /**
   * It tracks the repository status flag, then extracts the ongoing analysis state, 
   * and then it applies an automatic polling sequence until the graph finishes.
   */
  useEffect(() => {
    let timer;
    if (graph?.status === 'analyzing') {
      timer = setTimeout(() => loadGraph(), 2000);
    }
    return () => clearTimeout(timer);
  }, [graph, loadGraph]);

  /**
   * It observes the layout dependencies, then extracts the structural positioning array, 
   * and then it applies the nodes and edges to the React Flow instance.
   */
  useEffect(() => {
    if (!graph?.nodes) return;
    
    const { rfNodes, rfEdges, dirColorMap: dcm } = graphToFlow(
      graph, selected, showExternalPackages, layoutType, edgeStyle, 
      { showChurn, churnData: graph.gitChurn }
    );
    setDirColorMap(dcm || new Map());
    
    if (layoutType === 'force') {
      if (simRef.current) {
        setNodes(currentNodes => {
           const updatedMap = new Map(rfNodes.map(n => [n.id, n]));
           return currentNodes.map(cn => {
             const updated = updatedMap.get(cn.id);
             return updated ? { ...updated, position: cn.position, fx: cn.fx, fy: cn.fy } : cn;
           });
        });
        setEdges(rfEdges); 
        return; 
      }

      setNodes(rfNodes);
      setEdges(rfEdges);
      
      const simNodes = rfNodes.map(n => ({ id: n.id, x: n.position.x, y: n.position.y }));
      const nodeIndex = new Map(simNodes.map((n, i) => [n.id, i]));
      const simEdges = rfEdges
        .filter(e => nodeIndex.has(e.source) && nodeIndex.has(e.target))
        .map(e => ({ source: nodeIndex.get(e.source), target: nodeIndex.get(e.target) }));

      let frameId = null;
      simRef.current = forceSimulation(simNodes)
        .force('charge', forceManyBody())
        .force('link', forceLink(simEdges))
        .force('center', forceCenter(0, 0))
        .force('x', forceX(0))
        .force('y', forceY(0))
        .force('collide', forceCollide().radius(50))
        .velocityDecay(0.6)
        .alpha(1)
        .on('tick', () => {
          if (frameId) return;
          frameId = requestAnimationFrame(() => {
            frameId = null;
            setNodes(currentNodes => {
              return currentNodes.map(node => {
                const idx = nodeIndex.get(node.id);
                if (idx === undefined) return node;
                const simNode = simNodes[idx];
                const w = parseInt(node.style?.width ?? NODE_W, 10);
                const h = parseInt(node.style?.height ?? NODE_H, 10);
                return {
                  ...node,
                  position: { x: simNode.x - w / 2, y: simNode.y - h / 2 }
                };
              });
            });
          });
        });
    } else {
      if (simRef.current) {
        simRef.current.stop();
        simRef.current = null;
      }
      setNodes(rfNodes);
      setEdges(rfEdges);
    }

  }, [graph, selected, showExternalPackages, layoutType, edgeStyle, showChurn]);

  /**
   * It monitors the slider value, then extracts gravity and repulsion multipliers, 
   * and then it applies them to the dynamic d3-force physics engine.
   */
  useEffect(() => {
    if (layoutType === 'force' && simRef.current) {
      const chargeStrength = -50 - (spread * 15);      
      const gravityStrength = 0.15 - (spread * 0.0013); 
      const linkDist = 30 + (spread * 2);              

      simRef.current.force('charge', forceManyBody().strength(chargeStrength));
      simRef.current.force('x', forceX(0).strength(gravityStrength));
      simRef.current.force('y', forceY(0).strength(gravityStrength));
      
      const linkForce = simRef.current.force('link');
      if (linkForce) linkForce.distance(linkDist).strength(0.8);

      simRef.current.alpha(0.3).restart();
    }
  }, [spread, layoutType]);

  useEffect(() => {
    return () => {
      if (simRef.current) simRef.current.stop();
    };
  }, []);

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

  /**
   * It catches node clicks, then extracts the specific file identifier, 
   * and then it applies a secondary API fetch to load detailed sidebar statistics.
   */
  const onNodeClick = useCallback(async (_ev, rfNode) => {
    if (rfNode.type === 'group') return;
    const nodeId = rfNode.id;
    setSelected(prev => prev === nodeId ? null : nodeId); 
    if (isMobile) setMobileDetailOpen(true);

    if (rfNode.data.nodeType !== 'fileNode' && rfNode.data.nodeType !== 'file') {
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
  }, [repoId, isMobile]);

  const onPaneClick = useCallback(() => {
    setSelected(null);
    setFileInfo(null);
  }, []);

  const stats = useMemo(() => {
    if (!graph || graph.status === 'analyzing' || !graph.meta) return null;
    return {
      files:      graph.meta.totalFiles,
      packages:   graph.meta.totalPackages,
      edges:      graph.meta.totalEdges,
      unresolved: graph.meta.unresolvedImports,
      cycles:     graph.cycles?.length ?? 0,
      isolated:   graph.nodes.filter(n => n.type === 'fileNode' && n.data?.isIsolated).length ?? 0,
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

    const handleReanalyze = async () => {
      setIsReanalyzing(true);
      try {
        await repositoryApi.reanalyze(repoId);
        navigate(`/explore/${repoId}`);
      } catch (err) {
        addToast({ title: 'Reanalysis Failed', description: err.message || 'An error occurred while trying to reanalyze.', type: 'error' });
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
            {!isNotReady && (
              <button 
                onClick={handleReanalyze}
                disabled={isReanalyzing}
                className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-text rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isReanalyzing ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Starting...</>
                ) : (
                  <><RefreshCw className="w-4 h-4" /> Re-analyze Repo</>
                )}
              </button>
            )}
            {isNotReady && (
              <button 
                onClick={async () => {
                  await repositoryApi.analyze(repoId);
                  navigate(`/explore/${repoId}`);
                }}
                className="px-4 py-2 bg-accent hover:bg-accent-hover text-text rounded-lg text-sm font-medium transition-colors"
              >
                Start Analysis
              </button>
            )}
          </div>
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

  const layoutPanels = [
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
                          : 'text-muted hover:text-text hover:bg-[#30363d] border border-transparent'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      {label}
                    </button>
                  ))}
                </div>
                
                {layoutType === 'force' && (
                  <div className="mt-4 p-2 bg-surface/50 border border-border/50 rounded flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                      <span className="text-muted text-xs font-medium">Node Spread</span>
                      <span className="text-text font-mono text-[10px]">{spread}%</span>
                    </div>
                    <input 
                      type="range" 
                      min="0" max="100" 
                      value={spread}
                      onChange={(e) => setSpread(Number(e.target.value))}
                      className="w-full accent-accent h-1.5 bg-border rounded-lg appearance-none cursor-pointer outline-none"
                    />
                  </div>
                )}
              </section>

              <section className="border-t border-border pt-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-text font-medium">Straight Edges</span>
                  <button
                    onClick={() => setEdgeStyle(prev => prev === 'spring' ? 'straight' : 'spring')}
                    className={`w-8 h-4 rounded-full transition-colors ${edgeStyle === 'straight' ? 'bg-accent' : 'bg-surface border border-border'}`}
                  >
                    <div className={`w-4 h-4 bg-text rounded-full shadow-sm transition-transform ${edgeStyle === 'straight' ? 'translate-x-4' : 'translate-x-0'} border`} />
                  </button>
                </div>
                <p className="text-muted" style={{ fontSize: 10 }}>Toggle between springy and straight lines</p>
              </section>

              <section className="border-t border-border pt-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-text font-medium">Externals</span>
                  <div className="flex items-center gap-2">
                    {isCalculatingGraph && <Loader2 className="w-3 h-3 text-muted animate-spin" />}
                    <button
                      onClick={() => {
                        if (!visualExternal) {
                          if (sessionStorage.getItem('codeLens_hideExternalWarning') === 'true') {
                            setVisualExternal(true);
                            setIsCalculatingGraph(true);
                            setTimeout(() => {
                              setShowExternalPackages(true);
                              setIsCalculatingGraph(false);
                            }, 50);
                          } else {
                            setShowExternalWarningModal(true);
                          }
                        } else {
                          // Turning OFF — no confirmation needed
                          setVisualExternal(false);
                          setShowExternalPackages(false);
                        }
                      }}
                      className={`w-8 h-4 rounded-full transition-colors ${visualExternal ? 'bg-accent' : 'bg-surface border border-border'}`}
                    >
                      <div className={`w-4 h-4 bg-text rounded-full shadow-sm transition-transform ${visualExternal ? 'translate-x-4' : 'translate-x-0'} border`} />
                    </button>
                  </div>
                </div>
                <p className="text-muted mb-2" style={{ fontSize: 10 }}>Show npm/system packages</p>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-muted text-[10px]">Warn before enabling</span>
                  <button
                    onClick={() => {
                      const current = sessionStorage.getItem('codeLens_hideExternalWarning') === 'true';
                      sessionStorage.setItem('codeLens_hideExternalWarning', current ? 'false' : 'true');
                      // force re-render by touching state
                      setSpread(s => s + 0.0001 - 0.0001);
                    }}
                    className={`w-6 h-3 rounded-full transition-colors ${sessionStorage.getItem('codeLens_hideExternalWarning') !== 'true' ? 'bg-accent' : 'bg-surface border border-border'}`}
                  >
                    <div className={`w-3 h-3 bg-text rounded-full shadow-sm transition-transform ${sessionStorage.getItem('codeLens_hideExternalWarning') !== 'true' ? 'translate-x-3' : 'translate-x-0'} border`} />
                  </button>
                </div>
              </section>

              {/* graph?.gitChurn && (
                <section className="border-t border-border pt-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-text">Git Churn</span>
                    <button
                      onClick={() => setShowChurn(!showChurn)}
                      className={`w-8 h-4 rounded-full transition-colors ${showChurn ? 'bg-orange-500' : 'bg-surface border border-border'}`}
                    >
                      <div className={`w-4 h-4 bg-text rounded-full shadow-sm transition-transform ${showChurn ? 'translate-x-4' : 'translate-x-0'} border`} />
                    </button>
                  </div>
                  <p className="text-muted" style={{ fontSize: 10 }}>Overlay churn risk on nodes</p>
                </section>
              ) */}

              {/* Reverted back to Directories map */}
              {layoutType === 'clustered' && dirColorMap.size > 0 && (
                <section className="border-t border-border pt-3">
                  <p className="text-muted uppercase tracking-wider mb-2">Directories</p>
                  <div className="flex flex-col gap-1.5">
                    {[...dirColorMap.entries()].map(([dir, color]) => (
                      <div key={dir} className="flex items-center gap-2">
                        <span style={{ width: 10, height: 10, borderRadius: 3, background: color, display: 'inline-block', flexShrink: 0 }} />
                        <span className="truncate text-muted font-medium">{dir.split('/').pop() || dir}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

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
                <p className="text-muted mt-1" style={{ fontSize: 10 }}>Node color = total connections</p>
              </section>
            </div>
          )
        },
        {
          id: 'graph',
          defaultSize: 60,
          minWidth: 300,
          collapsible: false,
          content: (
            <div ref={graphRef} className="relative bg-surface shadow-inner flex flex-col h-full w-full">
              <div className="absolute top-3 left-3 right-3 z-30 pointer-events-none flex flex-col sm:flex-row flex-wrap justify-between items-start sm:items-center gap-2">
                <div className="export-element-breadcrumbs pointer-events-auto max-w-full">
                  <ContextBreadcrumbs 
                    domain="Dependency Graph" 
                    activeNode={selected} 
                    onClear={() => setSelected(null)} 
                  />
                </div>
                <div className="export-element-breadcrumbs pointer-events-auto shrink-0">
                  <ExportDiagramButton 
                    elementRef={graphRef} 
                    filename={`dependency-graph-${repoId.replace(/[^a-zA-Z0-9-]/g, '_')}`} 
                    availableToggles={['breadcrumbs', 'controls', 'minimap']}
                    nodes={nodes}
                    edges={edges}
                  />
                </div>
              </div>
              {nodes.length === 0 ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                  <Database className="w-12 h-12 text-muted" />
                  <h2 className="text-text text-lg font-medium">No dependencies detected</h2>
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
                  <Background color="#1D2130" gap={20} size={1} variant="dots" />
                  <Controls position="bottom-left" className="bg-panel border-border" style={{ bottom: isMobile ? 80 : 12, left: 12, margin: 0 }} />
                  <MiniMap
                    nodeColor={n => {
                      if (n.type === 'group') return isLight ? '#00000015' : '#ffffff08';
                      return n.data?.heatColor || '#4D7EFF';
                    }}
                    maskColor={isLight ? "rgba(255,255,255,0.7)" : "rgba(12,14,20,0.85)"}
                    className="bg-panel border border-border mt-20 sm:mt-12 hidden sm:block"
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
                <FileDetailPanel info={fileInfo} repoId={repoId} graph={graph} />
              )}

              {selected && !infoLoading && !fileInfo && (
                <PackageDetailPanel nodeId={selected} graph={graph} />
              )}
            </div>
          )
        }
      ];

  return (
    <>
      <ResizableLayout panels={isMobile ? [layoutPanels[1]] : layoutPanels} />

      {/* Mobile Bottom Navigation Bar */}
      {isMobile && (
        <div className="fixed bottom-0 left-0 right-0 bg-panel border-t border-border shadow-[0_-4px_20px_rgba(0,0,0,0.5)] z-[80] p-1 flex justify-around items-center">
          <button 
            onClick={() => setMobileFiltersOpen(true)}
            className={`flex flex-col items-center p-2 rounded-lg transition-all w-20 ${mobileFiltersOpen ? 'text-accent bg-accent/10' : 'text-muted hover:text-text'}`}
          >
            <Filter className="w-5 h-5 mb-1" />
            <span className="text-[10px] font-medium">Filters</span>
          </button>
          <button 
            onClick={() => setMobileDetailOpen(true)}
            className={`flex flex-col items-center p-2 rounded-lg transition-all w-20 ${selected || mobileDetailOpen ? 'text-accent bg-accent/10' : 'text-muted hover:text-text'}`}
          >
            <Info className="w-5 h-5 mb-1" />
            <span className="text-[10px] font-medium">Details</span>
          </button>
        </div>
      )}

      {/* Mobile Filters Bottom Sheet */}
      {isMobile && (
        <div className={`fixed inset-0 z-[100] transition-opacity ${mobileFiltersOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMobileFiltersOpen(false)} />
          <div className={`absolute bottom-0 left-0 right-0 bg-panel rounded-t-xl border-t border-border transform transition-transform duration-300 max-h-[85vh] flex flex-col ${mobileFiltersOpen ? 'translate-y-0' : 'translate-y-full'}`}>
            <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
               <span className="font-semibold text-text text-sm flex items-center gap-2"><Filter className="w-4 h-4"/> Filters & Layout</span>
               <button onClick={() => setMobileFiltersOpen(false)} className="p-1.5 bg-surface/50 rounded text-muted hover:text-text"><X className="w-4 h-4" /></button>
            </div>
            {layoutPanels[0].content}
          </div>
        </div>
      )}

      {/* Mobile Details Bottom Sheet */}
      {isMobile && (
        <div className={`fixed inset-0 z-[100] transition-opacity ${mobileDetailOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMobileDetailOpen(false)} />
          <div className={`absolute bottom-0 left-0 right-0 bg-panel rounded-t-xl border-t border-border transform transition-transform duration-300 max-h-[85vh] flex flex-col ${mobileDetailOpen ? 'translate-y-0' : 'translate-y-full'}`}>
            <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
               <span className="font-semibold text-text text-sm flex items-center gap-2"><Info className="w-4 h-4"/> Node Details</span>
               <button onClick={() => setMobileDetailOpen(false)} className="p-1.5 bg-surface/50 rounded text-muted hover:text-text"><X className="w-4 h-4" /></button>
            </div>
            {layoutPanels[2].content}
          </div>
        </div>
      )}

    {/* External Packages Warning Modal */}
    {showExternalWarningModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" onClick={() => setShowExternalWarningModal(false)} />
        <div className="relative bg-surface border border-warning/30 shadow-2xl rounded-xl w-full max-w-md mx-4 overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-warning/5">
            <AlertTriangle className="w-5 h-5 text-warning shrink-0" />
            <h2 className="text-base font-semibold text-text">Performance Warning</h2>
          </div>
          <div className="px-5 py-4 flex flex-col gap-3">
            <p className="text-sm text-text leading-relaxed">
              Enabling external packages will include <strong className="text-text">all npm and system dependencies</strong> in the graph.
            </p>
            <p className="text-sm text-text leading-relaxed">
              Depending on your codebase size, this can add <strong className="text-warning">thousands of nodes</strong>, causing severe performance slowdowns or potentially crashing your browser tab.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <input 
                type="checkbox" 
                id="dontShowAgain" 
                className="accent-accent"
                onChange={(e) => {
                  if (e.target.checked) {
                    sessionStorage.setItem('codeLens_hideExternalWarning', 'true');
                  } else {
                    sessionStorage.setItem('codeLens_hideExternalWarning', 'false');
                  }
                }}
              />
              <label htmlFor="dontShowAgain" className="text-xs text-muted cursor-pointer select-none">
                Don't show this warning again
              </label>
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-border bg-panel">
            <button
              onClick={() => setShowExternalWarningModal(false)}
              className="px-4 py-1.5 text-sm text-muted hover:text-text border border-border hover:border-text/20 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                setShowExternalWarningModal(false);
                setVisualExternal(true);
                setIsCalculatingGraph(true);
                setTimeout(() => {
                  setShowExternalPackages(true);
                  setIsCalculatingGraph(false);
                }, 50);
              }}
              className="px-4 py-1.5 text-sm font-medium text-text bg-warning/20 border border-warning/40 hover:bg-warning/30 rounded-lg transition-colors flex items-center gap-2"
            >
              <AlertTriangle className="w-3.5 h-3.5" /> Enable Anyway
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}