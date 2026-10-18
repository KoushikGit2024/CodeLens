import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ADRPanel from '../../../src/features/engineering/ADRPanel';

vi.mock('../../../src/shared/api', () => ({
  repositoryApi: {
    generateADR: vi.fn().mockResolvedValue({
      data: {
        id: 'mock-adr-1',
        title: 'Refactor Circular Dependency',
        status: 'Proposed',
        context: 'Circular dependency between module A and B',
        decision: 'Extract shared interface into module C',
        consequences: 'Eliminates cycle, adds 1 file',
        alternatives: 'Merge A and B',
        evidence: 'A.js -> B.js -> A.js',
        date: '2026-10-18',
      },
    }),
  },
}));

vi.mock('../../../src/services/analyzer/repository/repository.store.js', () => ({
  repositoryStore: {
    get: vi.fn().mockResolvedValue({ analysisVersion: 1 }),
  },
}));

vi.mock('../../../src/services/storage/aiArtifact.store.js', () => ({
  aiArtifactStore: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(true),
  },
  buildCacheKey: vi.fn().mockReturnValue('mock-cache-key'),
}));

const mockRisk = {
  id: 'risk-cycle-1',
  title: 'Dependency Cycle Detected',
  category: 'ARCHITECTURE',
  severity: 'critical',
  file: 'src/moduleA.js',
  description: 'Module A and Module B form a circular dependency.',
};

describe('ADRPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders pre-generation overview and does NOT automatically generate ADR', async () => {
    const { repositoryApi } = await import('../../../src/shared/api');

    render(
      <ADRPanel repoId="repo-test" risk={mockRisk} onClose={vi.fn()} />
    );

    // Displays the finding title and pre-generation action
    expect(screen.getAllByText('Draft Architecture Decision Record').length).toBeGreaterThan(0);
    expect(screen.getByText('Dependency Cycle Detected')).toBeInTheDocument();
    expect(screen.getByText('Draft ADR with AI')).toBeInTheDocument();

    // Verify AI generation was NOT called automatically on mount
    expect(repositoryApi.generateADR).not.toHaveBeenCalled();
  });

  it('prompts confirmation modal when "Draft ADR with AI" is clicked, and calls generate only after confirm', async () => {
    const { repositoryApi } = await import('../../../src/shared/api');

    render(
      <ADRPanel repoId="repo-test" risk={mockRisk} onClose={vi.fn()} />
    );

    // Click "Draft ADR with AI"
    fireEvent.click(screen.getByText('Draft ADR with AI'));

    // Confirmation modal should appear with token warning
    expect(screen.getByText('Draft Architecture Decision Record?')).toBeInTheDocument();
    expect(screen.getByText(/AI Token Consumption Warning/i)).toBeInTheDocument();
    expect(screen.getAllByText(/~800 tokens/i).length).toBeGreaterThan(0);

    // API should not have been called yet
    expect(repositoryApi.generateADR).not.toHaveBeenCalled();

    // Confirm generation
    fireEvent.click(screen.getByText('Confirm & Generate ADR'));

    await waitFor(() => {
      expect(repositoryApi.generateADR).toHaveBeenCalledTimes(1);
      expect(repositoryApi.generateADR).toHaveBeenCalledWith('repo-test', mockRisk);
    });

    // ADR content should be populated
    await waitFor(() => {
      expect(screen.getByDisplayValue('Refactor Circular Dependency')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Extract shared interface into module C')).toBeInTheDocument();
    });
  });
});
