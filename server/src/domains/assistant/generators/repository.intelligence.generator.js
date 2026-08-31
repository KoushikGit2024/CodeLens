'use strict';

const { generateStructuredResponse, isAIAvailable } = require('../../../core/ai/ai.service');
const { buildIntelligenceContext } = require('../context/repository.intelligence.context');

const INTELLIGENCE_SCHEMA = {
  type: 'object',
  properties: {
    summary: { 
      type: 'string', 
      description: 'A concise 2-3 sentence summary of what this repository appears to be and its overall state.' 
    },
    keyCharacteristics: {
      type: 'array',
      items: { type: 'string' },
      description: 'Bullet points highlighting the most defining characteristics (e.g., language mix, architecture style).'
    },
    architectureExplanation: {
      type: 'string',
      description: 'A brief, intuitive explanation of the architectural structure based on the provided layers and entry points.'
    },
    importantComponents: {
      type: 'array',
      items: { type: 'string' },
      description: 'A list of the most critical parts of the codebase based on hotspots and entry points.'
    },
    mainRisks: {
      type: 'array',
      items: { type: 'string' },
      description: 'The top engineering or architectural risks that need attention.'
    },
    recommendedActions: {
      type: 'array',
      items: { type: 'string' },
      description: 'Actionable next steps for a developer onboarding or refactoring this repo.'
    },
    references: {
      type: 'array',
      items: { type: 'string' },
      description: 'Strictly a list of file paths that were explicitly mentioned in the context and are highly relevant.'
    },
    limitations: {
      type: 'array',
      items: { type: 'string' },
      description: 'Any missing context or caveats the developer should be aware of.'
    }
  },
  required: ['summary', 'keyCharacteristics', 'architectureExplanation', 'importantComponents', 'mainRisks', 'recommendedActions', 'limitations']
};

/**
 * Get AI-assisted Repository Intelligence Overview.
 */
async function getRepositoryIntelligenceSummary(intel) {
  const context = buildIntelligenceContext(intel);

  const prompt = `You are an expert Principal Software Engineer and Architect.
Your task is to provide a "Unified Repository Intelligence Overview" to a developer who has just opened this project.

Review the following deterministic facts about the repository:
${context}

Instructions:
1. Synthesize these facts into a cohesive understanding of the project.
2. Explain the architecture simply.
3. Identify the most important areas to focus on (Hotspots / Refactoring targets).
4. Provide actionable advice.
5. Provide the output in strict JSON matching the required schema.
6. DO NOT hallucinate any file paths, dependencies, or components not present in the facts.

Output JSON only. Do not use markdown wrappers.`;

  if (!isAIAvailable()) {
    return {
      summary: "AI provider is not configured. Intelligence overview is unavailable.",
      keyCharacteristics: [],
      architectureExplanation: "",
      importantComponents: [],
      mainRisks: [],
      recommendedActions: [],
      limitations: ["Offline fallback mode."]
    };
  }

  try {
    const parsed = await generateStructuredResponse(prompt, INTELLIGENCE_SCHEMA);

    // Validate references against deterministic facts
    const allowedFiles = new Set();
    intel.architecture.entryPoints.forEach(f => allowedFiles.add(f));
    intel.hotspots.forEach(h => allowedFiles.add(h.filePath));
    intel.refactoring.topCandidates.forEach(c => {
       // We don't have the full file list of candidates in the simplified summary,
       // but we can at least validate hotspots and entry points.
    });

    if (parsed.references) {
      parsed.references = parsed.references.filter(ref => allowedFiles.has(ref));
    }

    return parsed;
  } catch (err) {
    console.error('[repositoryIntelligenceGenerator] AI Provider error:', err.message);
    return {
      summary: "AI generation failed.",
      keyCharacteristics: [],
      architectureExplanation: "",
      importantComponents: [],
      mainRisks: [],
      recommendedActions: [],
      limitations: [err.message]
    };
  }
}

module.exports = {
  getRepositoryIntelligenceSummary
};
