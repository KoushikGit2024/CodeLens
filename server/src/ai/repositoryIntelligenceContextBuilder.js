'use strict';

/**
 * Builds a deterministic, bounded text context for IBM watsonx to 
 * generate a unified Repository Intelligence Summary.
 */

function buildIntelligenceContext(intel) {
  let context = `Repository Overview Context:\n\n`;

  // 1. Basic Stats
  context += `[Repository Basics]\n`;
  context += `- Name: ${intel.repository.name}\n`;
  context += `- File Count: ${intel.repository.fileCount}\n`;
  const langs = Object.entries(intel.repository.languages)
    .map(([lang, count]) => `${lang}: ${count}`)
    .join(', ');
  context += `- Languages: ${langs || 'None detected'}\n\n`;

  // 2. Architecture
  context += `[Architecture]\n`;
  context += `- Components: ${intel.architecture.components}\n`;
  context += `- Layers: ${intel.architecture.layers.join(', ') || 'None detected'}\n`;
  context += `- Entry Points: ${intel.architecture.entryPoints.join(', ') || 'None detected'}\n\n`;

  // 3. Dependencies
  context += `[Dependencies]\n`;
  context += `- Nodes: ${intel.dependencies.nodes}\n`;
  context += `- Edges: ${intel.dependencies.edges}\n`;
  context += `- Circular Dependencies (Cycles): ${intel.dependencies.cycles}\n`;
  context += `- Unresolved Imports: ${intel.dependencies.unresolved}\n\n`;

  // 4. Engineering Health & Refactoring
  context += `[Engineering Health]\n`;
  context += `- Health Score: ${intel.engineeringHealth.score}/100\n`;
  context += `- Critical Risks: ${intel.engineeringHealth.critical}\n`;
  context += `- High Risks: ${intel.engineeringHealth.high}\n`;
  context += `- Warnings: ${intel.engineeringHealth.warnings}\n\n`;

  context += `[Top Refactoring Priorities]\n`;
  if (intel.refactoring.topCandidates.length > 0) {
    intel.refactoring.topCandidates.forEach((c, idx) => {
      context += `  ${idx + 1}. ${c.title} (Priority: ${c.priority.toUpperCase()}, Score: ${c.score})\n`;
    });
  } else {
    context += `  None identified.\n`;
  }
  context += `\n`;

  // 5. Hotspots
  context += `[Top Hotspots]\n`;
  if (intel.hotspots.length > 0) {
    intel.hotspots.slice(0, 5).forEach((h, idx) => {
      context += `  ${idx + 1}. ${h.filePath} (Score: ${h.score})\n`;
      context += `     Reasons: ${h.reasons.join('; ')}\n`;
    });
  } else {
    context += `  None identified.\n`;
  }

  return context;
}

module.exports = {
  buildIntelligenceContext
};
