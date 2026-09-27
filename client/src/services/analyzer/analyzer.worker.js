/**
 * analyzer.worker.js
 * 
 * It receives the worker initialization payload, then extracts the repository analysis pipeline, 
 * and then it applies the computational results back to the main UI thread.
 */

import { analyzeRepository } from './repository/repository.analyzer.js';
import { buildDependencyGraph } from './dependencies/dependency.analyzer.js';
import { buildArchitectureModel } from './advanced/architecture.analyzer.js';
import { analyzeGitChurn } from './advanced/git.analyzer.js';
import * as repositoryStore from './repository/repository.store.js';

// It triggers a manual timeout, then extracts the thread lock, and then it applies a brief pause so UI polling can catch up.
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * It initiates the repository state, then extracts sequential AST and graph models, 
 * and then it applies the final unified analysis to the browser's IndexedDB.
 */
export async function executeAnalysisPipeline(repoId, options = {}, postMessage = () => {}) {
  let record = await repositoryStore.get(repoId);
  if (!record) {
    record = { id: repoId, name: `Repo-${repoId}`, uploadedAt: new Date().toISOString() };
    await repositoryStore.set(repoId, record);
  }
  
  await repositoryStore.update(repoId, { status: 'analyzing', phase: 'scanning_files' });

  // It captures the current phase, then extracts progress details, and then it applies a state update to the local repository store.
  const onProgress = async (phase, details) => {
    await repositoryStore.update(repoId, { phase, phaseDetails: details });
    postMessage({ type: 'PROGRESS', repoId, phase, details });
    await sleep(400);
  };

  const previousAnalysis = record.analysis || null;
  const analysis = await analyzeRepository(repoId, previousAnalysis, onProgress, options);
  
  if (analysis.status === 'error') {
    throw new Error(analysis.error);
  }

  await onProgress('building_graph');
  const graph = buildDependencyGraph(analysis);
  analysis.graph = graph;

  await onProgress('building_architecture');
  const architecture = buildArchitectureModel(analysis, graph);
  analysis.architecture = architecture;

  await onProgress('analyzing_git_churn');
  const gitChurnResult = await analyzeGitChurn(repoId);
  if (gitChurnResult) {
    analysis.gitChurn = gitChurnResult;
    graph.gitChurn = gitChurnResult;
    for (const [filePath, fileNode] of Object.entries(analysis.files)) {
      const churnScore = gitChurnResult.churnScores[filePath] || 0;
      const complexity = fileNode.metrics?.complexity || 0;
      
      // Normalize complexity to 0-100 (assume 30 is extremely high)
      const complexityScore = Math.min(100, Math.round((complexity / 30) * 100));
      
      // Calculate Composite Risk Rating: (0.6 * complexityScore) + (0.4 * churnScore)
      const compositeScore = Math.round((0.6 * complexityScore) + (0.4 * churnScore));
      
      if (!fileNode.metrics) fileNode.metrics = {};
      fileNode.metrics.churnScore = churnScore;
      fileNode.metrics.compositeRisk = compositeScore;
    }
  }

  // It finalizes the database transaction, then extracts the complete analysis object, and then it applies it to IndexedDB BEFORE notifying the UI.
  await repositoryStore.update(repoId, { 
    status: 'ready', 
    phase: 'ready', 
    analysis 
  });

  // Now it is completely safe to tell the UI to fetch the final data
  await onProgress('ready');

  return analysis;
}

/**
 * It intercepts the main thread command, then extracts the repository identifier, 
 * and then it applies the full pipeline execution inside the isolated worker context.
 */
self.onmessage = async (event) => {
  const { type, repoId, options = {} } = event.data;

  if (type === 'START_ANALYSIS') {
    try {
      const analysis = await executeAnalysisPipeline(repoId, options, (msg) => self.postMessage(msg));
      self.postMessage({ type: 'COMPLETE', repoId, result: analysis });
    } catch (err) {
      console.error(`[analyzer.worker] Analysis failed for ${repoId}:`, err);
      await repositoryStore.update(repoId, { status: 'error', error: err.message });
      self.postMessage({ type: 'ERROR', repoId, error: err.message });
    }
  }
};