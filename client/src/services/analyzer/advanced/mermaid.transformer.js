export function toMermaid(model) {
  if (!model || (!model.components?.length && !model.relations?.length)) {
    return 'flowchart TD\n  Empty[No architecture data available]';
  }

  const lines = ['flowchart TD'];
  
  // Safe ID generator
  const safeId = (id) => {
    if (!id) return 'unknown';
    // Replace non-alphanumeric chars with underscore, ensure it starts with a letter
    const safe = id.replace(/[^a-zA-Z0-9_]/g, '_');
    return /^[a-zA-Z]/.test(safe) ? safe : `n_${safe}`;
  };

  const components = model.components || [];
  const relations = model.relations || [];
  const violations = model.violations || [];

  // 1. Group components by layer
  const layers = {};
  const allNodes = new Set();
  
  components.forEach(comp => {
    const label = comp.data?.label ?? comp.id;
    const layer = comp.data?.layer ?? comp.layer ?? 'Unknown';
    if (!layers[layer]) layers[layer] = [];
    layers[layer].push({ id: label, health: comp.health });
    allNodes.add(label);
  });

  // Extract external nodes from relations
  const externals = new Set();
  relations.forEach(rel => {
    if (rel.targetType === 'external' && !allNodes.has(rel.target)) {
      externals.add(rel.target);
      allNodes.add(rel.target);
    }
  });

  // 2. Render subgraphs for each layer
  Object.keys(layers).sort().forEach(layer => {
    lines.push(`  subgraph ${safeId(layer)} [${layer}]`);
    layers[layer].forEach(comp => {
      // Show severity if not healthy
      let label = comp.id;
      if (comp.health && comp.health.severity !== 'healthy') {
        label = `${comp.id} (⚠️ ${comp.health.severity})`;
      }
      lines.push(`    ${safeId(comp.id)}["${label}"]`);
    });
    lines.push(`  end`);
  });

  if (externals.size > 0) {
    lines.push(`  subgraph Externals [External Dependencies]`);
    externals.forEach(ext => {
      lines.push(`    ${safeId(ext)}["${ext}"]`);
    });
    lines.push(`  end`);
  }

  // 3. Render edges
  const edgeViolations = new Set();
  violations.forEach(v => {
    edgeViolations.add(`${v.sourceComponent}->${v.targetComponent}`);
  });

  let edgeCount = 0;
  relations.forEach(rel => {
    const sourceId = safeId(rel.source);
    const targetId = safeId(rel.target);
    
    // Only add if source and target actually exist in nodes
    if (allNodes.has(rel.source) && allNodes.has(rel.target)) {
      const isViolating = edgeViolations.has(`${rel.source}->${rel.target}`);
      const edgeLabel = rel.type ? `|"${rel.type}"|` : '';
      
      lines.push(`  ${sourceId} -->${edgeLabel} ${targetId}`);
      
      if (isViolating) {
        lines.push(`  linkStyle ${edgeCount} stroke:#ff7b72,stroke-width:2px,color:#ff7b72;`);
      }
      edgeCount++;
    }
  });

  // 4. Styling classes
  lines.push('');
  lines.push('  classDef default fill:#1f6feb55,stroke:#388bfd66,stroke-width:1px,color:#CBD5E8;');
  lines.push('  classDef external fill:#da363355,stroke:#ff7b7266,stroke-width:1px,color:#CBD5E8,rx:16,ry:16;');
  lines.push('  classDef violating fill:#3d1a1acc,stroke:#ff7b72,stroke-width:2px,color:#CBD5E8;');
  
  if (externals.size > 0) {
    const extList = Array.from(externals).map(safeId).join(',');
    lines.push(`  class ${extList} external;`);
  }
  
  const violatingNodes = new Set();
  violations.forEach(v => {
    violatingNodes.add(safeId(v.sourceComponent));
    violatingNodes.add(safeId(v.targetComponent));
  });
  
  if (violatingNodes.size > 0) {
    const violList = Array.from(violatingNodes).filter(n => {
      // Don't override external class
      return !externals.has(Array.from(externals).find(e => safeId(e) === n));
    }).join(',');
    if (violList.length > 0) {
      lines.push(`  class ${violList} violating;`);
    }
  }

  return lines.join('\n');
}
