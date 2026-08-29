'use strict';

/**
 * documentationGenerator.js
 *
 * Orchestrates the generation of documentation by calling the AI provider
 * and validating the response against deterministic facts.
 */

const { generateAnswer, isProviderConfigured, ProviderUnavailableError } = require('./aiProvider');
const {
  buildOverviewContext,
  buildModuleContext,
  buildOverviewPrompt,
  buildModulePrompt,
} = require('./documentationContextBuilder');

/**
 * Generates repository overview documentation.
 *
 * @param {Object} analysis
 * @param {Object} graph
 * @param {Object} architectureModel
 * @returns {Promise<Object>} The combined facts and AI interpretation
 */
async function generateOverviewDocs(analysis, graph, architectureModel) {
  const context = buildOverviewContext(analysis, graph, architectureModel);
  const result = {
    facts: context,
    aiInterpretation: null,
  };

  if (!isProviderConfigured()) {
    return result; // Fallback to deterministic facts only
  }

  const prompt = buildOverviewPrompt(context);

  try {
    const aiResponseStr = await generateAnswer(prompt);
    let parsed = null;
    
    // Attempt to parse JSON. Sometimes AI adds markdown backticks.
    try {
      const cleanStr = aiResponseStr.replace(/^```(?:json)?\n?/i, '').replace(/```$/i, '').trim();
      parsed = JSON.parse(cleanStr);
    } catch (parseErr) {
      console.warn('[documentationGenerator] Failed to parse AI overview JSON:', parseErr.message);
      // We can fallback to raw if we want, but schema says structured JSON.
      parsed = { summary: aiResponseStr };
    }

    // Basic structural validation
    result.aiInterpretation = {
      summary: parsed.summary || null,
      technologies: Array.isArray(parsed.technologies) ? parsed.technologies : [],
      architectureSummary: parsed.architectureSummary || null,
      observations: Array.isArray(parsed.observations) ? parsed.observations : [],
    };
  } catch (err) {
    if (err instanceof ProviderUnavailableError) {
      console.warn('[documentationGenerator] AI provider unavailable. Using fallback.');
    } else {
      console.error('[documentationGenerator] AI generation failed:', err);
    }
  }

  return result;
}

/**
 * Generates file-level documentation.
 *
 * @param {Object} analysis
 * @param {Object} graph
 * @param {Object} architectureModel
 * @param {string} filePath
 * @returns {Promise<Object>} The combined facts and AI interpretation
 */
async function generateModuleDocs(analysis, graph, architectureModel, filePath) {
  const context = buildModuleContext(analysis, graph, architectureModel, filePath);
  const result = {
    facts: context,
    aiInterpretation: null,
  };

  if (!isProviderConfigured()) {
    return result;
  }

  const prompt = buildModulePrompt(context);

  try {
    const aiResponseStr = await generateAnswer(prompt);
    let parsed = null;
    
    try {
      const cleanStr = aiResponseStr.replace(/^```(?:json)?\n?/i, '').replace(/```$/i, '').trim();
      parsed = JSON.parse(cleanStr);
    } catch (parseErr) {
      console.warn('[documentationGenerator] Failed to parse AI module JSON:', parseErr.message);
      parsed = { responsibility: aiResponseStr };
    }

    result.aiInterpretation = {
      responsibility: parsed.responsibility || null,
      architectureRole: parsed.architectureRole || null,
      apiNotes: parsed.apiNotes || null,
      inferredDependenciesPurpose: parsed.inferredDependenciesPurpose || null,
    };
  } catch (err) {
    if (err instanceof ProviderUnavailableError) {
      console.warn('[documentationGenerator] AI provider unavailable. Using fallback.');
    } else {
      console.error('[documentationGenerator] AI generation failed:', err);
    }
  }

  return result;
}

module.exports = {
  generateOverviewDocs,
  generateModuleDocs,
};
