/**
 * refactoring.analyzer.js
 * 
 * It evaluates engineering risks, then extracts contextual severity metrics, 
 * and then it applies heuristic multipliers to output actionable refactoring candidates.
 */

import { SEVERITY } from './risk.analyzer.js';
import { getStrategiesForRisk } from './refactoring.strategies.js';
import { analyzeChangeImpact } from './change.impact.js';

const SEVERITY_MULTIPLIER = {
  [SEVERITY.CRITICAL]: 3.0,
  [SEVERITY.HIGH]: 2.0,
  [SEVERITY.WARNING]: 1.0
};

/**
 * It checks the risk category, then extracts the corresponding impact weight, 
 * and then it applies a decimal multiplier for the final score calculation.
 */
function estimateImpactMultiplier(riskCategory) {
  switch (riskCategory) {
    case 'DEPENDENCY': return 3.0;
    case 'ARCHITECTURE': return 2.5;
    case 'COUPLING': return 2.0;
    case 'SIZE': return 1.5;
    default: return 1.0;
  }
}

/**
 * It inspects the risk title, then extracts specific deterministic flags, 
 * and then it applies a numeric confidence rating and label.
 */
function determineConfidence(risk) {
  if (risk.title.includes('Circular Dependency')) return { score: 1.0, label: 'high' };
  if (risk.title.includes('Cross-Layer Violation')) return { score: 0.9, label: 'high' };
  if (risk.title.includes('Very large file')) return { score: 0.9, label: 'high' };
  if (risk.title.includes('Unresolved Dependencies')) return { score: 0.8, label: 'high' };
  if (risk.title.includes('Large file')) return { score: 0.7, label: 'medium' };
  if (risk.title.includes('fan-out')) return { score: 0.7, label: 'medium' };
  
  if (risk.title.includes('fan-in')) return { score: 0.5, label: 'low' }; 
  if (risk.title.includes('Isolated Module')) return { score: 0.3, label: 'low' }; 
  
  return { score: 0.5, label: 'medium' };
}

/**
 * It processes the risk object, then extracts multiplier factors, 
 * and then it applies a bounding function to generate a normalized 1-100 priority score.
 */
export function calculatePriority(risk) {
  const severityMultiplier = SEVERITY_MULTIPLIER[risk.severity] || 1.0;
  const impactMultiplier = estimateImpactMultiplier(risk.category);
  const confidence = determineConfidence(risk);
  
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

/**
 * It analyzes the risk evidence payload, then extracts file references and line numbers, 
 * and then it applies them into a unified array mapping.
 */
function extractFilesAndRangesFromRisk(risk) {
  const files = new Set();
  const fileRanges = {};

  if (risk.file) files.add(risk.file);
  
  if (risk.evidence) {
    if (risk.evidence.cyclePath) {
      risk.evidence.cyclePath.forEach(f => files.add(f));
    }
    if (risk.evidence.sourceComp && risk.evidenceFile) {
       files.add(risk.evidenceFile);
    }
    
    if (risk.evidence.location && risk.file) {
      fileRanges[risk.file] = {
        startLine: risk.evidence.location.startLine,
        endLine: risk.evidence.location.endLine
      };
    }
    
    if (risk.evidence.instances) {
      risk.evidence.instances.forEach(instance => {
        files.add(instance.filePath);
        if (instance.location) {
          fileRanges[instance.filePath] = {
            startLine: instance.location.startLine,
            endLine: instance.location.endLine
          };
        }
      });
    }
    
    if (risk.evidence.lineCount && risk.file && !fileRanges[risk.file]) {
      fileRanges[risk.file] = {
        startLine: 1,
        endLine: risk.evidence.lineCount
      };
    }
  }
  return { files: Array.from(files), fileRanges };
}

/**
 * It parses the engineering risk model, then extracts actionable items, 
 * and then it applies strategy mapping to output structured refactoring candidates.
 */
export function buildRefactoringIntelligence(engineeringRiskModel, analysis, graph) {
  const candidates = [];

  if (!engineeringRiskModel?.risks) {
    return { summary: "No risks provided.", candidateCount: 0, critical: 0, high: 0, topPriorityScore: 0, candidates: [] };
  }

  for (const risk of engineeringRiskModel.risks) {
    if (risk.title.includes('Unresolved Dependencies')) continue; 

    const priorityInfo = calculatePriority(risk);
    const strategies = getStrategiesForRisk(risk);
    const { files: affectedFiles, fileRanges } = extractFilesAndRangesFromRisk(risk);

    const idString = `${risk.title}|${risk.category}|${affectedFiles.join(',')}`;
    
    let hash = 0;
    for (let i = 0; i < idString.length; i++) {
      hash = (hash << 5) - hash + idString.charCodeAt(i);
      hash |= 0; 
    }
    const deterministicId = Math.abs(hash).toString(16).padEnd(12, '0').substring(0, 12);

    const candidate = {
      id: deterministicId,
      type: risk.category,
      title: risk.title,
      priority: priorityInfo.priority,
      priorityScore: priorityInfo.priorityScore,
      severity: risk.severity,
      confidence: priorityInfo.confidence,
      
      summary: risk.description,
      mainFile: risk.file || null,
      files: affectedFiles,
      fileRanges: fileRanges,
      evidence: risk.evidence,
      
      suggestedStrategies: strategies,
      
      // It assesses the affected files array, then extracts downstream impact using BFS, and then it applies the metrics to the candidate.
      estimatedScope: (() => {
        let direct = affectedFiles.length;
        let downstream = 0;
        if (analysis && graph && affectedFiles.length > 0) {
          try {
            const impact = analyzeChangeImpact(analysis, graph, affectedFiles);
            downstream = impact.transitivelyAffectedFiles.length;
          } catch (e) {
            console.warn("[refactoring.analyzer] Failed to calculate impact for refactoring candidate");
          }
        }
        return {
          fileCount: direct,
          downstreamImpact: downstream
        };
      })()
    };

    candidates.push(candidate);
  }

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