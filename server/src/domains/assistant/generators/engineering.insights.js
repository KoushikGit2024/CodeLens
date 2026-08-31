'use strict';

const { generateStructuredResponse, isAIAvailable } = require('../../../core/ai/ai.service');

const INSIGHTS_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: "High level summary of the codebase's structural health (1-2 sentences)." },
    priorityRisks: { type: 'array', items: { type: 'string' } },
    observations: { type: 'array', items: { type: 'string' } },
    recommendations: { type: 'array', items: { type: 'string' } },
    limitations: { type: 'string' }
  },
  required: ['summary', 'priorityRisks', 'observations', 'recommendations', 'limitations']
};

/**
 * engineeringInsights.js
 * 
 * Provides AI interpretation of the deterministic EngineeringRiskModel.
 */

/**
 * Strips verbose structures to fit context limits.
 */
function minifyRiskModel(riskModel) {
  return {
    score: riskModel.score,
    riskLevel: riskModel.riskLevel,
    metrics: riskModel.metrics,
    hotspots: riskModel.hotspots,
    risks: riskModel.risks.map(r => ({
      category: r.category,
      severity: r.severity,
      title: r.title,
      file: r.file,
      description: r.description
    }))
  };
}

/**
 * Builds the AI prompt for engineering health insights.
 */
function buildInsightsPrompt(riskModel, architecture, graphMeta) {
  const minified = minifyRiskModel(riskModel);
  
  const context = {
    engineeringHealth: minified,
    architectureSummary: {
      components: architecture.components.map(c => ({ name: c.name, layer: c.layer })),
      unresolvedDependencies: graphMeta.unresolvedImports,
      totalFiles: graphMeta.totalFiles
    }
  };

  return `
You are an expert software architect analyzing a repository's structural health.
Based on the provided deterministic Engineering Risk Model, provide insights and actionable recommendations.

Do NOT invent new metrics or risks. Use the facts provided.

CONTEXT:
${JSON.stringify(context, null, 2)}
  `.trim();
}

/**
 * Fetches AI insights for the engineering health model.
 * 
 * @param {object} riskModel 
 * @param {object} architecture 
 * @param {object} graphMeta 
 * @returns {Promise<object>}
 */
async function getEngineeringInsights(riskModel, architecture, graphMeta) {
  if (!isAIAvailable()) {
    return _fallbackResponse();
  }

  const prompt = buildInsightsPrompt(riskModel, architecture, graphMeta);

  try {
    const parsed = await generateStructuredResponse(prompt, INSIGHTS_SCHEMA);
    
    return {
      summary: parsed.summary || "Summary unavailable.",
      priorityRisks: Array.isArray(parsed.priorityRisks) ? parsed.priorityRisks : [],
      observations: Array.isArray(parsed.observations) ? parsed.observations : [],
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
      limitations: parsed.limitations || "None."
    };
  } catch (err) {
    console.warn('[engineeringInsights] Failed to generate AI insights:', err.message);
    return _fallbackResponse();
  }
}

function _fallbackResponse() {
  return {
    summary: "AI provider is currently unavailable or returned malformed data. Relying on deterministic risk model.",
    priorityRisks: ["Review the critical and high risks listed in the deterministic model above."],
    observations: ["Deterministic data establishes the baseline facts."],
    recommendations: ["Examine hotspots and address circular dependencies first."],
    limitations: "Interpretations are limited to structural heuristics."
  };
}

module.exports = {
  getEngineeringInsights
};
