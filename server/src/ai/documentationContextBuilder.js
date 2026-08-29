'use strict';

/**
 * documentationContextBuilder.js
 *
 * Extracts deterministic facts from the analysis pipeline (RepositoryAnalysis,
 * DependencyGraph, ArchitectureModel) to build a minimal, targeted context
 * for the AI documentation generator.
 */

function buildOverviewContext(analysis, graph, architectureModel) {
  return {
    projectName: analysis.name || 'Repository',
    meta: {
      totalFiles: analysis.files.length,
      totalEdges: graph.edges.length,
      unresolvedImports: graph.meta.unresolvedImports,
    },
    entryPoints: architectureModel.entryPoints,
    apiBoundaries: architectureModel.apiBoundaries.map(b => ({
      filePath: b.filePath,
      exports: b.exports,
    })),
    components: architectureModel.components.map(c => ({
      name: c.name,
      layer: c.layer,
      fileCount: c.files.length,
    })),
    keyExternalPackages: getTopExternalPackages(graph, 10),
  };
}

function buildModuleContext(analysis, graph, architectureModel, filePath) {
  const file = analysis.files.find(f => f.filePath === filePath);
  if (!file) throw new Error(`File not found in analysis: ${filePath}`);

  // Find component and layer
  let componentName = 'Unknown';
  let layer = 'Unknown';
  for (const comp of architectureModel.components) {
    if (comp.files.includes(filePath)) {
      componentName = comp.name;
      layer = comp.layer;
      break;
    }
  }

  // Dependencies (outgoing)
  const deps = graph.edges
    .filter(e => e.source === `file:${filePath}`)
    .map(e => {
      const targetNode = graph.nodes.find(n => n.id === e.target);
      return targetNode ? (targetNode.filePath || targetNode.name) : e.target;
    });

  // Dependents (incoming)
  const dependents = graph.edges
    .filter(e => e.target === `file:${filePath}`)
    .map(e => {
      const srcNode = graph.nodes.find(n => n.id === e.source);
      return srcNode ? (srcNode.filePath || srcNode.name) : e.source;
    });

  // Exports
  const exports = file.symbols
    .filter(s => s.kind === 'export')
    .map(s => s.name)
    .filter(Boolean);

  // Determine if it's an API boundary
  const isApiBoundary = architectureModel.apiBoundaries.some(b => b.filePath === filePath);

  return {
    filePath,
    component: componentName,
    layer,
    isApiBoundary,
    exports,
    dependencies: deps,
    dependents,
    symbolCount: file.symbols.length,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getTopExternalPackages(graph, limit = 10) {
  const packageNodes = graph.nodes.filter(n => n.type === 'package');
  
  // Count incoming edges for each package
  const incoming = {};
  for (const edge of graph.edges) {
    if (incoming[edge.target] === undefined) {
      incoming[edge.target] = 0;
    }
    incoming[edge.target]++;
  }

  const scored = packageNodes.map(pkg => ({
    name: pkg.name,
    usageCount: incoming[pkg.id] || 0,
  }));

  scored.sort((a, b) => b.usageCount - a.usageCount);
  return scored.slice(0, limit).map(p => p.name);
}

// ── Prompt Generators ─────────────────────────────────────────────────────────

function buildOverviewPrompt(context) {
  return `You are an expert technical writer and software architect.
I will provide you with deterministic structural facts about a codebase.
Your job is to write a high-level "Repository Overview" JSON object.

Repository Facts:
${JSON.stringify(context, null, 2)}

Instructions:
Generate a structured JSON output with the following exact keys:
{
  "summary": "A 2-3 sentence high-level summary of what this repository appears to do.",
  "technologies": ["List of inferred main technologies/frameworks"],
  "architectureSummary": "A brief explanation of how the components and layers interact.",
  "observations": ["List of interesting architectural facts or tight couplings inferred"]
}

Do NOT output any markdown blocks (e.g. \`\`\`json). Output raw valid JSON only. Do NOT hallucinate packages or components that are not in the facts.`;
}

function buildModulePrompt(context) {
  return `You are an expert technical writer and software engineer.
I will provide you with deterministic structural facts about a specific module/file in a codebase.
Your job is to write a "Module Documentation" JSON object for it.

Module Facts:
${JSON.stringify(context, null, 2)}

Instructions:
Generate a structured JSON output with the following exact keys:
{
  "responsibility": "A 2-3 sentence summary of what this module's primary responsibility is.",
  "architectureRole": "How this module fits into its containing component/layer.",
  "apiNotes": "If this is an API boundary, explain what it likely exposes. If not, put null.",
  "inferredDependenciesPurpose": "A brief sentence explaining why it likely imports its main dependencies."
}

Do NOT output any markdown blocks (e.g. \`\`\`json). Output raw valid JSON only. Do NOT hallucinate dependencies or exports that are not in the facts.`;
}

module.exports = {
  buildOverviewContext,
  buildModuleContext,
  buildOverviewPrompt,
  buildModulePrompt,
};
