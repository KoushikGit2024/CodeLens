'use strict';

const repositoryStore = require('./repository.store');
const { buildDependencyGraph } = require('../dependencies/dependency.analyzer');
const { buildArchitectureModel } = require('../architecture/architecture.analyzer');
const { buildRepositoryIntelligence } = require('./intelligence.analyzer');

/**
 * Controller for Unified Repository Intelligence.
 */

async function getIntelligence(req, res, next) {
  try {
    const record = repositoryStore.get(req.params.id);
    
    if (record && (record.status === 'analyzing' || record.status === 'pending')) {
      return res.status(202).json({ 
        status: record.status, 
        phase: record.phase || 'pending',
        phaseDetails: record.phaseDetails
      });
    }

    if (!record) {
      return res.status(404).json({ error: 'Repository not found' });
    }
    if (record.status === 'error') {
       return res.status(500).json({ 
          error: record.error || 'Repository analysis failed due to an internal error',
          status: 'error' 
       });
    }

    if (record.status !== 'ready' || !record.analysis) {
       return res.status(503).json({ 
          error: 'Analysis not ready',
          status: record.status 
       });
    }

    const graph = buildDependencyGraph(record.analysis);
    const architecture = buildArchitectureModel(record.analysis, graph);
    
    const intelligence = buildRepositoryIntelligence(record.analysis, graph, architecture);

    return res.json(intelligence);
  } catch (err) {
    console.error('[repositoryIntelligenceController] getIntelligence failed:', err);
    next(err);
  }
}

module.exports = {
  getIntelligence
};
