const request = require('supertest');
const app = require('../../../src/app');
const repositoryStore = require('../../../src/domains/repository/repository.store');

jest.mock('../../../src/domains/repository/repository.store');

describe('Repository Intelligence API', () => {
  beforeEach(() => {
    repositoryStore.get.mockReturnValue({
      id: 'repo123',
      status: 'ready',
      analysis: {
        meta: { analysisVersion: 1 },
        name: 'test-repo',
        files: []
      }
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('GET /api/repository/:id/intelligence returns unified summary', async () => {
    const res = await request(app).get('/api/repository/repo123/intelligence');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('repository');
    expect(res.body).toHaveProperty('architecture');
    expect(res.body).toHaveProperty('dependencies');
    expect(res.body).toHaveProperty('engineeringHealth');
    expect(res.body).toHaveProperty('refactoring');
    expect(res.body).toHaveProperty('hotspots');
  });

  test('GET /api/repository/:id/intelligence returns 404 for missing repo', async () => {
    repositoryStore.get.mockReturnValue(null);
    const res = await request(app).get('/api/repository/repo123/intelligence');
    expect(res.statusCode).toBe(404);
  });
});
