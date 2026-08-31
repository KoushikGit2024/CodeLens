'use strict';

const repositoryStore = require('../repository/repository.store');
const persistence = require('../repository/persistence.store');
const { buildQuestionContext } = require('./context/question.context');
const { generateQuestionAnswer } = require('./generators/question.generator');

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
    const activeContext = req.body?.activeContext || null;
    const { routing, contextData } = buildQuestionContext(record.analysis, question, record.extractPath, activeContext);

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

/**
 * PUT /api/repository/:id/chat/:chatId
 * Saves a chat history back to the server's repository store.
 */
async function saveChatHistory(req, res, next) {
  try {
    const record = repositoryStore.get(req.params.id);
    if (!record) {
      return res.status(404).json({ error: 'Repository not found' });
    }

    const chatId = req.params.chatId;
    const history = req.body?.history;

    if (!chatId || !history || !Array.isArray(history)) {
      return res.status(400).json({ error: 'Invalid chat history format.' });
    }

    // Update in-memory
    if (!record.chats) record.chats = {};
    record.chats[chatId] = history;

    // Persist to disk
    persistence.saveChats(record.id, record.chats);

    return res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  askQuestion,
  saveChatHistory,
};
