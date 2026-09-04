

/**
 * questionContextBuilder.js
 *
 * Extracts contextual facts (Architecture, Dependencies, Documentation, and selective Source)
 * to feed into the Watsonx prompt.
 */

import { buildDependencyGraph, getFileDependencies } from '../dependencies/dependency.analyzer.js';
import { buildArchitectureModel } from './architecture.analyzer.js';
import { INTENTS, routeQuestion } from './question.router.js';
import { buildContext as buildSourceContext } from './base.context.js';
import { buildEngineeringRiskModel } from './risk.analyzer.js';
import { buildRefactoringIntelligence } from './refactoring.analyzer.js';
import { buildRepositoryIntelligence } from './intelligence.analyzer.js';

/**
 * Assembles the context for a given question.
 *
 * @param {object} analysis - RepositoryAnalysis
 * @param {string} question - The user query
 * @param {string} extractPath - Path to repo on disk (for source extraction)
 * @returns {object} { routing, contextData }
 */
function buildQuestionContext(analysis, question, extractPath, activeContext) {
  const routing = routeQuestion(question, analysis, activeContext);
  const graph = buildDependencyGraph(analysis);
  const architecture = buildArchitectureModel(analysis, graph);

  const contextData = {
    projectName: analysis.name || 'Repository',
    meta: {
      totalFiles: analysis.files.length,
      languages: analysis.languageSummary || {},
    },
    facts: [], // Array of text facts
    files: [], // Array of file data (name, source, symbols)
  };

  // 1. Gather facts based on intent
  if (routing.intent === INTENTS.REPOSITORY_OVERVIEW) {
    const unifiedIntel = buildRepositoryIntelligence(analysis, graph, architecture);
    
    contextData.facts.push(`Files: ${unifiedIntel.repository.fileCount}`);
    contextData.facts.push(`Languages: ${Object.keys(unifiedIntel.repository.languages).join(', ')}`);
    contextData.facts.push(`Components: ${unifiedIntel.architecture.components}`);
    contextData.facts.push(`Health Score: ${unifiedIntel.engineeringHealth.score}`);
    
    if (unifiedIntel.hotspots.length > 0) {
      contextData.facts.push(`Top Hotspots: ${unifiedIntel.hotspots.slice(0, 3).map(h => h.filePath).join(', ')}`);
    }
  }

  else if (routing.intent === INTENTS.METRICS) {
    contextData.facts.push(`The repository contains ${analysis.files.length} files.`);
    contextData.facts.push(`Languages used: ${Object.keys(analysis.languageSummary || {}).join(', ')}.`);
  } 
  
  else if (routing.intent === INTENTS.DEPENDENCY && routing.targetFile) {
    const deps = getFileDependencies(graph, routing.targetFile);
    
    if (deps.dependencies.length > 0) {
      contextData.facts.push(`${routing.targetFile} depends on: ${deps.dependencies.map(d => d.filePath || d.name).join(', ')}`);
    } else {
      contextData.facts.push(`${routing.targetFile} has no internal dependencies.`);
    }

    if (deps.dependents.length > 0) {
      contextData.facts.push(`${routing.targetFile} is imported by: ${deps.dependents.map(d => d.filePath || d.name).join(', ')}`);
    } else {
      contextData.facts.push(`${routing.targetFile} is not imported by any other file.`);
    }
  }

  else if (routing.intent === INTENTS.ARCHITECTURE) {
    contextData.facts.push(`Architecture Components: ${architecture.components.map(c => c.name).join(', ')}`);
    contextData.facts.push(`Entry Points: ${architecture.entryPoints.join(', ') || 'None detected'}`);
    architecture.components.forEach(c => {
      contextData.facts.push(`Component '${c.name}' (Layer: ${c.layer}) contains ${c.files.length} files.`);
    });
  }

  else if (routing.intent === INTENTS.REFACTORING) {
    const riskModel = buildEngineeringRiskModel(analysis, graph, architecture);
    const refactoringIntel = buildRefactoringIntelligence(riskModel);
    contextData.facts.push(`Refactoring Candidates: ${refactoringIntel.candidateCount}`);
    contextData.facts.push(`Critical: ${refactoringIntel.critical}, High: ${refactoringIntel.high}`);
    
    // Pass top candidates explicitly
    const topCandidates = refactoringIntel.candidates.slice(0, 5);
    topCandidates.forEach((c, idx) => {
      contextData.facts.push(`[Priority ${idx+1}] ${c.title} (Score: ${c.priorityScore}). Files involved: ${c.files.join(', ')}`);
    });
  }

  // 2. Gather source code selectively
  // We use the original contextBuilder to score files and extract source snippets.
  if (routing.requiresAi) {
    // Only fetch raw source code for general or file explanations
    if (routing.intent === INTENTS.FILE_EXPLANATION || routing.intent === INTENTS.GENERAL || routing.intent === INTENTS.ARCHITECTURE || routing.intent === INTENTS.REFACTORING) {
      const sourceCtx = buildSourceContext(analysis, question, extractPath, { maxFiles: 5, maxSourceChars: 15000, activeContext });
      contextData.files = sourceCtx.files;
    }
  }

  return { routing, contextData };
}

export { 
  buildQuestionContext
 };
