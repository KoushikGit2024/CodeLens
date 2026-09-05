import dagre from 'dagre';

export const NODE_W = 150;
export const NODE_H = 34;
export const PKG_W  = 110;
export const PKG_H  = 30;

export const DIR_PALETTE = [
  '#1f6feb', '#2ea043', '#d29922', '#da3633', '#8957e5',
  '#0096c7', '#e85d04', '#06d6a0', '#ef476f', '#ffd166',
  '#118ab2', '#7209b7',
];

export function couplingColor(degree, maxDegree) {
  if (maxDegree === 0) return '#1f6feb';
  const t = Math.min(degree / maxDegree, 1);
  if (t < 0.4) return `hsl(${210 - t * 60 / 0.4}, 70%, 55%)`; 
  if (t < 0.7) return `hsl(${150 - (t - 0.4) * 110 / 0.3}, 70%, 50%)`;
  return `hsl(${40 - (t - 0.7) * 130 / 0.3}, 80%, 50%)`; 
}

export function getDir(filePath) {
  if (!filePath) return '(root)';
  const parts = filePath.split('/');
  return parts.length > 1 ? parts.slice(0, -1).join('/') : '(root)';
}

export function getDagreLayout(nodes, edges, direction = 'LR') {
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

export function getForceLayout(nodes) {
  return nodes.map(n => ({
    ...n,
    position: { 
      x: (Math.random() - 0.5) * 600, 
      y: (Math.random() - 0.5) * 600 
    }
  }));
}

export function getClusteredLayout(fileNodes, edges, dirColorMap) {
  const groups = {};
  for (const n of fileNodes) {
    const d = n.data.dir || '(root)';
    if (!groups[d]) groups[d] = [];
    groups[d].push(n);
  }

  const PAD = 16, GAP_X = 10, GAP_Y = 10, GROUP_GAP_X = 60, GROUP_GAP_Y = 60;
  const HEADER_H = 24;
  function optCols(count) { return Math.min(6, Math.max(1, Math.round(Math.sqrt(count)))); }

  const sortedDirs = Object.keys(groups).sort();
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

  let colX = [0, 0];
  let colY = [0, 0];
  const groupPositions = {};

  builtGroups.forEach((g, idx) => {
    const col = idx % GROUP_COLS;
    groupPositions[g.dir] = { x: colX[col], y: colY[col] };
    colY[col] += g.gH + GROUP_GAP_Y;
    if (col === 0) colX[1] = Math.max(colX[1], g.gW + GROUP_GAP_X);
  });

  const groupNodes = [];
  const positionedNodes = [];

  builtGroups.forEach(({ dir, members, cols, gW, gH, color }) => {
    const { x: gx, y: gy } = groupPositions[dir];
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

    members.forEach((n, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      positionedNodes.push({
        ...n,
        position: {
          x: gx + PAD + col * (NODE_W + GAP_X),
          y: gy + HEADER_H + PAD + row * (NODE_H + GAP_Y),
        },
      });
    });
  });

  return [...groupNodes, ...positionedNodes];
}

export function graphToFlow(graph, selectedId, showExternalPackages, layoutType) {
  let fileNodes = graph.nodes.filter(n => n.type === 'file');
  let pkgNodes = showExternalPackages ? graph.nodes.filter(n => n.type === 'package') : [];
  const renderableNodes = [...fileNodes, ...pkgNodes];
  const nodeIds = new Set(renderableNodes.map(n => n.id));
  
  const edgesToRender = graph.edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));

  const degreeMap = new Map();
  for (const e of edgesToRender) {
    degreeMap.set(e.source, (degreeMap.get(e.source) || 0) + 1);
    degreeMap.set(e.target, (degreeMap.get(e.target) || 0) + 1);
  }
  const maxDegree = degreeMap.size === 0 ? 0 : Math.max(...Array.from(degreeMap.values()));

  const dirs = [...new Set(fileNodes.map(n => getDir(n.filePath)))].sort();
  const dirColorMap = new Map(dirs.map((d, i) => [d, DIR_PALETTE[i % DIR_PALETTE.length]]));

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
        dir, shortDir,
        dirColor: dirColorMap.get(dir),
        heatColor: couplingColor(degree, maxDegree),
        degree, isFaded,
        isFocused: n.id === selectedId,
        isCycling: graph.cycles?.some(cycle => cycle.includes(n.id)) || false,
        isIsolated: graph.isolatedFiles?.includes(n.id) || false,
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
        degree, isFaded,
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

    const strokeColor = isFaded ? '#ffffff08' : isDirect ? '#58a6ff' : sameDir ? '#7d8590' : '#58a6ff55';
    const strokeWidth = isFaded ? 0.5 : isDirect ? 2 : 0.8;
    const opacity = isFaded ? 0.08 : isDirect ? 1 : sameDir ? 0.35 : 0.45;

    return {
      id: `${e.source}->${e.target}`,
      source: e.source,
      target: e.target,
      type: 'spring',
      animated: isDirect,
      style: { stroke: strokeColor, strokeWidth, strokeDasharray: isCjs ? '5 3' : undefined, opacity },
      markerEnd: isDirect || !isFaded ? {
        type: 'arrowclosed',
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
    const positionedPkgNodes = rfPkgNodes.map((n, i) => ({
      ...n,
      position: { x: i * (PKG_W + 20), y: 1200 },
    }));
    return { rfNodes: [...layouted, ...positionedPkgNodes], rfEdges, dirColorMap };
  } else if (layoutType === 'force') {
    const allRfNodes = [...rfFileNodes, ...rfPkgNodes];
    return { rfNodes: getForceLayout(allRfNodes), rfEdges, dirColorMap };
  } else {
    const allRfNodes = [...rfFileNodes, ...rfPkgNodes];
    return { rfNodes: getDagreLayout(allRfNodes, rfEdges, 'LR'), rfEdges, dirColorMap };
  }
}