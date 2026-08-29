'use strict';

/**
 * architectureInsights.js
 * 
 * Generates high-level architectural insights using the configured AI provider.
 */

const { generateAnswer, isProviderConfigured } = require('./aiProvider');

const ARCHITECTURE_PROMPT_TEMPLATE = `
You are an expert software architect analyzing a codebase.
I have extracted the following structural architecture model from the repository:

=== Architecture Model ===
{architecture_json}
==========================

Based on this deterministic data, provide a concise, high-level architectural insight report.
You must distinguish between facts (observed in the model) and inference (your interpretation).
Do not guess or hallucinate external systems that are not listed in the model.

Format your response exactly as follows:

**Architecture Summary:**
(A 2-3 sentence overview of the system structure)

**Major Responsibilities:**
- (List 2-4 primary components and what they likely do)

**Architectural Observations (Facts):**
- (List 2-4 structural facts, e.g., "The API layer depends on the Service layer")

**Architectural Insights (Inferences/Risks):**
- (List 1-3 inferences about potential tight coupling, cycles, or design patterns)
`;

async function getArchitectureInsights(architectureModel) {
  if (!isProviderConfigured()) {
    return {
      status: 'unavailable',
      text: 'AI provider is not configured. Architectural insights are unavailable.'
    };
  }

  // We only send a simplified version of the model to save tokens and improve focus.
  const simpleModel = {
    components: architectureModel.components.map(c => ({
      name: c.name,
      layer: c.layer,
      fileCount: c.files.length
    })),
    entryPoints: architectureModel.entryPoints,
    apiBoundaries: architectureModel.apiBoundaries.map(a => ({
      file: a.filePath,
      exports: a.exports
    })),
    relationsCount: architectureModel.relations.length,
    isolatedFilesCount: architectureModel.isolatedFiles.length,
  };

  const prompt = ARCHITECTURE_PROMPT_TEMPLATE.replace(
    '{architecture_json}',
    JSON.stringify(simpleModel, null, 2)
  );

  try {
    const text = await generateAnswer(prompt);
    return {
      status: 'success',
      text
    };
  } catch (error) {
    console.error('[architectureInsights] Failed to generate insights:', error);
    return {
      status: 'error',
      text: 'AI service encountered an error while generating insights.'
    };
  }
}

module.exports = {
  getArchitectureInsights
};
