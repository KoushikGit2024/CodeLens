/**
 * repository.intelligence.context.js
 * 
 * It receives the aggregated repository intelligence JSON, then extracts the key metrics, 
 * and then it applies structured formatting to build a deterministic text context for LLM.
 */

/**
 * It evaluates the intelligence object, then extracts string variables, 
 * and then it applies template literals to construct a bounded prompt.
 */
export function buildIntelligenceContext(intel) {
  let context = `Repository Overview Context:\n\n`;

  context += `[Repository Basics]\n`;
  context += `- Name: ${intel.repository.name}\n`;
  context += `- File Count: ${intel.repository.fileCount}\n`;
  const langs = Object.entries(intel.repository.languages || {})
    .map(([lang, count]) => `${lang}: ${count}`)
    .join(', ');
  context += `- Languages: ${langs || 'None detected'}\n\n`;

  context += `[Architecture]\n`;
  context += `- Components: ${intel.architecture.components}\n`;
  context += `- Layers: ${intel.architecture.layers?.join(', ') || 'None detected'}\n`;
  context += `- Entry Points: ${intel.architecture.entryPoints?.join(', ') || 'None detected'}\n\n`;

  context += `[Dependencies]\n`;
  context += `- Nodes: ${intel.dependencies.nodes}\n`;
  context += `- Edges: ${intel.dependencies.edges}\n`;
  context += `- Circular Dependencies (Cycles): ${intel.dependencies.cycles}\n`;
  context += `- Unresolved Imports: ${intel.dependencies.unresolved}\n\n`;

  context += `[Engineering Health]\n`;
  context += `- Health Score: ${intel.engineeringHealth.score}/100\n`;
  context += `- Critical Risks: ${intel.engineeringHealth.critical}\n`;
  context += `- High Risks: ${intel.engineeringHealth.high}\n`;
  context += `- Warnings: ${intel.engineeringHealth.warnings}\n\n`;

  context += `[Top Refactoring Priorities]\n`;
  if (intel.refactoring.topCandidates?.length > 0) {
    intel.refactoring.topCandidates.forEach((c, idx) => {
      context += `  ${idx + 1}. ${c.title} (Priority: ${c.priority.toUpperCase()}, Score: ${c.score})\n`;
    });
  } else {
    context += `  None identified.\n`;
  }
  context += `\n`;

  context += `[Top Hotspots]\n`;
  if (intel.hotspots?.length > 0) {
    intel.hotspots.slice(0, 5).forEach((h, idx) => {
      context += `  ${idx + 1}. ${h.filePath} (Score: ${h.score})\n`;
      context += `     Reasons: ${h.reasons.join('; ')}\n`;
    });
  } else {
    context += `  None identified.\n`;
  }

  return context;
}