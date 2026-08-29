'use strict';

/**
 * mermaidGenerator.js
 * 
 * Takes an ArchitectureModel and produces Mermaid `flowchart TD` strings.
 */

function sanitizeId(name) {
  return name.replace(/[^a-zA-Z0-9_]/g, '_');
}

function generateSystemOverview(model) {
  const lines = ['flowchart TD'];

  // Add nodes
  for (const comp of model.components) {
    const id = sanitizeId(comp.name);
    // Escape quotes in name
    const label = comp.name.replace(/"/g, "'");
    lines.push(`    ${id}["${label}"]`);
    
    // Style by layer if available
    if (comp.layer === 'Presentation') {
      lines.push(`    style ${id} fill:#2b7489,stroke:#fff`);
    } else if (comp.layer === 'API') {
      lines.push(`    style ${id} fill:#8b5cf6,stroke:#fff`);
    } else if (comp.layer === 'Service') {
      lines.push(`    style ${id} fill:#059669,stroke:#fff`);
    } else if (comp.layer === 'Data') {
      lines.push(`    style ${id} fill:#b91c1c,stroke:#fff`);
    } else {
      lines.push(`    style ${id} fill:#1f6feb,stroke:#fff`);
    }
  }

  // Add external packages
  const externalPkgs = new Set();
  for (const rel of model.relations) {
    if (rel.targetType === 'external') {
      externalPkgs.add(rel.target);
    }
  }

  for (const pkg of externalPkgs) {
    const id = sanitizeId(pkg);
    const label = pkg.replace(/"/g, "'");
    lines.push(`    ${id}["📦 ${label}"]`);
    lines.push(`    style ${id} fill:#d29922,stroke:#fff`);
  }

  // Add edges
  for (const rel of model.relations) {
    const srcId = sanitizeId(rel.source);
    const tgtId = sanitizeId(rel.target);
    lines.push(`    ${srcId} --> ${tgtId}`);
  }

  // Handle case where graph is empty
  if (lines.length === 1) {
    lines.push('    empty["No architecture data available"]');
  }

  return lines.join('\n');
}

module.exports = {
  generateSystemOverview
};
