const request = require('supertest');
const app = require('../../../src/app');
const repositoryStore = require('../../../src/domains/repository/repository.store');

jest.mock('../../../src/domains/repository/repository.store');

describe('Refactoring API', () => {
  let mockAnalysis;

  beforeEach(() => {
    mockAnalysis = {
      meta: { analysisVersion: 1 },
      name: 'test-repo',
      files: [
        { filePath: 'src/a.js', symbols: [], language: 'javascript' },
        { filePath: 'src/b.js', symbols: [], language: 'javascript' }
      ]
    };

    repositoryStore.get.mockReturnValue({
      id: 'repo123',
      analysis: mockAnalysis,
      status: 'ready'
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('GET /api/repository/:id/refactoring returns intelligence model', async () => {
    const res = await request(app).get('/api/repository/repo123/refactoring');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('candidateCount');
    expect(res.body).toHaveProperty('candidates');
  });

  test('GET /api/repository/:id/refactoring/:candidateId returns 404 for missing candidate', async () => {
    const res = await request(app).get('/api/repository/repo123/refactoring/missing_id');
    expect(res.statusCode).toBe(404);
  });
});
