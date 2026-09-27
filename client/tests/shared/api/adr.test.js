import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import api, { repositoryApi } from '../../../src/shared/api/index.js';
import * as repositoryStore from '../../../src/services/analyzer/repository/repository.store.js';

describe('ADR Generation API', () => {
  beforeEach(() => {
    vi.spyOn(api, 'post');
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('generates a valid ADR from context', async () => {
    const mockFinding = {
      title: 'Direct Database Access from UI',
      category: 'ARCHITECTURE',
      severity: 'critical',
      description: 'UI components should not access the database directly.',
      file: 'src/ui/Component.jsx'
    };

    const mockAiResponse = {
      title: "Introduce Data Access Layer",
      status: "Proposed",
      context: "UI directly accesses DB.",
      decision: "Create a service layer.",
      consequences: "Better separation, more files.",
      alternatives: "GraphQL API",
      evidence: "src/ui/Component.jsx"
    };

    api.post.mockResolvedValueOnce({
      data: { response: JSON.stringify(mockAiResponse) }
    });

    const res = await repositoryApi.generateADR('repo-123-unique', mockFinding);
    
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith('/ai/chat', expect.objectContaining({
      jsonMode: true,
      prompt: expect.stringContaining('Direct Database Access from UI')
    }));

    expect(res.data).toBeDefined();
    expect(res.data.id).toBeDefined();
    expect(res.data.date).toBeDefined();
    expect(res.data.title).toBe(mockAiResponse.title);
  });

  it('handles invalid AI responses', async () => {
    api.post.mockResolvedValueOnce({
      data: { response: "I'm sorry, I cannot fulfill this request." }
    });

    await expect(repositoryApi.generateADR('repo-999-unique', {})).rejects.toThrow('Failed to generate ADR: Invalid AI response format');
  });

  it('returns a cached ADR on second call with same finding (cache hit skips API)', async () => {
    const mockFinding = {
      id: 'finding-cache-test',
      title: 'Cache Test Finding',
      category: 'COMPLEXITY',
      severity: 'high',
      description: 'A finding used to test cache behaviour.',
    };

    const mockAiResponse = {
      title: "Cache-Hit ADR",
      status: "Proposed",
      context: "test",
      decision: "test",
      consequences: "test",
      alternatives: "none",
      evidence: "none"
    };

    // First call — cache miss, hits the API
    api.post.mockResolvedValueOnce({ data: { response: JSON.stringify(mockAiResponse) } });
    const first = await repositoryApi.generateADR('repo-cache-unique', mockFinding);
    expect(api.post).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    vi.spyOn(api, 'post');

    // Second call with the same finding — should be served from cache
    const second = await repositoryApi.generateADR('repo-cache-unique', mockFinding);
    expect(api.post).not.toHaveBeenCalled();
    expect(second.data.title).toBe(first.data.title);
  });
});
