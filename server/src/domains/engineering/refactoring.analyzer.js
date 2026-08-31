'use strict';

const crypto = require('crypto');
const { SEVERITY } = require('./risk.analyzer');
const { getStrategiesForRisk } = require('./refactoring.strategies');

/**
 * refactoringAnalyzer.js
 * 
 * Deterministically analyzes engineering risks and generates actionable
 * refactoring candidates with transparent priority scoring.
 */

const SEVERITY_MULTIPLIER = {
  [SEVERITY.CRITICAL]: 3.0,
  [SEVERITY.HIGH]: 2.0,
  [SEVERITY.WARNING]: 1.0
};

// Impact is estimated based on category for simplicity, but could be refined.
// Cycles are inherently high impact. Size is localized impact unless heavily depended upon.
function estimateImpactMultiplier(riskCategory) {
  switch (riskCategory) {
    case 'DEPENDENCY': return 3.0;
    case 'ARCHITECTURE': return 2.5;
    case 'COUPLING': return 2.0;
    case 'SIZE': return 1.5;
    default: return 1.0;
  }
}

// Confidence indicates how certain the deterministic engine is that this is a flaw.
// Cycles are absolute. Isolated files might just be test files (low confidence).
function determineConfidence(risk) {
  if (risk.title.includes('Circular Dependency')) return { score: 1.0, label: 'high' };
  if (risk.title.includes('Cross-Layer Violation')) return { score: 0.9, label: 'high' };
  if (risk.title.includes('Very large file')) return { score: 0.9, label: 'high' };
  if (risk.title.includes('Unresolved Dependencies')) return { score: 0.8, label: 'high' };
  if (risk.title.includes('Large file')) return { score: 0.7, label: 'medium' };
  if (risk.title.includes('fan-out')) return { score: 0.7, label: 'medium' };
  
  if (risk.title.includes('fan-in')) return { score: 0.5, label: 'low' }; // Might be a healthy utility
  if (risk.title.includes('Isolated Module')) return { score: 0.3, label: 'low' }; // Might be dead code, or just an entrypoint
  
  return { score: 0.5, label: 'medium' };
}

function calculatePriority(risk) {
  const severityMultiplier = SEVERITY_MULTIPLIER[risk.severity] || 1.0;
  const impactMultiplier = estimateImpactMultiplier(risk.category);
  const confidence = determineConfidence(risk);
  
  // Base maximum score roughly 100: 3.0 * 3.0 * 1.0 = 9.0 -> normalized to ~100
  // e.g. 9 * 11 = 99
  const rawScore = severityMultiplier * impactMultiplier * confidence.score * 11;
  const priorityScore = Math.min(100, Math.round(rawScore));
  
  let priorityLabel = 'warning';
  if (priorityScore >= 80) priorityLabel = 'critical';
  else if (priorityScore >= 50) priorityLabel = 'high';
  
  let impactLabel = 'low';
  if (impactMultiplier >= 2.5) impactLabel = 'high';
  else if (impactMultiplier >= 1.5) impactLabel = 'medium';

  return {
    priorityScore,
    priority: priorityLabel,
    impact: impactLabel,
    confidence: confidence.label,
    rawConfidence: confidence.score
  };
}

function extractFilesFromRisk(risk) {
  const files = new Set();
  if (risk.file) files.add(risk.file);
  
  if (risk.evidence) {
    if (risk.evidence.cyclePath) {
      risk.evidence.cyclePath.forEach(f => files.add(f));
    }
    if (risk.evidence.sourceComp && risk.evidenceFile) {
       files.add(risk.evidenceFile);
    }
  }
  return Array.from(files);
}

/**
 * Convert engineering risks into actionable refactoring candidates.
 * 
 * @param {object} engineeringRiskModel - output of buildEngineeringRiskModel
 * @returns {object} RefactoringIntelligenceModel
 */
function buildRefactoringIntelligence(engineeringRiskModel) {
  const candidates = [];

  for (const risk of engineeringRiskModel.risks) {
    // We only create candidates for actionable risks
    if (risk.title.includes('Unresolved Dependencies')) continue; // usually a setup/npm install issue, not a refactor

    const priorityInfo = calculatePriority(risk);
    const strategies = getStrategiesForRisk(risk);
    const affectedFiles = extractFilesFromRisk(risk);

    const idString = `${risk.title}|${risk.category}|${affectedFiles.join(',')}`;
    const deterministicId = crypto.createHash('md5').update(idString).digest('hex').substring(0, 12);

    const candidate = {
      id: deterministicId,
      type: risk.category,
      title: risk.title,
      priority: priorityInfo.priority,
      priorityScore: priorityInfo.priorityScore,
      severity: risk.severity,
      confidence: priorityInfo.confidence,
      
      summary: risk.description,
      files: affectedFiles,
      evidence: risk.evidence,
      
      suggestedStrategies: strategies,
      
      // These will be populated on-demand via the impact endpoint or populated loosely here
      estimatedScope: {
        fileCount: affectedFiles.length
      }
    };

    candidates.push(candidate);
  }

  // Sort by priority score descending
  candidates.sort((a, b) => b.priorityScore - a.priorityScore);

  return {
    summary: `Identified ${candidates.length} refactoring candidates.`,
    candidateCount: candidates.length,
    critical: candidates.filter(c => c.priority === 'critical').length,
    high: candidates.filter(c => c.priority === 'high').length,
    topPriorityScore: candidates.length > 0 ? candidates[0].priorityScore : 0,
    candidates
  };
}

module.exports = {
  buildRefactoringIntelligence,
  calculatePriority
};
