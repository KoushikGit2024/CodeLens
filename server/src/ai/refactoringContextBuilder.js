'use strict';

/**
 * Builds deterministic context for IBM watsonx to analyze a specific
 * refactoring candidate.
 */

function buildCandidateContext(candidate, impactReport) {
  let context = `Refactoring Candidate Information:\n`;
  context += `Title: ${candidate.title}\n`;
  context += `Category: ${candidate.type}\n`;
  context += `Priority: ${candidate.priority.toUpperCase()} (Score: ${candidate.priorityScore})\n`;
  context += `Confidence: ${candidate.confidence}\n`;
  context += `Summary: ${candidate.summary}\n\n`;

  context += `Primary Files Involved:\n`;
  candidate.files.forEach(f => {
    context += `- ${f}\n`;
  });
  context += `\n`;

  if (impactReport) {
    context += `Impact Analysis:\n`;
    context += `- Directly Affected Files: ${impactReport.directlyAffectedFiles.length}\n`;
    context += `- Transitively Affected Files: ${impactReport.transitivelyAffectedFiles.length}\n`;
    context += `- Affected Architectural Components: ${impactReport.affectedComponents.length}\n`;
    if (impactReport.affectedComponents.length > 0) {
       context += `  (${impactReport.affectedComponents.join(', ')})\n`;
    }
    context += `\n`;
  }

  context += `Deterministic Suggested Strategies:\n`;
  if (candidate.suggestedStrategies && candidate.suggestedStrategies.length > 0) {
    candidate.suggestedStrategies.forEach((strategy, i) => {
      context += `[Strategy ${i + 1}] ${strategy.action}: ${strategy.description}\n`;
      context += `  Benefits: ${strategy.expectedBenefits.join(', ')}\n`;
      context += `  Risks: ${strategy.risks.join(', ')}\n`;
    });
  } else {
    context += `(No predefined strategies available. AI must determine.)\n`;
  }

  return context;
}

module.exports = {
  buildCandidateContext
};
