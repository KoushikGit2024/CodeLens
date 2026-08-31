'use strict';

const repositoryStore = require('../repository/repository.store');
const { buildDependencyGraph } = require('../dependencies/dependency.analyzer');
const { buildArchitectureModel } = require('../architecture/architecture.analyzer');
const { buildEngineeringRiskModel } = require('./risk.analyzer');
const { buildRefactoringIntelligence } = require('./refactoring.analyzer');
const { analyzeChangeImpact } = require('./change.impact');
const { getRefactoringInsights } = require('../assistant/generators/refactoring.generator');
const { generateAnswer } = require('../../core/ai/ai.provider');
const fs = require('fs');
const path = require('path');

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
    next(err);
  }
}

async function autoFixCandidate(req, res, next) {
  try {
    const { id, candidateId } = req.params;
    const record = repositoryStore.get(id);
    if (!record || !record.analysis) {
       return res.status(404).json({ error: 'Repository or analysis not found' });
    }

    const intel = getRefactoringModel(req);
    const candidate = intel.candidates.find(c => c.id === candidateId);
    if (!candidate) {
      return res.status(404).json({ error: 'Candidate not found' });
    }

    const targetFile = candidate.files[0];
    if (!targetFile) {
      return res.status(400).json({ error: 'No files associated with this candidate' });
    }

    const absolutePath = path.join(record.extractPath, targetFile);
    let originalCode = '';
    try {
      originalCode = fs.readFileSync(absolutePath, 'utf8');
    } catch (err) {
      return res.status(404).json({ error: 'File content could not be read' });
    }

    const prompt = `You are an expert AI refactoring agent.
I have a file named ${targetFile} that has a refactoring issue.
Issue Type: ${candidate.type}
Issue Title: ${candidate.title}
Issue Context: ${JSON.stringify(candidate.context)}

Your task is to REFACTOR the original code to fix this issue.
Output ONLY the fully refactored code. Do not output any markdown formatting, backticks, or explanations. Only valid raw source code.

Original Code:
${originalCode}
`;

    const result = await generateAnswer(prompt);
    
    let refactoredCode = result.trim();
    if (refactoredCode.startsWith('\`\`\`')) {
      const lines = refactoredCode.split('\n');
      lines.shift();
      if (lines[lines.length - 1].startsWith('\`\`\`')) {
        lines.pop();
      }
      refactoredCode = lines.join('\n');
    }

    return res.json({
      candidateId,
      file: targetFile,
      originalCode,
      refactoredCode
    });

  } catch (err) {
    console.error('[refactoringController] autoFixCandidate failed:', err);
    next(err);
  }
}

module.exports = {
  getRefactoring,
  getCandidate,
  getCandidateImpact,
  getCandidateInsights,
  autoFixCandidate
};
