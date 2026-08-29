'use strict';

const { generateAnswer, isProviderConfigured, ProviderUnavailableError } = require('../../../core/ai/aiProvider');

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

Respond ONLY with a valid JSON object matching this schema exactly (no markdown formatting, no backticks, just the JSON string):

{
  "summary": "High level summary of the codebase's structural health (1-2 sentences).",
  "priorityRisks": [
    "Most critical risk to address first",
    "Second most critical risk"
  ],
  "observations": [
    "Insightful observation about coupling or architecture based on the data",
    "Observation about file size or responsibilities"
  ],
  "recommendations": [
    "Actionable step to improve the score",
    "Another actionable step"
  ],
  "limitations": "Any caveats about what this structural data might be missing."
}
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
  if (!isProviderConfigured()) {
    return _fallbackResponse();
  }

  const prompt = buildInsightsPrompt(riskModel, architecture, graphMeta);

  try {
    const aiResponseStr = await generateAnswer(prompt);
    
    // Clean up potential markdown formatting
    const cleanStr = aiResponseStr.replace(/^```(?:json)?\n?/i, '').replace(/```$/i, '').trim();
    const parsed = JSON.parse(cleanStr);

    return {
      summary: parsed.summary || "Summary unavailable.",
      priorityRisks: Array.isArray(parsed.priorityRisks) ? parsed.priorityRisks : [],
      observations: Array.isArray(parsed.observations) ? parsed.observations : [],
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
      limitations: parsed.limitations || "None."
    };
  } catch (err) {
    if (err instanceof ProviderUnavailableError) {
      console.warn('[engineeringInsights] AI provider unavailable. Using fallback.');
    } else {
      console.warn('[engineeringInsights] Failed to parse AI insights JSON:', err.message);
    }
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
