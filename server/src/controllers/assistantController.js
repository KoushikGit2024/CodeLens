'use strict';

const repositoryStore = require('../repositories/repositoryStore');
const { buildQuestionContext } = require('../ai/questionContextBuilder');
const { generateQuestionAnswer } = require('../ai/questionGenerator');

/**
 * assistantController.js
 *
 * Handles POST /api/repository/:id/question
 */

async function askQuestion(req, res, next) {
  try {
    const record = repositoryStore.get(req.params.id);
    if (!record) {
      return res.status(404).json({ error: 'Repository not found' });
    }
    if (record.status !== 'ready') {
      return res.status(409).json({ error: 'Repository not ready', status: record.status });
    }
    if (!record.analysis) {
      return res.status(404).json({ error: 'Analysis not available' });
    }

    const question = (req.body?.question || '').trim();
    if (!question) {
      return res.status(400).json({ error: 'Request body must include a non-empty "question" field.' });
    }
    if (question.length > 2000) {
      return res.status(400).json({ error: 'Question is too long (max 2000 characters).' });
    }

    // Build the context and route the intent
    const { routing, contextData } = buildQuestionContext(record.analysis, question, record.extractPath);

    // Generate the answer (may hit AI, or answer deterministically)
    const answer = await generateQuestionAnswer(question, routing, contextData);

    // Validate references against actual repository files
    if (answer.references && Array.isArray(answer.references)) {
      const validReferences = [];
      for (const ref of answer.references) {
        const fileNode = record.analysis.files.find(f => f.filePath === ref.path);
        if (!fileNode) continue; // Drop hallucinatory paths
        
        if (ref.startLine) {
          const start = parseInt(ref.startLine, 10);
          const end = ref.endLine ? parseInt(ref.endLine, 10) : start;
          
          if (isNaN(start) || start < 1 || start > fileNode.lineCount || (end && end > fileNode.lineCount)) {
            ref.startLine = null;
            ref.endLine = null;
          }
        }
        validReferences.push(ref);
      }
      answer.references = validReferences;
    }

    return res.json({
      question,
      intent: routing.intent,
      requiresAi: routing.requiresAi,
      answer,
    });
  } catch (err) {
    console.error('[assistantController] Question failed:', err);
    next(err);
  }
}

module.exports = {
  askQuestion,
};
