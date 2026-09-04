import { analyzeRepository } from './repository/repository.analyzer.js';
import { buildDependencyGraph } from './dependencies/dependency.analyzer.js';
import { buildArchitectureModel } from './advanced/architecture.analyzer.js';
import * as repositoryStore from './repository/repository.store.js';
import * as persistenceStore from './repository/persistence.store.js';

// Small yield so the polling loop can observe each phase even on fast repos
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export async function executeAnalysisPipeline(repoId, options = {}, postMessage = () => {}) {
  // 1. Mark repo as analyzing
  let record = await repositoryStore.get(repoId);
  if (!record) {
    record = { id: repoId, name: `Repo-${repoId}`, uploadedAt: new Date().toISOString() };
    await repositoryStore.set(repoId, record);
  }
  
  await repositoryStore.update(repoId, { status: 'analyzing', phase: 'scanning_files' });

  const onProgress = async (phase, details) => {
    await repositoryStore.update(repoId, { phase, phaseDetails: details });
    postMessage({ type: 'PROGRESS', repoId, phase, details });
    // Yield briefly so the UI polling can observe this phase
    await sleep(400);
  };

  // 2. Run AST Analysis
  const previousAnalysis = record.analysis || null;
  const analysis = await analyzeRepository(repoId, previousAnalysis, onProgress, options);
  
  if (analysis.status === 'error') {
    throw new Error(analysis.error);
  }

  // 3. Run Dependency Graph Engine
  await onProgress('building_graph');
  const graph = buildDependencyGraph(analysis);
  analysis.graph = graph;

  // 4. Run Architecture Analysis
  await onProgress('building_architecture');
  const architecture = buildArchitectureModel(analysis, graph);
  analysis.architecture = architecture;

  // 5. Show finalizing step briefly before marking ready
  await onProgress('ready');

  // 6. Finalize
  await repositoryStore.update(repoId, { 
    status: 'ready', 
    phase: 'ready', 
    analysis 
  });

  return analysis;
}

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
