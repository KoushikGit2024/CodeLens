/**
 * question.context.js
 *
 * It evaluates the user question, then extracts deterministic facts based on intent,
 * and then it applies the source context builder to feed the AI provider proxy.
 */

import { buildDependencyGraph, getFileDependencies } from '../dependencies/dependency.analyzer.js';
import { buildArchitectureModel } from './architecture.analyzer.js';
import { INTENTS, routeQuestion } from './question.router.js';
import { buildContext as buildSourceContext } from './base.context.js';

// We import these defensively; if they fail or are missing during migration, the context builder won't crash.
import { buildEngineeringRiskModel } from './risk.analyzer.js';
import { buildRefactoringIntelligence } from './refactoring.analyzer.js';
import { buildRepositoryIntelligence } from './intelligence.analyzer.js';

/**
 * It evaluates the user query, then extracts context data based on intent,
 * and then it applies the file loader callback to selectively include source snippets.
 */
export async function buildQuestionContext(analysis, question, fileLoaderCallback, activeContext) {
  const routing = routeQuestion(question, analysis, activeContext);
  const graph = buildDependencyGraph(analysis);
  const architecture = buildArchitectureModel(analysis, graph);

  const contextData = {
    projectName: analysis.name || 'Repository',
    meta: {
      totalFiles: analysis.files?.length || 0,
      languages: analysis.languageSummary || {},
    },
    facts: [],
    files: [],
  };

  // It checks the routing intent, then extracts overview metrics, and then it applies them to the facts array.
  if (routing.intent === INTENTS.REPOSITORY_OVERVIEW) {
    try {
      const unifiedIntel = buildRepositoryIntelligence(analysis, graph, architecture);

      contextData.facts.push(`Files: ${unifiedIntel.repository?.fileCount || contextData.meta.totalFiles}`);
      contextData.facts.push(
        `Languages: ${Object.keys(unifiedIntel.repository?.languages || contextData.meta.languages).join(', ')}`
      );
      contextData.facts.push(`Components: ${architecture.layers?.map(c => c.data.label).join(', ') || 'None'}`);

      if (unifiedIntel.engineeringHealth) {
        contextData.facts.push(`Health Score: ${unifiedIntel.engineeringHealth.score}`);
      }

      if (unifiedIntel.hotspots && unifiedIntel.hotspots.length > 0) {
        contextData.facts.push(
          `Top Hotspots: ${unifiedIntel.hotspots
            .slice(0, 3)
            .map(h => h.filePath)
            .join(', ')}`
        );
      }
    } catch (err) {
      console.warn('[question.context] Failed to build repository intelligence facts, applying basic fallback.');
      contextData.facts.push(`Files: ${contextData.meta.totalFiles}`);
      contextData.facts.push(`Components: ${architecture.layers?.map(c => c.data.label).join(', ') || 'None'}`);
    }
  }

  // It isolates the metrics intent, then extracts total file counts, and then it applies them as textual facts.
  else if (routing.intent === INTENTS.METRICS) {
    contextData.facts.push(`The repository contains ${contextData.meta.totalFiles} files.`);
    contextData.facts.push(`Languages used: ${Object.keys(contextData.meta.languages).join(', ') || 'Unknown'}.`);
  }

  // It intercepts dependency requests, then extracts the specific file's graph neighbors, and then it applies the edge directions to the context.
  else if (routing.intent === INTENTS.DEPENDENCY && routing.targetFile) {
    const deps = getFileDependencies(graph, routing.targetFile);

    if (deps.dependencies.length > 0) {
      contextData.facts.push(
        `${routing.targetFile} depends on: ${deps.dependencies.map(d => d.filePath || d.package).join(', ')}`
      );
    } else {
      contextData.facts.push(`${routing.targetFile} has no internal dependencies.`);
    }

    if (deps.dependents.length > 0) {
      contextData.facts.push(
        `${routing.targetFile} is imported by: ${deps.dependents.map(d => d.filePath || d.package).join(', ')}`
      );
    } else {
      contextData.facts.push(`${routing.targetFile} is not imported by any other file.`);
    }
  }

  // It matches the architecture intent, then extracts the mapped component layers, and then it applies their file counts to the facts list.
  else if (routing.intent === INTENTS.ARCHITECTURE) {
    const componentNames = architecture.layers?.map(c => c.data.label) || [];
    contextData.facts.push(`Architecture Components: ${componentNames.join(', ') || 'None'}`);
    contextData.facts.push(`Entry Points: ${architecture.entryPoints?.join(', ') || 'None detected'}`);

    if (architecture.layers) {
      architecture.layers.forEach(c => {
        const fileCount = graph.nodes.filter(n => n.data.layer === c.data.layer && n.type === 'fileNode').length;
        contextData.facts.push(`Component '${c.data.label}' (Layer: ${c.data.layer}) contains ${fileCount} files.`);
      });
    }
  }

  // It handles refactoring intents, then extracts the engineering risk candidates, and then it applies the top 5 highest-priority targets.
  else if (routing.intent === INTENTS.REFACTORING) {
    try {
      const riskModel = buildEngineeringRiskModel(analysis, graph, architecture);
      const refactoringIntel = buildRefactoringIntelligence(riskModel);

      contextData.facts.push(`Refactoring Candidates: ${refactoringIntel.candidateCount || 0}`);
      contextData.facts.push(`Critical: ${refactoringIntel.critical || 0}, High: ${refactoringIntel.high || 0}`);

      if (refactoringIntel.candidates) {
        const topCandidates = refactoringIntel.candidates.slice(0, 5);
        topCandidates.forEach((c, idx) => {
          contextData.facts.push(
            `[Priority ${idx + 1}] ${c.title} (Score: ${c.priorityScore}). Files involved: ${c.files.join(', ')}`
          );
        });
      }
    } catch (err) {
      console.warn('[question.context] Failed to build refactoring facts.');
      contextData.facts.push('Refactoring analysis is currently unavailable.');
    }
  }

  // It verifies the AI source requirement, then extracts relevant code snippets using the async loader, and then it applies them to the context data.
  // REPOSITORY_OVERVIEW intentionally excluded — facts-only context is sufficient for high-level questions
  // and adding 24k chars of source would inflate the prompt without improving the answer quality.
  const INTENTS_NEEDING_SOURCE = [INTENTS.FILE_EXPLANATION, INTENTS.GENERAL, INTENTS.ARCHITECTURE, INTENTS.REFACTORING];

  if (routing.requiresAi && INTENTS_NEEDING_SOURCE.includes(routing.intent)) {
    const sourceCtx = await buildSourceContext(analysis, question, fileLoaderCallback, {
      maxFiles: 5,
      maxSourceChars: 15000,
      activeContext,
    });
    contextData.files = sourceCtx.files;
  }

  return { routing, contextData };
}
