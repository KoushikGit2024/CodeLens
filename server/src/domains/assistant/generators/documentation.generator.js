'use strict';

/**
 * documentationGenerator.js
 *
 * Orchestrates the generation of documentation by calling the AI provider
 * and validating the response against deterministic facts.
 */

const { generateStructuredResponse, isAIAvailable } = require('../../../core/ai/ai.service');

const OVERVIEW_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    technologies: { type: 'array', items: { type: 'string' } },
    architectureSummary: { type: 'string' },
    observations: { type: 'array', items: { type: 'string' } }
  }
};

const MODULE_SCHEMA = {
  type: 'object',
  properties: {
    responsibility: { type: 'string' },
    architectureRole: { type: 'string' },
    apiNotes: { type: 'string' },
    inferredDependenciesPurpose: { type: 'string' }
  }
};
const {
  buildOverviewContext,
  buildModuleContext,
  buildOverviewPrompt,
  buildModulePrompt,
} = require('../context/documentation.context');

/**
 * Generates repository overview documentation.
 *
 * @param {Object} analysis
 * @param {Object} graph
 * @param {Object} architectureModel
 * @returns {Promise<Object>} The combined facts and AI interpretation
 */
async function generateOverviewDocs(analysis, graph, architectureModel, generateAi = true) {
  const context = buildOverviewContext(analysis, graph, architectureModel);
  const result = {
    facts: context,
    aiInterpretation: null,
  };

  if (!isAIAvailable() || !generateAi) {
    return result; // Fallback to deterministic facts only
  }

  const prompt = buildOverviewPrompt(context);

  try {
    const parsed = await generateStructuredResponse(prompt, OVERVIEW_SCHEMA);
    
    // Basic structural validation
    result.aiInterpretation = {
      summary: parsed.summary || null,
      technologies: Array.isArray(parsed.technologies) ? parsed.technologies : [],
      architectureSummary: parsed.architectureSummary || null,
      observations: Array.isArray(parsed.observations) ? parsed.observations : [],
    };
  } catch (err) {
    console.error('[documentationGenerator] AI generation failed:', err.message);
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
async function generateModuleDocs(analysis, graph, architectureModel, filePath, generateAi = false) {
  const context = buildModuleContext(analysis, graph, architectureModel, filePath);
  const result = {
    facts: context,
    aiInterpretation: null,
  };

  if (!generateAi || !isAIAvailable()) {
    return result;
  }

  const prompt = buildModulePrompt(context);

  try {
    const parsed = await generateStructuredResponse(prompt, MODULE_SCHEMA);
    
    result.aiInterpretation = {
      responsibility: parsed.responsibility || null,
      architectureRole: parsed.architectureRole || null,
      apiNotes: parsed.apiNotes || null,
      inferredDependenciesPurpose: parsed.inferredDependenciesPurpose || null,
    };
  } catch (err) {
    console.error('[documentationGenerator] AI generation failed:', err.message);
  }

  return result;
}

module.exports = {
  generateOverviewDocs,
  generateModuleDocs,
};
