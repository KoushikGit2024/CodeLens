/**
 * graphUtils.js
 *
 * It initiates the layout algorithms, then extracts the specific node topologies,
 * and then it applies the geometric coordinates for the React Flow canvas.
 */
import dagre from 'dagre';

export const NODE_W = 150;
export const NODE_H = 34;
export const PKG_W = 110;
export const PKG_H = 30;

export const DIR_PALETTE = [
  '#1f6feb',
  '#2ea043',
  '#d29922',
  '#da3633',
  '#8957e5',
  '#0096c7',
  '#e85d04',
  '#06d6a0',
  '#ef476f',
  '#ffd166',
  '#118ab2',
  '#7209b7',
];

/**
 * It evaluates the node degree, then extracts a normalized ratio against the maximum,
 * and then it applies a color gradient ranging from cool blue to hot orange.
 */
export function couplingColor(degree, maxDegree) {
  if (maxDegree === 0) return '#1f6feb';
  const t = Math.min(degree / maxDegree, 1);
  if (t < 0.4) return `hsl(${210 - (t * 60) / 0.4}, 70%, 55%)`;
  if (t < 0.7) return `hsl(${150 - ((t - 0.4) * 110) / 0.3}, 70%, 50%)`;
  return `hsl(${40 - ((t - 0.7) * 130) / 0.3}, 80%, 50%)`;
}

/**
 * It processes the file path string, then extracts the directory segments,
 * and then it applies a fallback string for root-level files.
 */
export function getDir(filePath) {
  if (!filePath) return '(root)';
  const parts = filePath.split('/');
  return parts.length > 1 ? parts.slice(0, -1).join('/') : '(root)';
}

/**
 * It initializes the Dagre engine, then extracts the edge configurations,
 * and then it applies the hierarchical positioning to the node array.
 */
export function getDagreLayout(nodes, edges, direction = 'LR') {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, ranksep: 50, nodesep: 20, edgesep: 10 });

  nodes.forEach(n =>
    g.setNode(n.id, {
      width: parseInt(n.style?.width ?? n.width ?? NODE_W, 10),
      height: parseInt(n.style?.height ?? n.height ?? NODE_H, 10),
    })
  );

  edges.forEach(e => g.setEdge(e.source, e.target));
  dagre.layout(g);

  return nodes.map(n => {
    const pos = g.node(n.id);
    const w = parseInt(n.style?.width ?? n.width ?? NODE_W, 10);
    const h = parseInt(n.style?.height ?? n.height ?? NODE_H, 10);
    return { ...n, position: { x: pos.x - w / 2, y: pos.y - h / 2 } };
  });
}

/**
 * It iterates over the node array, then extracts a random bounded coordinate,
 * and then it applies it as the initial starting point for the physics simulation.
 */
export function getClassicForceLayout(nodes, isDots = false) {
  const stepR = isDots ? 26 : 90;
  return nodes.map((n, i) => {
    const angle = i * 2.399963; // Golden angle spiral
    const r = stepR * Math.sqrt(i + 0.5);
    return {
      ...n,
      position: {
        x: Math.round(r * Math.cos(angle)),
        y: Math.round(r * Math.sin(angle)),
      },
    };
  });
}

export function getIslandForceLayout(nodes, isDots = false) {
  // Group nodes by directory
  const dirGroups = new Map();
  nodes.forEach(n => {
    const dir = n.dir || n.data?.dir || '(root)';
    if (!dirGroups.has(dir)) dirGroups.set(dir, []);
    dirGroups.get(dir).push(n);
  });

  const dirs = Array.from(dirGroups.keys());
  const numDirs = dirs.length;

  // Position cluster centers in an archipelago ring scaled for cards vs dots
  const clusterCenters = new Map();
  const baseRadius = isDots
    ? Math.max(140, Math.sqrt(nodes.length) * 32)
    : Math.max(450, Math.sqrt(nodes.length) * 110);

  dirs.forEach((dir, i) => {
    const angle = (2 * Math.PI * i) / (numDirs || 1);
    clusterCenters.set(dir, {
      x: Math.round(baseRadius * Math.cos(angle)),
      y: Math.round(baseRadius * Math.sin(angle)),
    });
  });

  return nodes.map(n => {
    const dir = n.dir || n.data?.dir || '(root)';
    const center = clusterCenters.get(dir) || { x: 0, y: 0 };
    const members = dirGroups.get(dir) || [n];
    const memberIdx = members.indexOf(n);
    const subAngle = memberIdx * 2.399963;
    const subRadius = isDots
      ? Math.min(55, 11 * Math.sqrt(memberIdx + 1))
      : Math.min(220, 36 * Math.sqrt(memberIdx + 1));

    return {
      ...n,
      position: {
        x: Math.round(center.x + subRadius * Math.cos(subAngle)),
        y: Math.round(center.y + subRadius * Math.sin(subAngle)),
      },
    };
  });
}

export function getForceLayout(nodes, mode = 'classic', nodeStyle = 'cards') {
  const isDots = nodeStyle === 'dots';
  if (mode === 'islands') {
    return getIslandForceLayout(nodes, isDots);
  }
  return getClassicForceLayout(nodes, isDots);
}

/**
 * Custom d3-force that gently pulls nodes belonging to the same folder
 * toward their group centroid, forming natural visual constellations.
 */
export function forceCluster(strength = 0.35, clusterGap = 350) {
  let nodes = [];

  function force(alpha) {
    if (alpha <= 0) return;
    const centroids = new Map();

    // 1. Compute directory centroids
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (!n.dir || n.dir === '(root)') continue;
      let c = centroids.get(n.dir);
      if (!c) {
        c = { x: 0, y: 0, count: 0 };
        centroids.set(n.dir, c);
      }
      c.x += n.x;
      c.y += n.y;
      c.count += 1;
    }

    // 2. Intra-cluster attraction: pull nodes toward their directory centroid
    const pullFactor = strength * Math.max(0.25, alpha);
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (!n.dir || n.dir === '(root)') continue;
      const c = centroids.get(n.dir);
      if (c && c.count > 1) {
        const cx = c.x / c.count;
        const cy = c.y / c.count;
        n.vx += (cx - n.x) * pullFactor;
        n.vy += (cy - n.y) * pullFactor;
      }
    }

    // 3. Inter-cluster repulsion: keep distinct directory islands pushed apart with wide ocean channels
    const dirEntries = Array.from(centroids.entries());
    const repulseAlpha = Math.max(0.2, alpha) * 0.35;
    for (let i = 0; i < dirEntries.length; i++) {
      for (let j = i + 1; j < dirEntries.length; j++) {
        const [dirA, cA] = dirEntries[i];
        const [dirB, cB] = dirEntries[j];
        if (cA.count === 0 || cB.count === 0) continue;

        const ax = cA.x / cA.count;
        const ay = cA.y / cA.count;
        const bx = cB.x / cB.count;
        const by = cB.y / cB.count;

        const dx = bx - ax;
        const dy = by - ay;
        const dist = Math.hypot(dx, dy) || 1;

        if (dist < clusterGap) {
          const push = ((clusterGap - dist) / dist) * repulseAlpha;
          const px = dx * push;
          const py = dy * push;

          for (let k = 0; k < nodes.length; k++) {
            const n = nodes[k];
            if (n.dir === dirA) {
              n.vx -= px;
              n.vy -= py;
            } else if (n.dir === dirB) {
              n.vx += px;
              n.vy += py;
            }
          }
        }
      }
    }
  }

  force.initialize = function (initialNodes) {
    nodes = initialNodes;
  };

  return force;
}

/**
 * It groups nodes by directory, then extracts grid boundaries for each cluster,
 * and then it applies absolute coordinate positioning to visually separate folders.
 */
export function getClusteredLayout(fileNodes, _edges, dirColorMap, pkgNodes = []) {
  const groups = {};
  for (const n of fileNodes) {
    const d = n.data.dir || '(root)';
    if (!groups[d]) groups[d] = [];
    groups[d].push(n);
  }

  const PAD = 16,
    GAP_X = 10,
    GAP_Y = 10,
    GROUP_GAP_X = 60,
    GROUP_GAP_Y = 60;
  const HEADER_H = 24;
  function optCols(count) {
    return Math.min(6, Math.max(1, Math.round(Math.sqrt(count))));
  }

  function optPkgCols(count) {
    if (count <= 2) return 1;
    if (count <= 6) return 2;
    if (count <= 18) return 3;
    return 4;
  }

  const sortedDirs = Object.keys(groups).sort();
  const GROUP_COLS = 2;

  const builtGroups = sortedDirs.map(dir => {
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

  // Position External Packages in their own dedicated group cluster on the right
  if (pkgNodes && pkgNodes.length > 0) {
    const maxX = builtGroups.length > 0 ? Math.max(...builtGroups.map(g => groupPositions[g.dir].x + g.gW)) : 0;
    const pkgGx = maxX > 0 ? maxX + 80 : 0;
    const pkgGy = 0;
    const pkgCols = optPkgCols(pkgNodes.length);
    const pkgRows = Math.ceil(pkgNodes.length / pkgCols);
    const pkgGW = pkgCols * (PKG_W + GAP_X) - GAP_X + PAD * 2;
    const pkgGH = pkgRows * (PKG_H + GAP_Y) - GAP_Y + PAD * 2 + HEADER_H;
    const pkgColor = '#d29922';

    groupNodes.push({
      id: '__group__external_packages',
      type: 'group',
      data: { label: 'External Packages', color: pkgColor },
      position: { x: pkgGx, y: pkgGy },
      style: { width: pkgGW, height: pkgGH, pointerEvents: 'none' },
      selectable: false,
      draggable: false,
      zIndex: -100,
    });

    pkgNodes.forEach((n, i) => {
      const col = i % pkgCols;
      const row = Math.floor(i / pkgCols);
      positionedNodes.push({
        ...n,
        position: {
          x: pkgGx + PAD + col * (PKG_W + GAP_X),
          y: pkgGy + HEADER_H + PAD + row * (PKG_H + GAP_Y),
        },
      });
    });
  }

  return [...groupNodes, ...positionedNodes];
}

/**
 * It maps the raw analysis nodes to the visual schema, then extracts the coupling metrics,
 * and then it applies fading logic and routing to the selected layout generator.
 */
export function graphToFlow(graph, selectedId, showExternalPackages, layoutType, edgeStyle = 'spring', options = {}) {
  const {
    showChurn = false,
    churnData = null,
    onSelect = null,
    forceNodeStyle = 'cards',
    forceGrouping = 'classic',
  } = options;

  let fileNodes = graph.nodes.filter(n => n.type === 'fileNode' || n.type === 'file');
  let pkgNodes = showExternalPackages ? graph.nodes.filter(n => n.type === 'moduleNode' || n.type === 'package') : [];
  const renderableNodes = [...fileNodes, ...pkgNodes];
  const nodeIds = new Set(renderableNodes.map(n => n.id));

  const edgesToRender = graph.edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));

  // 1. Internal file-to-file coupling metrics (strictly invariant of whether external packages are shown)
  const fileNodeIds = new Set(fileNodes.map(n => n.id));
  const internalFileEdges = graph.edges.filter(e => fileNodeIds.has(e.source) && fileNodeIds.has(e.target));
  const internalDegreeMap = new Map();
  for (const e of internalFileEdges) {
    internalDegreeMap.set(e.source, (internalDegreeMap.get(e.source) || 0) + 1);
    internalDegreeMap.set(e.target, (internalDegreeMap.get(e.target) || 0) + 1);
  }
  const maxFileDegree = internalDegreeMap.size === 0 ? 0 : Math.max(...Array.from(internalDegreeMap.values()));

  // 2. Total visible renderable degree for edge routing and package counts
  const degreeMap = new Map();
  for (const e of edgesToRender) {
    degreeMap.set(e.source, (degreeMap.get(e.source) || 0) + 1);
    degreeMap.set(e.target, (degreeMap.get(e.target) || 0) + 1);
  }

  const dirs = [...new Set(fileNodes.map(n => getDir(n.data?.filePath || n.filePath)))].sort();
  const dirColorMap = new Map(dirs.map((d, i) => [d, DIR_PALETTE[i % DIR_PALETTE.length]]));
  if (showExternalPackages && pkgNodes.length > 0) {
    dirColorMap.set('External Packages', '#d29922');
  }

  const connectedNodes = new Set();
  if (selectedId) {
    connectedNodes.add(selectedId);
    for (const e of edgesToRender) {
      if (e.source === selectedId) connectedNodes.add(e.target);
      if (e.target === selectedId) connectedNodes.add(e.source);
    }
  }

  const dirMap = new Map();
  for (const n of fileNodes) {
    dirMap.set(n.id, getDir(n.data?.filePath || n.filePath));
  }

  const cycleSet = new Set((graph.cycles || []).flat());
  const isoSet = new Set(graph.isolatedFiles || []);

  const isDotMode = layoutType === 'force' && forceNodeStyle === 'dots';

  const rfFileNodes = fileNodes.map(n => {
    const rawPath = n.data?.filePath || n.filePath || '';
    const dir = getDir(rawPath);
    const shortDir = dir === '(root)' ? '' : dir.split('/').pop();
    // Internal file degree is stable and does NOT fluctuate with external packages
    const internalDegree = internalDegreeMap.get(n.id) || 0;
    const isFaded = selectedId ? !connectedNodes.has(n.id) : false;

    // Churn data keyed by filePath (without the 'file:' prefix)
    const churnScore = churnData?.churnScores?.[rawPath] || 0;
    const compositeRisk = n.data?.metrics?.compositeRisk || churnScore;

    const dotR = Math.max(6, Math.min(18, Math.round(5 + Math.sqrt(internalDegree) * 2.2)));
    const dotD = dotR * 2;

    return {
      id: n.id,
      type: isDotMode ? 'dot' : 'custom',
      data: {
        nodeId: n.id,
        onSelect,
        label: n.data?.label || rawPath.split('/').pop(),
        fullLabel: rawPath,
        nodeType: 'file',
        dir,
        shortDir,
        layout: layoutType,
        dirColor: dirColorMap.get(dir),
        heatColor: couplingColor(internalDegree, maxFileDegree),
        degree: internalDegree,
        isFaded,
        isFocused: n.id === selectedId,
        isCycling: cycleSet.has(n.id),
        isIsolated: isoSet.has(n.id),
        findingsCount: n.data?.findingsCount || { critical: 0, warning: 0 },
        healthScore: n.data?.healthScore || 100,
        // Churn overlay
        showChurn,
        churnScore,
        compositeRisk,
        forceGrouping,
        exportBg: '#1e2335',
        exportBorder: couplingColor(internalDegree, maxFileDegree) || '#343B54',
        exportText: '#CBD5E8',
      },
      style: isDotMode ? { width: dotD, height: dotD } : { width: NODE_W, height: NODE_H },
      position: { x: 0, y: 0 },
      zIndex: 2,
    };
  });

  const rfPkgNodes = pkgNodes.map(n => {
    const degree = degreeMap.get(n.id) || 0;
    const isFaded = selectedId ? !connectedNodes.has(n.id) : false;
    const pkgR = Math.max(6, Math.min(18, Math.round(5 + Math.sqrt(degree) * 2.2)));
    const pkgD = pkgR * 2;

    return {
      id: n.id,
      type: isDotMode ? 'dot' : 'custom',
      data: {
        nodeId: n.id,
        onSelect,
        label: n.data?.label || n.name || 'Unknown',
        fullLabel: n.data?.label || n.name || '',
        nodeType: 'package',
        layout: layoutType,
        heatColor: '#d29922',
        degree,
        isFaded,
        isFocused: n.id === selectedId,
        findingsCount: { critical: 0, warning: 0 },
        forceGrouping,
        exportBg: '#111318',
        exportBorder: '#d29922',
        exportText: '#e3b341',
      },
      style: isDotMode ? { width: pkgD, height: pkgD } : { width: PKG_W, height: PKG_H },
      position: { x: 0, y: 0 },
      zIndex: 2,
    };
  });

  const rfEdges = edgesToRender.map(e => {
    const isOut = selectedId && e.source === selectedId; // outgoing (this file imports target)
    const isIn = selectedId && e.target === selectedId; // incoming (target is imported by source)
    const isDirect = isOut || isIn;
    const isFaded = selectedId ? !isDirect : false;
    const isCjs = e.type === 'requires' || e.type === 'smoothstep';

    const sourceDir = dirMap.get(e.source);
    const targetDir = dirMap.get(e.target);
    const sameDir = sourceDir && targetDir && sourceDir === targetDir;

    const isForce = layoutType === 'force';
    const isIslands = isForce && forceGrouping === 'islands';

    // Outgoing = blue (#58a6ff), Incoming = green (#3fb950)
    // Unselected = neutral same-dir slate (#7d8590) or cross-dir blue (#58a6ff55)
    const strokeColor = isFaded
      ? 'rgba(128, 128, 128, 0.12)'
      : isOut
        ? '#58a6ff'
        : isIn
          ? '#3fb950'
          : sameDir
            ? '#7d8590'
            : '#58a6ff55';
    const strokeWidth = isFaded ? 0.5 : isDirect ? 2 : 0.8;
    // In islands mode, dim cross-folder background noise; in classic mode, use the original classic opacity
    const opacity = isFaded
      ? 0.12
      : isDirect
        ? 1
        : isIslands
          ? sameDir
            ? 0.5
            : 0.1
          : sameDir
            ? 0.4
            : isForce
              ? 0.25
              : 0.45;
    const isStraight = edgeStyle === 'straight' || (isIslands && isDotMode && !isDirect);

    return {
      id: `${e.source}->${e.target}`,
      source: e.source,
      target: e.target,
      type: 'spring',
      animated: isDirect,
      style: { stroke: strokeColor, strokeWidth, strokeDasharray: isCjs ? '5 3' : undefined, opacity },
      markerEnd:
        isDirect || !isFaded
          ? {
              type: 'arrowclosed',
              color: strokeColor,
              width: isDirect ? 12 : 8,
              height: isDirect ? 12 : 8,
            }
          : undefined,
      label: isCjs && isDirect ? 'cjs' : undefined,
      labelStyle: { fill: '#6e7681', fontSize: 8, fontFamily: 'monospace' },
      labelBgStyle: { fill: 'var(--color-surface, #0d1117)', fillOpacity: 0.85 },
      data: { edgeType: e.type, isStraight },
    };
  });

  if (layoutType === 'clustered') {
    const layouted = getClusteredLayout(rfFileNodes, rfEdges, dirColorMap, rfPkgNodes);
    return { rfNodes: layouted, rfEdges, dirColorMap };
  } else if (layoutType === 'force') {
    const allRfNodes = [...rfFileNodes, ...rfPkgNodes];
    return { rfNodes: getForceLayout(allRfNodes, forceGrouping, forceNodeStyle), rfEdges, dirColorMap };
  } else {
    const allRfNodes = [...rfFileNodes, ...rfPkgNodes];
    return { rfNodes: getDagreLayout(allRfNodes, rfEdges, 'LR'), rfEdges, dirColorMap };
  }
}
