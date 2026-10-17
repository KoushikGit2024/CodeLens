/**
 * DependencyGraphPage.jsx
 *
 * It initiates the React Flow layout engine, then extracts the node positions,
 * and then it applies interactivity for exploring the architectural dependency graph.
 */
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import ReactFlow, { Background, Controls, MiniMap, Panel, useNodesState, useEdgesState } from 'reactflow';
import 'reactflow/dist/style.css';
import {
  Loader2,
  AlertCircle,
  AlertTriangle,
  Database,
  GitBranch,
  Layers,
  Zap,
  LayoutGrid,
  Filter,
  Info,
  RefreshCw,
  X,
} from 'lucide-react';
import { useRepository } from '../../shared/context/RepositoryContext';
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, forceX, forceY } from 'd3-force';

import { repositoryApi } from '../../shared/api';
import { useToast } from '../../shared/context/ToastContext';
import { ResizableLayout } from '../../shared/components/ResizableLayout';
import ContextBreadcrumbs from '../../shared/components/ContextBreadcrumbs';

// Import abstractions
import { graphToFlow, couplingColor, NODE_W, NODE_H, getForceLayout } from './graphUtils';
import { nodeTypes, edgeTypes } from './GraphNodes';
import { StatRow, FileDetailPanel, PackageDetailPanel } from './GraphSideBar';
import { ExportDiagramButton } from '../../shared/components/ExportDiagramButton';
import { useTheme } from '../../shared/context/ThemeContext';
import GraphSearchUI from '../../shared/components/GraphSearchUI';

const LAYOUT_OPTIONS = [
  { key: 'clustered', label: 'Clustered', icon: LayoutGrid, tip: 'Group files by directory into visual clusters' },
  { key: 'force', label: 'Force', icon: Zap, tip: 'Physics-based organic layout' },
  { key: 'flat', label: 'Flat', icon: Layers, tip: 'Left-to-right hierarchical layout' },
];

function Toggle({ checked, onChange, label, disabled = false, size = 'md' }) {
  const isSm = size === 'sm';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
        isSm ? 'w-6 h-3.5' : 'w-8 h-4'
      } ${checked ? 'bg-accent' : 'bg-surface border border-border'} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`pointer-events-none inline-block rounded-full bg-text shadow-sm transition-transform ${
          isSm ? 'w-3 h-3' : 'w-4 h-4'
        } ${checked ? (isSm ? 'translate-x-2.5' : 'translate-x-4') : 'translate-x-0'}`}
      />
    </button>
  );
}

export default function DependencyGraphPage() {
  const { theme } = useTheme();
  const isLight = theme?.id?.includes('light');
  const { repoId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [graph, setGraph] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const { repo, livePhase } = useRepository();
  const isGloballyAnalyzing = !!livePhase || repo?.status === 'analyzing';
  const selected = searchParams.get('node');
  const setSelected = useCallback(
    val => {
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev);
          const current = prev.get('node');
          const nextVal = typeof val === 'function' ? val(current) : val;
          if (nextVal) {
            next.set('node', nextVal);
          } else {
            next.delete('node');
          }
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );
  const { addToast } = useToast();
  const [fileInfo, setFileInfo] = useState(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const [showExternalPackages, setShowExternalPackages] = useState(false);
  const [visualExternal, setVisualExternal] = useState(false);
  const [isCalculatingGraph, setIsCalculatingGraph] = useState(false);
  const [showExternalWarningModal, setShowExternalWarningModal] = useState(false);
  const [warnBeforeExternal, setWarnBeforeExternal] = useState(
    () => sessionStorage.getItem('codeLens_hideExternalWarning') !== 'true'
  );

  const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

  const [edgeStyle, setEdgeStyle] = useState(() => {
    return localStorage.getItem('codeLens_edgeStyle') || (prefersReducedMotion ? 'straight' : 'spring');
  });
  const [showChurn, setShowChurn] = useState(() => localStorage.getItem('codeLens_showChurn') === 'true');
  const [spread, setSpread] = useState(() => {
    const saved = localStorage.getItem('codeLens_spread');
    return saved !== null && !isNaN(Number(saved)) ? Number(saved) : 50;
  });
  const [isSimPaused, setIsSimPaused] = useState(false);

  useEffect(() => {
    localStorage.setItem('codeLens_edgeStyle', edgeStyle);
  }, [edgeStyle]);

  useEffect(() => {
    localStorage.setItem('codeLens_showChurn', String(showChurn));
  }, [showChurn]);

  useEffect(() => {
    localStorage.setItem('codeLens_spread', String(spread));
  }, [spread]);

  const [searchQuery, setSearchQuery] = useState('');
  const [matchedNodes, setMatchedNodes] = useState([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [rfInstance, setRfInstance] = useState(null);

  const layoutType = searchParams.get('layout') || 'clustered';
  const setLayoutType = useCallback(
    type => {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.set('layout', type);
        return next;
      });
      if (window.innerWidth < 768) {
        setMobileFiltersOpen(false);
      }
    },
    [setSearchParams]
  );

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
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  const simRef = useRef(null);
  const animFrameRef = useRef(null);
  const spreadRef = useRef(spread);
  spreadRef.current = spread;
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

  useEffect(() => {
    loadGraph();
  }, [loadGraph]);

  useEffect(() => {
    if (!graph || graph.status === 'analyzing' || !selected) {
      setFileInfo(null);
      return;
    }

    const node = graph.nodes?.find(n => n.id === selected);

    if (!node) {
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev);
          next.delete('node');
          return next;
        },
        { replace: true }
      );
      setFileInfo(null);
      return;
    }

    if (node.type !== 'fileNode' && node.type !== 'file') {
      setFileInfo(null);
      return;
    }

    const filePath = node.data?.fullLabel || node.data?.filePath || selected;
    let isMounted = true;

    setInfoLoading(true);
    setFileInfo(null);

    repositoryApi
      .getFileDependencyInfo(repoId, filePath)
      .then(res => {
        if (isMounted) setFileInfo(res.data);
      })
      .catch(() => {
        if (isMounted) setFileInfo(null);
      })
      .finally(() => {
        if (isMounted) setInfoLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [graph, selected, repoId, setSearchParams]);

  const handleSearch = useCallback(
    query => {
      setSearchQuery(query);
      if (!query) {
        setMatchedNodes([]);
        setCurrentMatchIndex(0);
        return;
      }

      const lowerQuery = query.toLowerCase();
      const currentNodes = nodesRef.current || [];
      const matches = currentNodes
        .filter(n => {
          if (n.type === 'group') return false;
          return (
            n.data?.label?.toLowerCase().includes(lowerQuery) || n.data?.fullLabel?.toLowerCase().includes(lowerQuery)
          );
        })
        .map(n => n.id);

      setMatchedNodes(matches);
      if (matches.length > 0) {
        setCurrentMatchIndex(1);
        if (rfInstance) {
          const matchNode = currentNodes.find(n => n.id === matches[0]);
          if (matchNode) {
            rfInstance.setCenter(
              matchNode.position.x + parseInt(matchNode.style?.width || 150) / 2,
              matchNode.position.y + parseInt(matchNode.style?.height || 34) / 2,
              { zoom: 1.2, duration: 800 }
            );
          }
        }
      } else {
        setCurrentMatchIndex(0);
      }
    },
    [rfInstance]
  );

  const handleNextMatch = useCallback(() => {
    if (matchedNodes.length === 0) return;
    const nextIdx = currentMatchIndex >= matchedNodes.length ? 1 : currentMatchIndex + 1;
    setCurrentMatchIndex(nextIdx);

    if (rfInstance) {
      const matchNode = (nodesRef.current || []).find(n => n.id === matchedNodes[nextIdx - 1]);
      if (matchNode) {
        const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
        rfInstance.setCenter(
          matchNode.position.x + parseInt(matchNode.style?.width || 150) / 2,
          matchNode.position.y + parseInt(matchNode.style?.height || 34) / 2,
          { zoom: 1.2, duration: reduce ? 0 : 800 }
        );
      }
    }
  }, [matchedNodes, currentMatchIndex, rfInstance]);

  const handlePrevMatch = useCallback(() => {
    if (matchedNodes.length === 0) return;
    const prevIdx = currentMatchIndex <= 1 ? matchedNodes.length : currentMatchIndex - 1;
    setCurrentMatchIndex(prevIdx);

    if (rfInstance) {
      const matchNode = (nodesRef.current || []).find(n => n.id === matchedNodes[prevIdx - 1]);
      if (matchNode) {
        const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
        rfInstance.setCenter(
          matchNode.position.x + parseInt(matchNode.style?.width || 150) / 2,
          matchNode.position.y + parseInt(matchNode.style?.height || 34) / 2,
          { zoom: 1.2, duration: reduce ? 0 : 800 }
        );
      }
    }
  }, [matchedNodes, currentMatchIndex, rfInstance]);

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
    setMatchedNodes([]);
    setCurrentMatchIndex(0);
  }, []);

  const focusNode = useCallback(
    id => {
      setSelected(id);
      const n = (nodesRef.current || []).find(node => node.id === id);
      if (n && rfInstance) {
        const w = parseInt(n.style?.width || NODE_W, 10);
        const h = parseInt(n.style?.height || NODE_H, 10);
        const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
        rfInstance.setCenter(n.position.x + w / 2, n.position.y + h / 2, { zoom: 1.2, duration: reduce ? 0 : 600 });
      }
    },
    [rfInstance, setSelected]
  );

  const toggleSelect = useCallback(
    nodeId => {
      setSelected(prev => (prev === nodeId ? null : nodeId));
      if (isMobile) setMobileDetailOpen(true);
    },
    [setSelected, isMobile]
  );

  useEffect(() => {
    if (!rfInstance || (nodesRef.current || []).length === 0) return;
    const t = setTimeout(() => {
      rfInstance.fitView({ padding: 0.15, duration: 500 });
    }, 120);
    return () => clearTimeout(t);
  }, [layoutType, showExternalPackages, rfInstance]);

  const applyForces = useCallback((sim, spreadVal) => {
    // Rectangle half-diagonal for accurate collision radius
    const R = Math.hypot(NODE_W / 2, NODE_H / 2) + 8; // ≈85px
    // Link distance scales strongly with spread so nodes can breathe
    const linkDist = NODE_W + 60 + spreadVal * 3.5;
    // Centering force is intentionally very weak — let repulsion do the spreading
    const centerStr = Math.max(0.002, 0.02 - spreadVal * 0.00018);

    sim
      .force('charge', forceManyBody().strength(-150 - spreadVal * 20).theta(0.85).distanceMax(3000))
      .force('x', forceX(0).strength(centerStr))
      .force('y', forceY(0).strength(centerStr))
      .force('collide', forceCollide().radius(R).iterations(3).strength(0.85));

    const linkForce = sim.force('link');
    if (linkForce) {
      linkForce.distance(linkDist).strength(0.4);
    }
    return sim;
  }, []);

  const stopSimulation = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (simRef.current) {
      simRef.current.on('tick', null);
      simRef.current.on('end', null);
      simRef.current.stop();
      simRef.current = null;
    }
  }, []);

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

    let {
      rfNodes,
      rfEdges,
      dirColorMap: dcm,
    } = graphToFlow(graph, selected, showExternalPackages, layoutType, edgeStyle, {
      showChurn,
      churnData: graph.gitChurn,
      onSelect: toggleSelect,
    });

    if (matchedNodes.length > 0) {
      const matchSet = new Set(matchedNodes);
      rfNodes = rfNodes.map(n => {
        if (n.type === 'group') return n;
        const isMatch = matchSet.has(n.id);
        return {
          ...n,
          data: {
            ...n.data,
            isSearchMatch: isMatch,
            isSearchActive: true,
          },
        };
      });
    }

    setDirColorMap(dcm || new Map());

    const MAX_FORCE_NODES = 800;

    if (layoutType === 'force') {
      if (rfNodes.length > MAX_FORCE_NODES) {
        addToast({
          title: 'Force Layout Exceeded Node Limit',
          description: `Force layout is limited to ${MAX_FORCE_NODES} nodes for performance. Switched to Clustered layout.`,
          type: 'warning',
        });
        setLayoutType('clustered');
        return;
      }

      // If a simulation is already running and topology hasn't changed,
      // update node and edge visual state (fading/highlighting) without disturbing the physics!
      if (simRef.current) {
        const currentSimNodes = simRef.current.nodes();
        const topologyChanged = currentSimNodes.length !== rfNodes.length;

        if (!topologyChanged) {
          setNodes(currentNodes => {
            const updatedMap = new Map(rfNodes.map(n => [n.id, n]));
            return currentNodes.map(cn => {
              const updated = updatedMap.get(cn.id);
              return updated ? { ...updated, position: cn.position, fx: cn.fx, fy: cn.fy } : cn;
            });
          });
          setEdges(currentEdges => {
            const updatedMap = new Map(rfEdges.map(e => [e.id, e]));
            return currentEdges.map(ce => {
              const updated = updatedMap.get(ce.id);
              return updated ? { ...ce, ...updated } : ce;
            });
          });
          return; // Skip simulation restart, keep existing simulation running!
        }

        // Topology CHANGED (e.g., toggled external packages).
        // Preserve positions of existing nodes before restarting the simulation.
        const oldSimNodes = new Map(currentSimNodes.map(n => [n.id, n]));
        const initialNodes = rfNodes.map(n => {
          const old = oldSimNodes.get(n.id);
          return old ? { ...n, position: { x: old.x, y: old.y } } : n;
        });

        stopSimulation();
        setNodes(initialNodes);
        setEdges(rfEdges);
        rfNodes = initialNodes;
      } else {
        setNodes(rfNodes);
        setEdges(rfEdges);
      }

      const simNodes = rfNodes.map(n => ({ id: n.id, x: n.position.x, y: n.position.y }));
      const nodeIndex = new Map(simNodes.map((n, i) => [n.id, i]));
      const simEdges = rfEdges
        .filter(e => nodeIndex.has(e.source) && nodeIndex.has(e.target))
        .map(e => ({ source: nodeIndex.get(e.source), target: nodeIndex.get(e.target) }));

      let lastTickTime = 0;
      const HEAVY_GRAPH = simNodes.length > 250;

      const sim = forceSimulation(simNodes)
        .force('link', forceLink(simEdges))
        .force('center', forceCenter(0, 0))
        .velocityDecay(0.35)
        .alphaMin(0.001)
        .alphaDecay(0.02);

      applyForces(sim, spreadRef.current);
      simRef.current = sim;
      setIsSimPaused(false);

      const applyPositions = () => {
        setNodes(currentNodes => {
          return currentNodes.map(node => {
            const idx = nodeIndex.get(node.id);
            if (idx === undefined) return node;
            const simNode = simNodes[idx];
            const w = parseInt(node.style?.width ?? NODE_W, 10);
            const h = parseInt(node.style?.height ?? NODE_H, 10);
            return {
              ...node,
              position: { x: simNode.x - w / 2, y: simNode.y - h / 2 },
            };
          });
        });
      };

      sim.on('tick', () => {
        const now = performance.now();
        const frameMs = HEAVY_GRAPH ? 50 : 33;
        if (now - lastTickTime < frameMs || animFrameRef.current) return;
        lastTickTime = now;
        animFrameRef.current = requestAnimationFrame(() => {
          animFrameRef.current = null;
          applyPositions();
        });
      });

      sim.on('end', () => {
        if (animFrameRef.current) {
          cancelAnimationFrame(animFrameRef.current);
          animFrameRef.current = null;
        }
        applyPositions();
      });
    } else {
      stopSimulation();
      setNodes(rfNodes);
      setEdges(rfEdges);
    }
  }, [graph, selected, showExternalPackages, layoutType, edgeStyle, showChurn, matchedNodes, applyForces, addToast, setLayoutType, stopSimulation, toggleSelect]);

  /**
   * It monitors the slider value, then extracts gravity and repulsion multipliers,
   * and then it applies them to the dynamic d3-force physics engine.
   */
  useEffect(() => {
    if (layoutType === 'force' && simRef.current) {
      applyForces(simRef.current, spread);
      simRef.current.alpha(0.4).restart();
      setIsSimPaused(false);
    }
  }, [spread, layoutType, applyForces]);

  useEffect(() => {
    return () => {
      stopSimulation();
    };
  }, [stopSimulation]);

  const dragStartPos = useRef(null);
  const panePointerDownRef = useRef(null);

  const onNodeDragStart = useCallback(
    (event, node) => {
      dragStartPos.current = { x: event.clientX, y: event.clientY };
    },
    []
  );

  const onNodeDrag = useCallback(
    (event, node) => {
      if (layoutType !== 'force' || !simRef.current) return;
      if (
        dragStartPos.current &&
        Math.hypot((event.clientX || 0) - dragStartPos.current.x, (event.clientY || 0) - dragStartPos.current.y) > 5
      ) {
        simRef.current.alphaTarget(0.2).restart();
        const simNode = simRef.current.nodes().find(n => n.id === node.id);
        const w = parseInt(node.style?.width ?? NODE_W, 10);
        const h = parseInt(node.style?.height ?? NODE_H, 10);
        if (simNode) {
          simNode.fx = node.position.x + w / 2;
          simNode.fy = node.position.y + h / 2;
        }
      }
    },
    [layoutType]
  );

  const onNodeDragStop = useCallback(
    (event, node) => {
      const moved =
        dragStartPos.current &&
        Math.hypot((event.clientX || 0) - dragStartPos.current.x, (event.clientY || 0) - dragStartPos.current.y) > 5;
      dragStartPos.current = null;

      if (!moved) {
        return;
      }

      if (layoutType !== 'force' || !simRef.current) return;
      simRef.current.alphaTarget(0);
      const simNode = simRef.current.nodes().find(n => n.id === node.id);
      if (simNode) {
        const w = parseInt(node.style?.width ?? NODE_W, 10);
        const h = parseInt(node.style?.height ?? NODE_H, 10);
        simNode.fx = node.position.x + w / 2;
        simNode.fy = node.position.y + h / 2;
      }
    },
    [layoutType]
  );

  const onNodeDoubleClick = useCallback(
    (event, node) => {
      if (layoutType !== 'force' || !simRef.current) return;
      const simNode = simRef.current.nodes().find(n => n.id === node.id);
      if (simNode) {
        simNode.fx = null;
        simNode.fy = null;
        simRef.current.alpha(0.3).restart();
      }
    },
    [layoutType]
  );

  /**
   * Fallback click handler for nodes without CustomNode pointer handling (e.g. Group nodes)
   */
  const onNodeClick = useCallback(
    (_ev, rfNode) => {
      if (rfNode.type === 'group') return;
      if (!rfNode.data?.onSelect) {
        toggleSelect(rfNode.id);
      }
    },
    [toggleSelect]
  );

  const onPaneClick = useCallback(() => {
    setSelected(null);
    setFileInfo(null);
  }, [setSelected]);

  useEffect(() => {
    const handleKeyDown = e => {
      if (e.key === 'Escape') {
        setSelected(null);
        setFileInfo(null);
        handleClearSearch();
      }
      if (e.key === '/' && !/input|textarea|select/i.test(e.target.tagName)) {
        e.preventDefault();
        document.querySelector('[data-graph-search]')?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setSelected, handleClearSearch]);

  const stats = useMemo(() => {
    if (!graph || graph.status === 'analyzing' || !graph.meta) return null;
    return {
      files: graph.meta.totalFiles,
      packages: graph.meta.totalPackages,
      edges: graph.meta.totalEdges,
      unresolved: graph.meta.unresolvedImports,
      cycles: graph.cycles?.length ?? 0,
      isolated: graph.nodes.filter(n => n.type === 'fileNode' && n.data?.isIsolated).length ?? 0,
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
            {!isNotReady && (
              <button
                onClick={handleReanalyze}
                disabled={isReanalyzing || isGloballyAnalyzing}
                className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-text rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isReanalyzing || isGloballyAnalyzing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Starting...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" /> Re-analyze Repo
                  </>
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
              <StatRow label="Files" value={stats.files} />
              <StatRow label="Packages" value={stats.packages} />
              <StatRow label="Edges" value={stats.edges} />
              <StatRow label="Unresolved" value={stats.unresolved} warn={stats.unresolved > 0} />
              <StatRow label="Cycles" value={stats.cycles} warn={stats.cycles > 0} />
              <StatRow label="Isolated" value={stats.isolated} />
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
                  min="0"
                  max="100"
                  value={spread}
                  onChange={e => setSpread(Number(e.target.value))}
                  className="w-full accent-accent h-1.5 bg-border rounded-lg appearance-none cursor-pointer outline-none"
                />
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/40 text-[10px]">
                  <button
                    type="button"
                    onClick={() => {
                      if (!simRef.current) return;
                      if (isSimPaused) {
                        simRef.current.alpha(0.4).restart();
                        setIsSimPaused(false);
                      } else {
                        simRef.current.stop();
                        setIsSimPaused(true);
                      }
                    }}
                    className="px-2 py-1 bg-surface border border-border rounded text-text hover:bg-text/5 transition-colors"
                  >
                    {isSimPaused ? '▶ Resume' : '⏸ Pause'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!simRef.current) return;
                      const simNodes = simRef.current.nodes();
                      const initialLayout = getForceLayout(simNodes);
                      simNodes.forEach((n, i) => {
                        if (initialLayout[i]?.position) {
                          n.x = initialLayout[i].position.x;
                          n.y = initialLayout[i].position.y;
                        }
                        n.vx = 0;
                        n.vy = 0;
                        n.fx = null;
                        n.fy = null;
                      });
                      applyForces(simRef.current, spread);
                      simRef.current.alpha(1).alphaTarget(0).restart();
                      setIsSimPaused(false);
                      if (rfInstance) {
                        setTimeout(() => rfInstance.fitView({ padding: 0.2, duration: 400 }), 50);
                      }
                    }}
                    title="Unpin all nodes and restart layout simulation"
                    className="px-2 py-1 bg-surface border border-border rounded text-muted hover:text-text hover:bg-text/5 transition-colors"
                  >
                    ↺ Reset
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="border-t border-border pt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-text font-medium">Straight Edges</span>
              <Toggle
                checked={edgeStyle === 'straight'}
                onChange={() => setEdgeStyle(prev => (prev === 'spring' ? 'straight' : 'spring'))}
                label="Toggle between springy and straight lines"
              />
            </div>
            <p className="text-muted" style={{ fontSize: 10 }}>
              Toggle between springy and straight lines
            </p>
          </section>

          <section className="border-t border-border pt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-text font-medium">Git Churn overlay</span>
              <Toggle
                checked={showChurn}
                onChange={() => setShowChurn(prev => !prev)}
                label="Toggle Git Churn overlay"
              />
            </div>
            <p className="text-muted" style={{ fontSize: 10 }}>
              Highlight files with high change frequency
            </p>
          </section>

          <section className="border-t border-border pt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-text font-medium">Externals</span>
              <div className="flex items-center gap-2">
                {isCalculatingGraph && <Loader2 className="w-3 h-3 text-muted animate-spin" />}
                <Toggle
                  checked={visualExternal}
                  disabled={isCalculatingGraph}
                  onChange={() => {
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
                  label="Toggle external packages"
                />
              </div>
            </div>
            <p className="text-muted mb-2" style={{ fontSize: 10 }}>
              Show npm/system packages
            </p>
            <div className="flex items-center justify-between mt-2">
              <span className="text-muted text-[10px]">Warn before enabling</span>
              <Toggle
                size="sm"
                checked={warnBeforeExternal}
                onChange={() => {
                  const nextVal = !warnBeforeExternal;
                  sessionStorage.setItem('codeLens_hideExternalWarning', nextVal ? 'false' : 'true');
                  setWarnBeforeExternal(nextVal);
                }}
                label="Warn before enabling external packages"
              />
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
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 3,
                        background: color,
                        display: 'inline-block',
                        flexShrink: 0,
                      }}
                    />
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
              <span>Low</span>
              <span>High</span>
            </div>
            <p className="text-muted mt-1" style={{ fontSize: 10 }}>
              Node color = total connections
            </p>
          </section>
        </div>
      ),
    },
    {
      id: 'graph',
      defaultSize: 60,
      minWidth: 300,
      collapsible: false,
      content: (
        <div
          ref={graphRef}
          className="relative bg-surface shadow-inner h-full w-full"
          onPointerDown={e => {
            // Ignore clicks originating from inside nodes or interactive UI overlays
            if (
              e.target.closest?.('.react-flow__node') ||
              e.target.closest?.('.react-flow__controls') ||
              e.target.closest?.('.react-flow__minimap') ||
              e.target.closest?.('.export-element-breadcrumbs') ||
              e.target.closest?.('button') ||
              e.target.closest?.('input')
            ) {
              panePointerDownRef.current = null;
              return;
            }
            panePointerDownRef.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerUp={e => {
            if (panePointerDownRef.current) {
              const dist = Math.hypot(
                (e.clientX || 0) - panePointerDownRef.current.x,
                (e.clientY || 0) - panePointerDownRef.current.y
              );
              panePointerDownRef.current = null;
              if (dist < 8) {
                setSelected(null);
                setFileInfo(null);
              }
            }
          }}
        >
          <div className="absolute top-3 left-3 right-3 z-30 pointer-events-none flex flex-col md:flex-row flex-wrap justify-between items-start md:items-center gap-3">
            <div className="export-element-breadcrumbs pointer-events-auto max-w-[80vw]">
              <ContextBreadcrumbs domain="Dependency Graph" activeNode={selected} onClear={() => setSelected(null)} />
            </div>

            <div className="export-element-breadcrumbs pointer-events-auto shrink-0 flex items-center gap-2">
              <GraphSearchUI
                onSearch={handleSearch}
                onNext={handleNextMatch}
                onPrev={handlePrevMatch}
                onClear={handleClearSearch}
                matchCount={searchQuery ? matchedNodes.length : null}
                currentMatchIndex={currentMatchIndex}
              />
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
              <p className="text-muted text-sm max-w-sm text-center">
                {searchQuery
                  ? `No nodes match filter "${searchQuery}".`
                  : 'No resolvable internal dependency relationships were found.'}
              </p>
              {(searchQuery || selected) && (
                <button
                  type="button"
                  onClick={() => {
                    handleClearSearch();
                    setSelected(null);
                  }}
                  className="px-3 py-1.5 text-xs bg-accent text-text rounded-md hover:bg-accent-hover transition-colors font-medium mt-2"
                >
                  Clear Filters & Search
                </button>
              )}
            </div>
          ) : (
            <ReactFlow
              onInit={setRfInstance}
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={onNodeClick}
              onNodeDoubleClick={onNodeDoubleClick}
              onNodeDragStart={onNodeDragStart}
              onNodeDrag={onNodeDrag}
              onNodeDragStop={onNodeDragStop}
              onPaneClick={onPaneClick}
              onEdgeClick={() => {
                setSelected(null);
                setFileInfo(null);
              }}
              fitView
              fitViewOptions={{ padding: 0.15 }}
              className="bg-transparent"
              minZoom={0.05}
              maxZoom={2}
              elementsSelectable={false}
              elevateEdgesOnSelect={false}
              nodesConnectable={false}
              onlyRenderVisibleElements
              proOptions={{ hideAttribution: true }}
              defaultEdgeOptions={{ zIndex: 1 }}
            >
              <Background color={isLight ? '#00000012' : '#ffffff10'} gap={20} size={1} variant="dots" />
              <Controls
                position="bottom-left"
                className="bg-panel border-border"
                style={{ bottom: isMobile ? 80 : 12, left: 12, margin: 0 }}
              />
              <MiniMap
                nodeColor={n => {
                  if (n.type === 'group') return isLight ? '#00000015' : '#ffffff08';
                  return n.data?.heatColor || '#4D7EFF';
                }}
                maskColor={isLight ? 'rgba(255,255,255,0.7)' : 'rgba(12,14,20,0.85)'}
                className="bg-panel border border-border mt-24 sm:mt-16 hidden sm:block"
              />
            </ReactFlow>
          )}
        </div>
      ),
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
            <FileDetailPanel info={fileInfo} repoId={repoId} graph={graph} onSelectNode={focusNode} />
          )}

          {selected && !infoLoading && !fileInfo && (
            <PackageDetailPanel nodeId={selected} graph={graph} onSelectNode={focusNode} />
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
        <div
          className={`fixed inset-0 z-[100] transition-opacity ${mobileFiltersOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMobileFiltersOpen(false)} />
          <div
            className={`absolute bottom-0 left-0 right-0 bg-panel rounded-t-xl border-t border-border transform transition-transform duration-300 max-h-[85vh] flex flex-col ${mobileFiltersOpen ? 'translate-y-0' : 'translate-y-full'}`}
          >
            <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
              <span className="font-semibold text-text text-sm flex items-center gap-2">
                <Filter className="w-4 h-4" /> Filters & Layout
              </span>
              <button
                onClick={() => setMobileFiltersOpen(false)}
                className="p-1.5 bg-surface/50 rounded text-muted hover:text-text"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {layoutPanels[0].content}
          </div>
        </div>
      )}

      {/* Mobile Details Bottom Sheet */}
      {isMobile && (
        <div
          className={`fixed inset-0 z-[100] transition-opacity ${mobileDetailOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMobileDetailOpen(false)} />
          <div
            className={`absolute bottom-0 left-0 right-0 bg-panel rounded-t-xl border-t border-border transform transition-transform duration-300 max-h-[85vh] flex flex-col ${mobileDetailOpen ? 'translate-y-0' : 'translate-y-full'}`}
          >
            <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
              <span className="font-semibold text-text text-sm flex items-center gap-2">
                <Info className="w-4 h-4" /> Node Details
              </span>
              <button
                onClick={() => setMobileDetailOpen(false)}
                className="p-1.5 bg-surface/50 rounded text-muted hover:text-text"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {layoutPanels[2].content}
          </div>
        </div>
      )}

      {/* External Packages Warning Modal */}
      {showExternalWarningModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-background/60 backdrop-blur-sm"
            onClick={() => setShowExternalWarningModal(false)}
          />
          <div className="relative bg-surface border border-warning/30 shadow-2xl rounded-xl w-full max-w-md mx-4 overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-warning/5">
              <AlertTriangle className="w-5 h-5 text-warning shrink-0" />
              <h2 className="text-base font-semibold text-text">Performance Warning</h2>
            </div>
            <div className="px-5 py-4 flex flex-col gap-3">
              <p className="text-sm text-text leading-relaxed">
                Enabling external packages will include{' '}
                <strong className="text-text">all npm and system dependencies</strong> in the graph.
              </p>
              <p className="text-sm text-text leading-relaxed">
                Depending on your codebase size, this can add{' '}
                <strong className="text-warning">thousands of nodes</strong>, causing severe performance slowdowns or
                potentially crashing your browser tab.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="dontShowAgain"
                  className="accent-accent cursor-pointer"
                  checked={!warnBeforeExternal}
                  onChange={e => {
                    const hide = e.target.checked;
                    sessionStorage.setItem('codeLens_hideExternalWarning', hide ? 'true' : 'false');
                    setWarnBeforeExternal(!hide);
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
