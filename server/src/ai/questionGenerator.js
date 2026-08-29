'use strict';

/**
 * questionGenerator.js
 *
 * Orchestrates sending the context to Watsonx and returning a structured
 * RepositoryAnswer. Handles factual extraction when AI is not needed.
 */

const { generateAnswer, isProviderConfigured, ProviderUnavailableError } = require('./aiProvider');

/**
 * Generate an answer for a question based on its routing and context.
 *
 * @param {string} question
 * @param {object} routing
 * @param {object} contextData
 * @returns {Promise<object>} The RepositoryAnswer
 */
async function generateQuestionAnswer(question, routing, contextData) {
  // If the question is deterministic and AI is not required
  if (!routing.requiresAi) {
    return {
      summary: "Answered using deterministic repository analysis.",
      explanation: null,
      facts: contextData.facts,
      inferences: [],
      references: routing.targetFile ? [{ path: routing.targetFile, reason: 'Target of query' }] : [],
      limitations: [],
      generatedBy: 'CodeLens Deterministic Engine',
    };
  }

  // If AI is required but not configured, fallback gracefully
  if (!isProviderConfigured()) {
    return {
      summary: "AI provider is not configured. Falling back to deterministic context.",
      explanation: null,
      facts: contextData.facts,
      inferences: [],
      references: contextData.files.map(f => ({ path: f.path, reason: f.reason })),
      limitations: ["AI provider unavailable. Cannot provide inferences or detailed explanations."],
      generatedBy: 'CodeLens Deterministic Engine',
    };
  }

  const prompt = buildQuestionPrompt(question, contextData);

  try {
    const aiResponseStr = await generateAnswer(prompt);
    
    // Parse the response
    let parsed = null;
    try {
      const cleanStr = aiResponseStr.replace(/^```(?:json)?\n?/i, '').replace(/```$/i, '').trim();
      parsed = JSON.parse(cleanStr);
    } catch (parseErr) {
      console.warn('[questionGenerator] Failed to parse AI JSON:', parseErr.message);
      // Fallback
      parsed = {
        summary: aiResponseStr,
        explanation: null,
        facts: [],
        inferences: [],
        references: [],
        limitations: ["Failed to parse structured AI output."]
      };
    }

    // Ensure the response matches our schema
    return {
      summary: parsed.summary || "No summary provided.",
      explanation: parsed.explanation || null,
      facts: Array.isArray(parsed.facts) ? parsed.facts : contextData.facts, // Merge or use AI's
      inferences: Array.isArray(parsed.inferences) ? parsed.inferences : [],
      references: Array.isArray(parsed.references) ? parsed.references : extractReferences(aiResponseStr),
      limitations: Array.isArray(parsed.limitations) ? parsed.limitations : [],
      generatedBy: 'IBM watsonx',
    };

  } catch (err) {
    if (err instanceof ProviderUnavailableError) {
      return {
        summary: "AI provider is unavailable. Falling back to deterministic context.",
        explanation: null,
        facts: contextData.facts,
        inferences: [],
        references: contextData.files.map(f => ({ path: f.path, reason: f.reason })),
        limitations: ["AI provider unavailable.", err.message],
        generatedBy: 'CodeLens Deterministic Engine',
      };
    }
    throw err;
  }
}

function buildQuestionPrompt(question, contextData) {
  const lines = [];
  lines.push('You are CodeLens, an AI-driven Code Intelligence assistant.');
  lines.push('Answer the user\'s question about the repository using ONLY the provided context.');
  lines.push('Rules:');
  lines.push('- Do NOT invent files, dependencies, or functions that are not provided.');
  lines.push('- You must output your response as raw JSON matching the exact structure below.');
  lines.push('- Do NOT use markdown code blocks like ```json.');
  lines.push('');
  lines.push('JSON Schema:');
  lines.push('{');
  lines.push('  "summary": "A brief 1-2 sentence direct answer",');
  lines.push('  "explanation": "A detailed explanation, if necessary. Use markdown internally.",');
  lines.push('  "facts": ["List of deterministic facts from the context used"],');
  lines.push('  "inferences": ["List of inferences or conclusions you drew from the facts"],');
  lines.push('  "references": [ { "path": "src/file.js", "startLine": 10, "endLine": 20, "reason": "why it is relevant" } ],');
  lines.push('  "limitations": ["Any limitations or things you cannot determine from the context"]');
  lines.push('}');
  lines.push('');
  
  lines.push('Context Facts:');
  contextData.facts.forEach(f => lines.push('- ' + f));
  lines.push('');

  if (contextData.files.length > 0) {
    lines.push(`Context Files (${contextData.files.length}):`);
    contextData.files.forEach(f => {
      lines.push(`--- FILE: ${f.path} ---`);
      if (f.symbols.length > 0) lines.push(`Symbols: ${f.symbols.join(', ')}`);
      if (f.dependencies.length > 0) lines.push(`Imports: ${f.dependencies.join(', ')}`);
      if (f.source) {
        lines.push('Source snippet:');
        lines.push(f.source);
      }
      lines.push('');
    });
  }

  lines.push(`Question: ${question}`);

  return lines.join('\n');
}

function extractReferences(answer) {
  const pattern = /\[([^\]]+\.[a-zA-Z]{1,6}(?::\d+(?:-\d+)?)?)\]/g;
  const found   = new Map();
  let match;

  while ((match = pattern.exec(answer)) !== null) {
    const raw   = match[1];
    const colon = raw.lastIndexOf(':');
    let filePath, lines, startLine = null, endLine = null;

    if (colon > 0 && /^\d/.test(raw.slice(colon + 1))) {
      filePath = raw.slice(0, colon);
      lines    = raw.slice(colon + 1);
      const parts = lines.split('-');
      startLine = parseInt(parts[0], 10);
      if (parts.length > 1) {
        endLine = parseInt(parts[1], 10);
      }
    } else {
      filePath = raw;
    }

    if (!found.has(filePath)) {
      found.set(filePath, { path: filePath, startLine, endLine, reason: 'Extracted from text' });
    }
  }

  return Array.from(found.values());
}

module.exports = {
  generateQuestionAnswer,
};
