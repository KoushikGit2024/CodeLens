const request = require('supertest');
const express = require('express');
const repositoryStore = require('../../src/repositories/repositoryStore');
const repositoryRoutes = require('../../src/routes/repository');

jest.mock('../../src/repositories/repositoryStore');
jest.mock('../../src/ai/engineeringInsights', () => ({
  getEngineeringInsights: jest.fn().mockResolvedValue({
    summary: 'Mocked AI summary',
    priorityRisks: [],
    observations: [],
    recommendations: [],
    limitations: 'None'
  })
}));

describe('Engineering Health Endpoints', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/repository', repositoryRoutes);
    jest.clearAllMocks();
  });

  const mockAnalysis = {
    meta: { analysisVersion: 1 },
    files: [
      {
        filePath: 'src/App.js',
        language: 'javascript',
        lineCount: 600, // triggers SIZE risk
        symbols: []
      },
      {
        filePath: 'src/api.js',
        language: 'javascript',
        lineCount: 100,
        symbols: Array(20).fill({ kind: 'export', name: 'sym' }) // triggers API surface risk
      }
    ]
  };

  it('GET /api/repository/:id/risks returns 404 if not found', async () => {
    repositoryStore.get.mockReturnValue(null);
    const res = await request(app).get('/api/repository/123/risks');
    expect(res.status).toBe(404);
  });

  it('GET /api/repository/:id/risks returns risks model', async () => {
    repositoryStore.get.mockReturnValue({
      id: '123',
      status: 'ready',
      analysis: mockAnalysis
    });

    const res = await request(app).get('/api/repository/123/risks');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('score');
    expect(res.body).toHaveProperty('riskLevel');
    expect(res.body.metrics.totalRisks).toBeGreaterThan(0);
    expect(res.body.risks.some(r => r.category === 'SIZE')).toBe(true);
  });

  it('GET /api/repository/:id/risks/insights returns AI insights', async () => {
    repositoryStore.get.mockReturnValue({
      id: '123',
      status: 'ready',
      analysis: mockAnalysis
    });

    const res = await request(app).get('/api/repository/123/risks/insights');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('summary', 'Mocked AI summary');
  });
});
