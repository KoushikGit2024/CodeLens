const request = require('supertest');
const express = require('express');
const { askQuestion } = require('../../../src/domains/assistant/assistant.controller');
const repositoryStore = require('../../../src/domains/repository/repository.store');
const { buildQuestionContext } = require('../../../src/domains/assistant/context/question.context');
const { generateQuestionAnswer } = require('../../../src/domains/assistant/generators/question.generator');

// Mock dependencies
jest.mock('../../../src/domains/repository/repository.store');
jest.mock('../../../src/domains/assistant/context/question.context');
jest.mock('../../../src/domains/assistant/generators/question.generator');

const app = express();
app.use(express.json());
app.post('/api/repository/:id/question', askQuestion);

describe('POST /api/repository/:id/question', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 404 if repository does not exist', async () => {
    repositoryStore.get.mockReturnValue(null);
    const res = await request(app).post('/api/repository/123/question').send({ question: 'hello' });
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('Repository not found');
  });

  it('should return 409 if repository is not ready', async () => {
    repositoryStore.get.mockReturnValue({ status: 'analyzing' });
    const res = await request(app).post('/api/repository/123/question').send({ question: 'hello' });
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toBe('Repository not ready');
  });

  it('should return 400 if question is missing', async () => {
    repositoryStore.get.mockReturnValue({ status: 'ready', analysis: {} });
    const res = await request(app).post('/api/repository/123/question').send({ question: '   ' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('non-empty "question" field');
  });

  it('should generate an answer and validate references properly', async () => {
    repositoryStore.get.mockReturnValue({
      status: 'ready',
      analysis: {
        files: [
          { filePath: 'src/valid.js', lineCount: 100 },
          { filePath: 'src/short.js', lineCount: 10 }
        ]
      }
    });

    buildQuestionContext.mockReturnValue({
      routing: { intent: 'explain', requiresAi: true },
      contextData: { foo: 'bar' }
    });

    generateQuestionAnswer.mockResolvedValue({
      references: [
        { path: 'src/valid.js', startLine: 10, endLine: 20 },
        { path: 'src/invalid.js', startLine: 5, endLine: 10 }, // doesn't exist
        { path: 'src/short.js', startLine: 5, endLine: 20 }    // end line out of bounds
      ]
    });

    const res = await request(app).post('/api/repository/123/question').send({ question: 'Explain valid.js' });
    expect(res.statusCode).toBe(200);
    expect(res.body.question).toBe('Explain valid.js');
    expect(res.body.intent).toBe('explain');
    
    // valid.js stays unchanged
    expect(res.body.answer.references[0]).toEqual({ path: 'src/valid.js', startLine: 10, endLine: 20 });
    // invalid.js is dropped entirely
    expect(res.body.answer.references.find(r => r.path === 'src/invalid.js')).toBeUndefined();
    // short.js stays, but lines are cleared because endLine > lineCount
    expect(res.body.answer.references[1]).toEqual({ path: 'src/short.js', startLine: null, endLine: null });
  });
});
