'use strict';

const repositoryStore = require('../repository/repository.store');
const { buildDependencyGraph } = require('../dependencies/dependency.analyzer');
const { buildArchitectureModel } = require('../architecture/architecture.analyzer');
const { buildEngineeringRiskModel } = require('./risk.analyzer');
const { buildRefactoringIntelligence } = require('./refactoring.analyzer');
const { analyzeChangeImpact } = require('./change.impact');
const { getRefactoringInsights } = require('../assistant/generators/refactoring.generator');

/**
 * Controller for Refactoring Intelligence.
 */

function getRefactoringModel(req) {
  const record = repositoryStore.get(req.params.id);
  if (!record || !record.analysis) {
    throw new Error('Analysis not found');
  }

  const graph = buildDependencyGraph(record.analysis);
  const architecture = buildArchitectureModel(record.analysis, graph);
  const riskModel = buildEngineeringRiskModel(record.analysis, graph, architecture);
  return buildRefactoringIntelligence(riskModel);
}

function getBaseDependencies(req) {
  const record = repositoryStore.get(req.params.id);
  if (!record || !record.analysis) {
    throw new Error('Analysis not found');
  }

  const graph = buildDependencyGraph(record.analysis);
  return { analysis: record.analysis, graph };
}

async function getRefactoring(req, res, next) {
  try {
    const intel = getRefactoringModel(req);
    return res.json(intel);
  } catch (err) {
    console.error('[refactoringController] getRefactoring failed:', err);
    if (err.message === 'Analysis not found') {
       return res.status(404).json({ error: 'Repository or analysis not found' });
    }
    next(err);
  }
}

async function getCandidate(req, res, next) {
  try {
    const { candidateId } = req.params;
    const intel = getRefactoringModel(req);
    
    const candidate = intel.candidates.find(c => c.id === candidateId);
    if (!candidate) {
      return res.status(404).json({ error: 'Candidate not found' });
    }

    return res.json(candidate);
  } catch (err) {
    console.error('[refactoringController] getCandidate failed:', err);
    if (err.message === 'Analysis not found') {
       return res.status(404).json({ error: 'Repository or analysis not found' });
    }
    next(err);
  }
}

async function getCandidateImpact(req, res, next) {
  try {
    const { candidateId } = req.params;
    const intel = getRefactoringModel(req);
    const candidate = intel.candidates.find(c => c.id === candidateId);
    if (!candidate) {
      return res.status(404).json({ error: 'Candidate not found' });
    }

    const { analysis, graph } = getBaseDependencies(req);
    
    // Impact of changing the primary files associated with this candidate
    const impact = analyzeChangeImpact(analysis, graph, candidate.files);
    
    return res.json(impact);
  } catch (err) {
    console.error('[refactoringController] getCandidateImpact failed:', err);
    if (err.message === 'Analysis not found') {
       return res.status(404).json({ error: 'Repository or analysis not found' });
    }
    next(err);
  }
}

async function getCandidateInsights(req, res, next) {
  try {
    const { candidateId } = req.params;
    const intel = getRefactoringModel(req);
    const candidate = intel.candidates.find(c => c.id === candidateId);
    if (!candidate) {
      return res.status(404).json({ error: 'Candidate not found' });
    }

    const { analysis, graph } = getBaseDependencies(req);
    const impact = analyzeChangeImpact(analysis, graph, candidate.files);

    const insights = await getRefactoringInsights(candidate, impact);

    return res.json(insights);
  } catch (err) {
    console.error('[refactoringController] getCandidateInsights failed:', err);
    if (err.message === 'Analysis not found') {
       return res.status(404).json({ error: 'Repository or analysis not found' });
    }
    // Return 502 gracefully if Watsonx fails, so UI can still show deterministic data
    return res.status(502).json({ 
       error: 'AI Provider unavailable or failed',
       summary: "AI provider failed to respond. Deterministic strategies remain available.",
       recommendations: [],
       limitations: [err.message]
    });
  }
}

module.exports = {
  getRefactoring,
  getCandidate,
  getCandidateImpact,
  getCandidateInsights
};
