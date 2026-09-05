import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Activity, CheckSquare, Loader2, GitCommit } from 'lucide-react';
import { repositoryApi } from '../../shared/api';
import { useRepository } from '../../shared/context/RepositoryContext';
import PageHeader from '../../shared/components/PageHeader';
import { ResizableLayout } from '../../shared/components/ResizableLayout';
import ReactFlow, { 
  Controls, 
  MiniMap, 
  MarkerType, 
  Handle, 
  Position,
  applyNodeChanges 
} from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from 'dagre';
import { FileTree } from '../explorer/FileTree';

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
    ranker: 'network-simplex' 
  });

  const nodeWidth = 160;
  const nodeHeight = 65;

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
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

  const sortedYs = Object.keys(ranks).map(Number).sort((a, b) => a - b);
  
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
      if (rankNodes[i].dagreX - rankNodes[i-1].dagreX > CLUSTER_THRESHOLD) {
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
        const subGroupWidth = (subGroup.length * nodeWidth) + ((subGroup.length - 1) * X_GAP);
        const startX = clusterCenterX - (subGroupWidth / 2) + (nodeWidth / 2);

        subGroup.forEach((node, index) => {
          const { dagreX, dagreY, ...cleanNode } = node; 
          
          finalNodes.push({
            ...cleanNode,
            targetPosition: direction === 'TB' ? Position.Top : Position.Left,
            sourcePosition: direction === 'TB' ? Position.Bottom : Position.Right,
            position: {
              x: (startX + index * (nodeWidth + X_GAP)) - (nodeWidth / 2),
              y: (node.dagreY + totalYShift + clusterYShift) - (nodeHeight / 2),
            }
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
const ImpactNode = ({ data }) => {
  const isChanged = data.impactLevel === 'changed';
  const isDirect = data.impactLevel === 'direct';
  
  const bg = isChanged ? '#da3633cc' : isDirect ? '#d29922cc' : '#8957e5cc';
  const border = isChanged ? '#ff7b72' : isDirect ? '#e3b341' : '#a371f7';
  
  return (
    <div
      style={{
        width: 160,
        borderRadius: 8,
        border: `2px solid ${border}`,
        background: bg,
        backdropFilter: 'blur(6px)',
        padding: '10px',
        color: '#CBD5E8',
        fontFamily: 'monospace',
        fontSize: '11px',
        boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div style={{ padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 1 }}>
        <div style={{ fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={data.label}>
          {data.label}
        </div>
        <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
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
  const { repo, loading: repoLoading, error: repoError } = useRepository();
  const [impact, setImpact] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [selectedFiles, setSelectedFiles] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [rfInstance, setRfInstance] = useState(null);

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

    const convertMapToArray = (map) => {
      return Object.values(map.children || {}).map(node => {
        if (node.type === 'directory') {
          return { ...node, children: convertMapToArray(node) };
        }
        return node;
      }).sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    };

    return convertMapToArray(treeMap);
  }, [repo]);

  useEffect(() => {
    if (!impact || !repo?.analysis?.graph) return;
    const { changedFiles, directlyAffectedFiles, transitivelyAffectedFiles } = impact;
    
    const relevantFiles = new Set([
      ...(changedFiles || []),
      ...(directlyAffectedFiles || []),
      ...(transitivelyAffectedFiles || [])
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
        data: { label, fullPath: file, impactLevel },
        position: { x: 0, y: 0 } 
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
            strokeDasharray: '5, 5' 
          },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#8957e5' }
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

  const analyzeImpact = async () => {
    if (selectedFiles.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const impactRes = await repositoryApi.getChangeImpact(repoId, selectedFiles);
      setImpact(impactRes.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleFile = (filePath) => {
    setSelectedFiles(prev => 
      prev.includes(filePath) ? prev.filter(f => f !== filePath) : [...prev, filePath]
    );
  };

  if (repoLoading) return <div className="p-8 text-white">Loading repository data...</div>;
  if (repoError) return <div className="p-8 text-red-400">Error: {repoError}</div>;

  return (
    <div className="flex flex-col h-full bg-surface">
      <ResizableLayout
        panels={[
          {
            id: 'impact-results',
            defaultSize: 70,
            minWidth: 400,
            content: (
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
                    <div className="flex-1 h-full flex flex-col items-center justify-center text-muted gap-3">
                      <Activity className="w-8 h-8 opacity-50" />
                      <p className="text-sm">Select files from the sidebar and click "Analyze Impact".</p>
                    </div>
                  ) : (
                    <div className="flex-1 w-full h-full bg-surface border border-border shadow-inner relative overflow-hidden">
                      <ReactFlow
                        onInit={setRfInstance}
                        nodes={nodes}
                        edges={edges}
                        nodeTypes={impactNodeTypes}
                        onNodesChange={(changes) => setNodes((nds) => applyNodeChanges(changes, nds))}
                        fitView
                        minZoom={0.01} // FIX: Lowered drastically to allow massive graphs to zoom out fully
                        maxZoom={2}
                        nodesConnectable={false}
                        nodesDraggable={true} 
                        proOptions={{ hideAttribution: true }}
                      >
                        <Controls showInteractive={false} />
                      </ReactFlow>
                      <div className="absolute top-4 right-4 bg-panel/90 border border-border rounded p-3 text-xs flex flex-col gap-2 backdrop-blur-sm shadow-xl">
                        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[#da3633]"></div> Changed Files</div>
                        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[#d29922]"></div> Directly Affected</div>
                        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-[#8957e5]"></div> Transitively Affected</div>
                      </div>
                    </div>
                )}
                </div>
              </main>
            )
          },
          {
            id: 'file-selector',
            defaultSize: 30,
            minWidth: 250,
            collapsible: true,
            collapseDirection: 'right',
            title: 'Files to Modify',
            icon: <CheckSquare />,
            content: (
              <aside className="flex-1 flex flex-col bg-panel h-full p-4 overflow-hidden">
                <input 
                  type="text"
                  placeholder="Search files..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-surface border border-border rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-accent mb-4 shrink-0"
                />
                
                <div className="flex-1 overflow-auto custom-scrollbar border border-border rounded bg-surface py-2 mb-4">
                  {fileTreeNodes.length === 0 ? (
                    <div className="text-sm text-muted p-2 text-center">No files found.</div>
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
                
                <div className="flex flex-col gap-3 shrink-0 pt-2 border-t border-border">
                  <div className="text-xs text-muted flex justify-between">
                    <span>{selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} selected</span>
                    {selectedFiles.length > 0 && (
                      <button onClick={() => setSelectedFiles([])} className="text-accent hover:underline">Clear</button>
                    )}
                  </div>
                  <button 
                    onClick={analyzeImpact}
                    disabled={selectedFiles.length === 0 || loading}
                    className="w-full bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                  >
                    {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                    Analyze Impact
                  </button>
                  {error && <div className="p-2 bg-danger/10 text-danger text-xs rounded border border-danger/20">{error}</div>}
                </div>
              </aside>
            )
          }
        ]}
      />
    </div>
  );
}