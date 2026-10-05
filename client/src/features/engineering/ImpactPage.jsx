/**
 * ImpactPage.jsx
 *
 * It initiates the change impact dashboard, then extracts selected file dependencies,
 * and then it applies the dagre layout to visualize the deterministic blast radius.
 */
import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Activity,
  CheckSquare,
  Loader2,
  GitCommit,
  AlertCircle,
  X,
  ExternalLink,
  File,
  RefreshCw,
  SlidersHorizontal,
} from 'lucide-react';
import { repositoryApi } from '../../shared/api';
import { useRepository } from '../../shared/context/RepositoryContext';
import { useToast } from '../../shared/context/ToastContext';
import PageHeader from '../../shared/components/PageHeader';
import { ResizableLayout } from '../../shared/components/ResizableLayout';
import { ExportDiagramButton } from '../../shared/components/ExportDiagramButton';
import ReactFlow, { Controls, MiniMap, MarkerType, Handle, Position, applyNodeChanges } from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from 'dagre';
import { FileTree } from '../explorer/FileTree';
import OpenSourceButton from '../../shared/components/OpenSourceButton';
import { tryMakeSourceRef } from '../../shared/navigation/sourceRef';
import GraphSearchUI from '../../shared/components/GraphSearchUI';

// ── Dagre Layout & Smart Packing Helper ───────────────────────────
const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const getLayoutedElements = (nodes, edges, direction = 'TB') => {
  if (nodes.length === 0) return { nodes, edges };

  dagreGraph.setGraph({
    rankdir: direction,
    nodesep: 120,
    ranksep: 250,
    edgesep: 50,
    ranker: 'network-simplex',
  });

  const nodeWidth = 160;
  const nodeHeight = 65;

  nodes.forEach(node => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach(edge => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const ranks = {};
  nodes.forEach(node => {
    const pos = dagreGraph.node(node.id);
    const yKey = Math.round(pos.y / 10) * 10;
    if (!ranks[yKey]) ranks[yKey] = [];
    ranks[yKey].push({ ...node, dagreX: pos.x, dagreY: pos.y });
  });

  const sortedYs = Object.keys(ranks)
    .map(Number)
    .sort((a, b) => a - b);

  const X_GAP = 60;
  const Y_GAP = 140;
  const CLUSTER_THRESHOLD = 350;

  let totalYShift = 0;
  const finalNodes = [];

  sortedYs.forEach(yKey => {
    const rankNodes = ranks[yKey].sort((a, b) => a.dagreX - b.dagreX);

    const clusters = [];
    let currentCluster = [rankNodes[0]];

    for (let i = 1; i < rankNodes.length; i++) {
      if (rankNodes[i].dagreX - rankNodes[i - 1].dagreX > CLUSTER_THRESHOLD) {
        clusters.push(currentCluster);
        currentCluster = [rankNodes[i]];
      } else {
        currentCluster.push(rankNodes[i]);
      }
    }
    clusters.push(currentCluster);

    let maxLocalYShift = 0;

    clusters.forEach(cluster => {
      const clusterCenterX = cluster.reduce((sum, n) => sum + n.dagreX, 0) / cluster.length;
      let clusterYShift = 0;

      // FIX: Dynamically calculate nodes per row to form a nice square for massive clusters
      const dynamicMaxNodesPerRow = Math.max(5, Math.ceil(Math.sqrt(cluster.length)));

      for (let i = 0; i < cluster.length; i += dynamicMaxNodesPerRow) {
        const subGroup = cluster.slice(i, i + dynamicMaxNodesPerRow);
        const subGroupWidth = subGroup.length * nodeWidth + (subGroup.length - 1) * X_GAP;
        const startX = clusterCenterX - subGroupWidth / 2 + nodeWidth / 2;

        subGroup.forEach((node, index) => {
          const { dagreX, dagreY, ...cleanNode } = node;

          finalNodes.push({
            ...cleanNode,
            targetPosition: direction === 'TB' ? Position.Top : Position.Left,
            sourcePosition: direction === 'TB' ? Position.Bottom : Position.Right,
            position: {
              x: startX + index * (nodeWidth + X_GAP) - nodeWidth / 2,
              y: node.dagreY + totalYShift + clusterYShift - nodeHeight / 2,
            },
          });
        });

        if (i + dynamicMaxNodesPerRow < cluster.length) {
          clusterYShift += nodeHeight + Y_GAP;
        }
      }

      if (clusterYShift > maxLocalYShift) {
        maxLocalYShift = clusterYShift;
      }
    });

    totalYShift += maxLocalYShift;
  });

  return { nodes: finalNodes, edges };
};

// ── Custom Impact Node ────────────────────────────────────────────

/**
 * It evaluates the node's impact level, then extracts specific severity colors,
 * and then it applies them to the aesthetic glow and borders of the React Flow element.
 */
const ImpactNode = ({ data }) => {
  const isChanged = data.impactLevel === 'changed';
  const isDirect = data.impactLevel === 'direct';

  const bg = isChanged ? '#da3633cc' : isDirect ? '#d29922cc' : '#8957e5cc';
  const border = isChanged ? '#ff7b72' : isDirect ? '#e3b341' : '#a371f7';
  const shadow = data.isSearchMatch
    ? `0 0 8px ${border}88`
    : isChanged
      ? '0 0 15px rgba(255,123,114,0.4)'
      : isDirect
        ? '0 0 10px rgba(227,179,65,0.3)'
        : '0 4px 6px rgba(0,0,0,0.3)';

  return (
    <div
      style={{
        width: 160,
        borderRadius: 8,
        border: data.isSearchMatch ? `2px solid ${border}` : `2px solid ${border}`,
        background: bg,
        padding: '10px',
        color: `rgb(${getComputedStyle(document.documentElement).getPropertyValue('--color-text').trim()})`,
        fontFamily: 'monospace',
        fontSize: '11px',
        boxShadow: shadow,
        opacity: data.isSearchActive && !data.isSearchMatch ? 0.2 : 1,
        transition: 'all 0.2s ease',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div style={{ padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 1 }}>
        <div
          style={{ fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
          title={data.label}
        >
          {data.label}
        </div>
        <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.9 }}>
          {data.impactLevel}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
};

const impactNodeTypes = { impactNode: ImpactNode };

export default function ImpactPage() {
  const { repoId } = useParams();
  const navigate = useNavigate();
  const { repo, livePhase, loading: repoLoading, error: repoError } = useRepository();
  const { addToast } = useToast();

  const [impact, setImpact] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isReanalyzing, setIsReanalyzing] = useState(false);

  const isGloballyAnalyzing = !!livePhase || repo?.status === 'analyzing';

  const [selectedFiles, setSelectedFiles] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  // Node selected inside the ReactFlow graph
  const [selectedNode, setSelectedNode] = useState(null);

  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [rfInstance, setRfInstance] = useState(null);
  const diagramRef = useRef(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Graph Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [matchedNodes, setMatchedNodes] = useState([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  /**
   * It maps the file paths from the analysis array, then extracts nested directory chunks,
   * and then it applies them into a hierarchical tree object for the sidebar selector.
   */
  const fileTreeNodes = useMemo(() => {
    const treeMap = { type: 'directory', children: {} };
    const paths = repo?.analysis?.files?.map(f => f.filePath) || [];

    paths.forEach(path => {
      const parts = path.split('/');
      let current = treeMap;
      let currentPath = '';

      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        if (!current.children[part]) {
          current.children[part] = { name: part, path: currentPath, type: 'directory', children: {} };
        }
        current = current.children[part];
      }

      const fileName = parts[parts.length - 1];
      currentPath = currentPath ? `${currentPath}/${fileName}` : fileName;
      current.children[fileName] = { name: fileName, path: currentPath, type: 'file' };
    });

    const convertMapToArray = map => {
      return Object.values(map.children || {})
        .map(node => {
          if (node.type === 'directory') {
            return { ...node, children: convertMapToArray(node) };
          }
          return node;
        })
        .sort((a, b) => {
          if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
    };

    return convertMapToArray(treeMap);
  }, [repo]);

  /**
   * It tracks the deterministic impact payload, then extracts the affected paths and corresponding edges,
   * and then it applies the smart dagre packer to layout the graphical nodes.
   */
  useEffect(() => {
    if (!impact || !repo?.analysis?.graph) return;
    const { changedFiles, directlyAffectedFiles, transitivelyAffectedFiles } = impact;

    const relevantFiles = new Set([
      ...(changedFiles || []),
      ...(directlyAffectedFiles || []),
      ...(transitivelyAffectedFiles || []),
    ]);

    const rfNodes = [];
    relevantFiles.forEach(file => {
      let impactLevel = 'transitive';
      if (changedFiles?.includes(file)) impactLevel = 'changed';
      else if (directlyAffectedFiles?.includes(file)) impactLevel = 'direct';

      const label = file.split('/').pop();

      rfNodes.push({
        id: `file:${file}`,
        type: 'impactNode',
        data: {
          label,
          fullPath: file,
          impactLevel,
          exportBg: impactLevel === 'changed' ? '#da3633cc' : impactLevel === 'direct' ? '#d29922cc' : '#8957e5cc',
          exportBorder: impactLevel === 'changed' ? '#ff7b72' : impactLevel === 'direct' ? '#e3b341' : '#a371f7',
          exportText: '#FFFFFF',
        },
        position: { x: 0, y: 0 },
      });
    });

    const rfEdges = [];
    repo.analysis.graph.edges?.forEach(e => {
      const sourceFile = e.source.replace(/^file:/, '');
      const targetFile = e.target.replace(/^file:/, '');
      if (relevantFiles.has(sourceFile) && relevantFiles.has(targetFile)) {
        rfEdges.push({
          id: `${e.source}-${e.target}`,
          source: `file:${sourceFile}`,
          target: `file:${targetFile}`,
          type: 'default',
          animated: false,
          style: {
            stroke: '#8957e5',
            opacity: 0.7,
            strokeWidth: 2,
            strokeDasharray: '5, 5',
          },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#8957e5' },
        });
      }
    });

    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(rfNodes, rfEdges, 'TB');

    setNodes(layoutedNodes);
    setEdges(layoutedEdges);

    if (rfInstance) {
      setTimeout(() => {
        window.requestAnimationFrame(() => {
          rfInstance.fitView({ padding: 0.2, duration: 800 });
        });
      }, 50);
    }
  }, [impact, repo, rfInstance]);

  /**
   * It handles the analysis trigger, then extracts the offline downstream impact,
   * and then it applies UI toast notifications for completion or failure.
   */
  const analyzeImpact = async () => {
    if (selectedFiles.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const impactRes = await repositoryApi.getChangeImpact(repoId, selectedFiles);
      setImpact(impactRes.data);
      addToast({
        title: 'Impact Analysis Complete',
        description: `Identified ${impactRes.data.transitivelyAffectedFiles?.length || 0} transitive dependencies.`,
        type: 'success',
      });
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      addToast({
        title: 'Analysis Failed',
        description: err.response?.data?.error || err.message,
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleFile = filePath => {
    setSelectedFiles(prev => (prev.includes(filePath) ? prev.filter(f => f !== filePath) : [...prev, filePath]));
  };

  const handleSearch = useCallback(
    query => {
      setSearchQuery(query);
      if (!query) {
        setMatchedNodes([]);
        setCurrentMatchIndex(0);
        setNodes(nds =>
          nds.map(n => ({
            ...n,
            data: { ...n.data, isSearchMatch: false, isSearchActive: false },
          }))
        );
        return;
      }

      const lowerQuery = query.toLowerCase();
      const matches = nodes.filter(n => (n.data.label || '').toLowerCase().includes(lowerQuery)).map(n => n.id);

      setMatchedNodes(matches);
      const matchSet = new Set(matches);

      setNodes(nds =>
        nds.map(n => ({
          ...n,
          data: { ...n.data, isSearchMatch: matchSet.has(n.id), isSearchActive: true },
        }))
      );

      if (matches.length > 0) {
        setCurrentMatchIndex(1);
        if (rfInstance) {
          const matchNode = nodes.find(n => n.id === matches[0]);
          if (matchNode) {
            rfInstance.setCenter(matchNode.position.x + 80, matchNode.position.y + 32, { zoom: 1.2, duration: 800 });
          }
        }
      } else {
        setCurrentMatchIndex(0);
      }
    },
    [nodes, rfInstance]
  );

  const handleNextMatch = useCallback(() => {
    if (matchedNodes.length === 0) return;
    const nextIdx = currentMatchIndex >= matchedNodes.length ? 1 : currentMatchIndex + 1;
    setCurrentMatchIndex(nextIdx);

    if (rfInstance) {
      const matchNode = nodes.find(n => n.id === matchedNodes[nextIdx - 1]);
      if (matchNode) {
        rfInstance.setCenter(matchNode.position.x + 80, matchNode.position.y + 32, { zoom: 1.2, duration: 800 });
      }
    }
  }, [matchedNodes, currentMatchIndex, nodes, rfInstance]);

  const handlePrevMatch = useCallback(() => {
    if (matchedNodes.length === 0) return;
    const prevIdx = currentMatchIndex <= 1 ? matchedNodes.length : currentMatchIndex - 1;
    setCurrentMatchIndex(prevIdx);

    if (rfInstance) {
      const matchNode = nodes.find(n => n.id === matchedNodes[prevIdx - 1]);
      if (matchNode) {
        rfInstance.setCenter(matchNode.position.x + 80, matchNode.position.y + 32, { zoom: 1.2, duration: 800 });
      }
    }
  }, [matchedNodes, currentMatchIndex, nodes, rfInstance]);

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
    setMatchedNodes([]);
    setCurrentMatchIndex(0);
    setNodes(nds =>
      nds.map(n => ({
        ...n,
        data: { ...n.data, isSearchMatch: false, isSearchActive: false },
      }))
    );
  }, []);

  if (repoLoading)
    return (
      <div className="p-8 flex justify-center text-muted">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );

  if (repoError || error) {
    const errorMsg = repoError || error;
    const isNotReady = errorMsg.toLowerCase().includes('not ready') || errorMsg.toLowerCase().includes('pending');

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
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="text-center bg-panel p-8 rounded-lg shadow border border-border">
          <AlertCircle className="w-10 h-10 text-danger mx-auto mb-4 opacity-80" />
          <h2 className="text-lg font-medium text-text mb-2">Analysis Error</h2>
          <p className="text-muted mb-6 text-sm leading-relaxed">{errorMsg}</p>

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

  const fileSelectorContent = (
    <aside className="flex-1 flex flex-col bg-panel h-full p-4 overflow-hidden border-l border-border">
      <input
        type="text"
        placeholder="Search files..."
        value={searchTerm}
        onChange={e => setSearchTerm(e.target.value)}
        className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text placeholder-muted focus:outline-none focus:border-accent mb-4 shrink-0 transition-colors"
      />

      <div className="flex-1 overflow-auto custom-scrollbar border border-border rounded bg-surface py-2 mb-4">
        {fileTreeNodes.length === 0 ? (
          <div className="text-sm text-muted p-6 text-center flex flex-col items-center gap-2">
            <File className="w-6 h-6 opacity-30" />
            No files found.
          </div>
        ) : (
          <FileTree
            nodes={fileTreeNodes}
            mode="select"
            selectedFiles={selectedFiles}
            onToggleFile={toggleFile}
            searchTerm={searchTerm}
          />
        )}
      </div>

      <div className="flex flex-col gap-3 shrink-0 pt-3 border-t border-border/50">
        <div className="text-xs text-muted flex justify-between items-center bg-surface/50 p-2 rounded border border-border/30">
          <span className="font-medium text-text/80">
            {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} selected
          </span>
          {selectedFiles.length > 0 && (
            <button
              onClick={() => setSelectedFiles([])}
              className="text-danger hover:underline hover:text-danger/80 transition-colors"
            >
              Clear All
            </button>
          )}
        </div>
        <button
          onClick={() => {
            analyzeImpact();
            if (isMobile) setDrawerOpen(false);
          }}
          disabled={selectedFiles.length === 0 || loading}
          className="w-full bg-accent hover:bg-accent-hover text-text px-4 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-sm"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          {loading ? 'Calculating Blast Radius...' : 'Analyze Impact'}
        </button>
      </div>
    </aside>
  );

  const mainContent = (
    <main className="flex-1 overflow-hidden flex flex-col bg-surface/50 h-full">
      <div className="px-6 pt-6 shrink-0">
        <PageHeader
          title="Change Impact Analysis"
          description="Select files that you plan to modify. The deterministic engine will traverse the dependency graph to identify exactly which files and architectural components will be affected downstream."
          icon={Activity}
        />
      </div>
      <div className="flex-1 p-6 pt-2 h-full flex flex-col min-h-0">
        {!impact ? (
          <div className="flex-1 h-full flex flex-col items-center justify-center text-muted gap-3 bg-panel rounded border border-border border-dashed">
            <Activity className="w-10 h-10 opacity-30" />
            <p className="text-sm">Select files from the sidebar and click "Analyze Impact".</p>
            {isMobile && (
              <button
                onClick={() => setDrawerOpen(true)}
                className="flex items-center gap-2 mt-2 px-4 py-2 bg-accent/20 border border-accent/40 text-accent rounded-lg text-sm font-medium transition-colors"
              >
                <SlidersHorizontal className="w-4 h-4" /> Select Files
              </button>
            )}
          </div>
        ) : (
          <div
            ref={diagramRef}
            className="flex-1 w-full h-full bg-surface border border-border rounded shadow-inner relative overflow-hidden"
          >
            <ReactFlow
              onInit={setRfInstance}
              nodes={nodes}
              edges={edges}
              nodeTypes={impactNodeTypes}
              onNodesChange={changes => setNodes(nds => applyNodeChanges(changes, nds))}
              onNodeClick={(_, node) => setSelectedNode(node.data)}
              onPaneClick={() => setSelectedNode(null)}
              fitView
              minZoom={0.01}
              maxZoom={2}
              nodesConnectable={false}
              nodesDraggable={true}
              proOptions={{ hideAttribution: true }}
            >
              <Controls showInteractive={false} className="bg-panel border-border" />
            </ReactFlow>
            <div className="absolute top-4 right-4 z-20 flex flex-col gap-2 pointer-events-none [&>*]:pointer-events-auto items-end">
              <div className="flex items-center gap-2">
                <GraphSearchUI
                  onSearch={handleSearch}
                  onNext={handleNextMatch}
                  onPrev={handlePrevMatch}
                  onClear={handleClearSearch}
                  matchCount={searchQuery ? matchedNodes.length : null}
                  currentMatchIndex={currentMatchIndex}
                />
                <ExportDiagramButton
                  elementRef={diagramRef}
                  filename={`impact-graph-${repoId.replace(/[^a-zA-Z0-9-]/g, '_')}`}
                  availableToggles={['legend', 'controls']}
                  nodes={nodes}
                  edges={edges}
                />
              </div>
              <div className="bg-panel/90 border border-border rounded p-3 text-xs flex flex-col gap-2 backdrop-blur-sm shadow-xl w-48">
                <div className="font-semibold text-text/90 border-b border-border/50 pb-2 mb-1">Impact Legend</div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#da3633] shadow-[0_0_8px_rgba(218,54,51,0.6)]"></div> Changed
                  Files
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#d29922] shadow-[0_0_8px_rgba(210,153,34,0.6)]"></div>{' '}
                  Directly Affected
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#8957e5] shadow-[0_0_8px_rgba(137,87,229,0.6)]"></div>{' '}
                  Transitively Affected
                </div>
              </div>
            </div>

            {/* Node detail panel */}
            {selectedNode &&
              (() => {
                const srcRef = tryMakeSourceRef({ filePath: selectedNode.fullPath });
                return (
                  <div className="export-element-legend absolute bottom-4 left-4 bg-panel/95 border border-border rounded-lg p-4 shadow-2xl backdrop-blur-sm text-xs min-w-[240px] max-w-[320px]">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-semibold text-text truncate" title={selectedNode.fullPath}>
                        {selectedNode.label}
                      </span>
                      <button
                        onClick={() => setSelectedNode(null)}
                        className="text-muted hover:text-text ml-2 shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="mb-3">
                      {srcRef ? (
                        <OpenSourceButton
                          ref={srcRef}
                          label={selectedNode.fullPath}
                          className="text-muted hover:text-accent font-mono text-[10px]"
                        />
                      ) : (
                        <div className="text-muted text-[10px] font-mono">{selectedNode.fullPath}</div>
                      )}
                    </div>
                    <div className="flex flex-col gap-2">
                      {srcRef && <OpenSourceButton ref={srcRef} variant="button" label="Open in Explorer" />}
                      <Link
                        to={`/explore/${repoId}/architecture`}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-surface border border-border hover:border-accent hover:text-accent transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" /> View Architecture
                      </Link>
                      <Link
                        to={`/explore/${repoId}/health?file=${encodeURIComponent(selectedNode.fullPath)}`}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-surface border border-border hover:border-accent hover:text-accent transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" /> View Health Risks
                      </Link>
                    </div>
                  </div>
                );
              })()}
          </div>
        )}
      </div>
    </main>
  );

  if (isMobile) {
    return (
      <div className="relative flex flex-col h-full bg-surface overflow-hidden">
        {/* Main graph — full screen */}
        <div className="flex-1 overflow-hidden flex flex-col">{mainContent}</div>

        {/* Floating FAB to open the drawer when impact is already shown */}
        {impact && !drawerOpen && (
          <button
            onClick={() => setDrawerOpen(true)}
            className="absolute bottom-6 right-6 z-30 flex items-center gap-2 px-4 py-2.5 bg-accent text-text rounded-full shadow-2xl text-sm font-medium transition-colors hover:bg-accent/80"
          >
            <SlidersHorizontal className="w-4 h-4" />
            {selectedFiles.length > 0 ? `${selectedFiles.length} files` : 'Select Files'}
          </button>
        )}

        {/* Drawer Backdrop */}
        {drawerOpen && (
          <div className="absolute inset-0 z-40 bg-black/50 backdrop-blur-[2px]" onClick={() => setDrawerOpen(false)} />
        )}

        {/* Drawer Panel — slides in from right */}
        <div
          className={`absolute top-0 bottom-0 right-0 z-50 w-[90%] max-w-[360px] bg-panel border-l border-border shadow-2xl transition-transform duration-300 ease-in-out flex flex-col ${drawerOpen ? 'translate-x-0' : 'translate-x-full'}`}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
            <span className="text-sm font-semibold text-text flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-accent" /> Files to Modify
            </span>
            <button onClick={() => setDrawerOpen(false)} className="text-muted hover:text-text">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-hidden">{fileSelectorContent}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-surface">
      <ResizableLayout
        panels={[
          {
            id: 'impact-results',
            defaultSize: 70,
            minWidth: 400,
            content: mainContent,
          },
          {
            id: 'file-selector',
            defaultSize: 30,
            minWidth: 250,
            collapsible: true,
            collapseDirection: 'right',
            title: 'Files to Modify',
            icon: <CheckSquare />,
            content: fileSelectorContent,
          },
        ]}
      />
    </div>
  );
}
