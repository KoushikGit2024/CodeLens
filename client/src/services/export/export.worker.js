/* eslint-env worker */

/**
 * Web Worker for generating native SVG strings from React Flow graph data.
 * This runs entirely off the main thread and avoids DOM-blocking `html-to-image` calls.
 * Because it generates native SVG `<rect>`, `<path>`, and `<text>` elements,
 * it solves the <foreignObject> text rendering limitations of standard DOM-to-SVG converters.
 */

self.onmessage = function (e) {
  const { nodes, edges, bounds, options } = e.data;
  
  try {
    const svgString = generateNativeSVG(nodes, edges, bounds, options);
    self.postMessage({ success: true, svgString });
  } catch (error) {
    self.postMessage({ success: false, error: error.message });
  }
};

function generateNativeSVG(nodes, edges, bounds, options) {
  const { includeBackground, backgroundColor = '#0C0E14' } = options;
  
  // Padding for the final SVG
  const padding = 50;
  const width = bounds.width + padding * 2;
  const height = bounds.height + padding * 2;
  const offsetX = -bounds.x + padding;
  const offsetY = -bounds.y + padding;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`;

  // 1. Background
  if (includeBackground) {
    svg += `<rect width="${width}" height="${height}" fill="${backgroundColor}" />`;
  }

  // Define some common styles / markers
  svg += `<defs>
    <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="#4D7EFF" opacity="0.6"/>
    </marker>
  </defs>`;

  // 2. Render Edges (Paths)
  svg += `<g id="edges">`;
  edges.forEach(edge => {
    // If the edge has bezier control points, we'd need them. 
    // Since we don't have React Flow's internal path generator here, 
    // we'll draw a simple straight line between source and target node centers.
    
    const sourceNode = nodes.find(n => n.id === edge.source);
    const targetNode = nodes.find(n => n.id === edge.target);
    
    if (sourceNode && targetNode) {
      const sx = sourceNode.position.x + (sourceNode.width || 150) / 2 + offsetX;
      const sy = sourceNode.position.y + (sourceNode.height || 40) / 2 + offsetY;
      const tx = targetNode.position.x + (targetNode.width || 150) / 2 + offsetX;
      const ty = targetNode.position.y + (targetNode.height || 40) / 2 + offsetY;

      svg += `<path d="M ${sx} ${sy} L ${tx} ${ty}" stroke="#4D7EFF" stroke-width="1.5" fill="none" opacity="0.6" marker-end="url(#arrowhead)" />`;
    }
  });
  svg += `</g>`;

  // 3. Render Nodes
  svg += `<g id="nodes">`;
  nodes.forEach(node => {
    const x = node.position.x + offsetX;
    const y = node.position.y + offsetY;
    const w = node.width || 150;
    const h = node.height || 40;
    
    // Determine colors based on node type or data
    let bgColor = node.data?.exportBg || '#1E2335';
    let borderColor = node.data?.exportBorder || '#343B54';
    let textColor = node.data?.exportText || '#FFFFFF';

    // Base opaque plate to block edges from showing through transparent nodes
    svg += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" ry="6" fill="${backgroundColor}" />`;
    // Node Box
    svg += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" ry="6" fill="${bgColor}" stroke="${borderColor}" stroke-width="1" />`;
    
    // Node Text
    const label = node.data?.label || node.data?.name || node.id;
    // Basic text truncation for SVG
    const maxChars = Math.max(10, Math.floor(w / 7));
    const displayLabel = label.length > maxChars ? label.substring(0, maxChars - 3) + '...' : label;

    svg += `<text x="${x + w/2}" y="${y + h/2}" font-family="sans-serif" font-size="12" fill="${textColor}" text-anchor="middle" dominant-baseline="middle">${displayLabel}</text>`;
  });
  svg += `</g>`;

  svg += `</svg>`;
  return svg;
}
