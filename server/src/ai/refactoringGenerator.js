'use strict';

const { generateStructuredResponse } = require('./aiProvider');
const { buildCandidateContext } = require('./refactoringContextBuilder');

const REFACTORING_SCHEMA = {
  type: 'object',
  properties: {
    summary: { 
      type: 'string', 
      description: 'High-level summary of the refactoring candidate and why it is important.' 
    },
    recommendations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          strategy: { type: 'string', description: 'Name of the strategy.' },
          reasoning: { type: 'string', description: 'Why this strategy is suitable for this specific codebase based on context.' },
          expectedBenefits: { type: 'array', items: { type: 'string' } },
          risks: { type: 'array', items: { type: 'string' } },
          steps: { type: 'array', items: { type: 'string' } },
          references: {
             type: 'array',
             items: {
                type: 'object',
                properties: {
                   path: { type: 'string', description: 'File path referenced' },
                   reason: { type: 'string', description: 'Why this file is referenced' }
                },
                required: ['path', 'reason']
             }
          }
        },
        required: ['strategy', 'reasoning', 'expectedBenefits', 'risks', 'steps']
      }
    },
    limitations: {
      type: 'array',
      items: { type: 'string' },
      description: 'Any limitations or missing context that might affect this recommendation.'
    }
  },
  required: ['summary', 'recommendations', 'limitations']
};

/**
 * Get AI-assisted refactoring insights for a specific candidate.
 */
async function getRefactoringInsights(candidate, impactReport) {
  const context = buildCandidateContext(candidate, impactReport);

  const prompt = `You are a Principal Software Engineer guiding a team on technical debt remediation.
Review the following deterministic Refactoring Candidate and its Change Impact profile.

Context:
${context}

Your task:
Analyze this candidate and provide actionable, structured recommendations.
1. Choose the best strategies (you can select from the provided deterministic strategies or suggest your own if applicable).
2. Detail a step-by-step approach to safely executing the refactor.
3. Factor in the impact report: if many components are affected, emphasize safety, testing, and backward compatibility.
4. Only reference files that are provided in the context (Primary files or affected files). DO NOT invent file names.
5. Provide the output in strict JSON matching the required schema.

Output JSON only. Do not use markdown wrappers.`;

  try {
    const rawAiResponse = await generateStructuredResponse(prompt, REFACTORING_SCHEMA);
    let parsed;
    try {
      parsed = JSON.parse(rawAiResponse);
    } catch (err) {
      console.warn('[refactoringGenerator] Failed to parse AI JSON:', err.message);
      return {
        summary: "AI generated an invalid response.",
        recommendations: [],
        limitations: ["Failed to parse AI output."]
      };
    }

    // Validate references against the deterministic context to prevent hallucinations
    const allowedFiles = new Set([
      ...candidate.files,
      ...(impactReport ? impactReport.directlyAffectedFiles : []),
      ...(impactReport ? impactReport.transitivelyAffectedFiles : [])
    ]);

    if (parsed.recommendations) {
      for (const rec of parsed.recommendations) {
        if (rec.references) {
          rec.references = rec.references.filter(ref => allowedFiles.has(ref.path));
        }
      }
    }

    return parsed;
  } catch (err) {
    console.error('[refactoringGenerator] AI Provider error:', err.message);
    throw new Error(`AI Provider failed to generate refactoring insights: ${err.message}`);
  }
}

module.exports = {
  getRefactoringInsights
};
