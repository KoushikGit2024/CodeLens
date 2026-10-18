import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ExplainFindingPanel from '../../../src/features/engineering/ExplainFindingPanel';

vi.mock('../../../src/shared/api', () => ({
  repositoryApi: {
    getRisks: vi.fn().mockResolvedValue({
      data: {
        insights: {
          summary: 'High coupling detected between auth and session modules.',
          recommendations: ['Extract token verification into shared utility', 'Use event-driven authentication'],
          observations: ['Cyclomatic complexity exceeds 15', 'Direct imports create mutual cycle'],
          limitations: 'Refactoring may require updating unit test mocks.',
        },
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

vi.mock('../../../src/shared/context/AIContext', () => ({
  useAIState: () => ({
    aiState: {
      authState: 'authenticated',
      quotaStatus: 'available',
      status: 'online',
    },
  }),
  useAI: () => ({
    messages: [],
    sendMessage: vi.fn(),
  }),
}));

const mockRisk = {
  id: 'risk-auth-cycle',
  title: 'Circular Dependency in Auth Flow',
  category: 'ARCHITECTURE',
  severity: 'critical',
  file: 'src/auth/authService.js',
  description: 'authService and sessionService import each other directly.',
  evidence: 'authService.js <-> sessionService.js',
};

describe('ExplainFindingPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when isOpen is false or risk is null', () => {
    const { container: c1 } = render(
      <ExplainFindingPanel isOpen={false} risk={mockRisk} repoId="repo-1" onClose={vi.fn()} />
    );
    expect(c1.firstChild).toBeNull();

    const { container: c2 } = render(
      <ExplainFindingPanel isOpen={true} risk={null} repoId="repo-1" onClose={vi.fn()} />
    );
    expect(c2.firstChild).toBeNull();
  });

  it('renders finding details and pre-generation action when opened', () => {
    render(
      <ExplainFindingPanel isOpen={true} risk={mockRisk} repoId="repo-1" onClose={vi.fn()} onDraftAdr={vi.fn()} />
    );

    expect(screen.getByText('AI Finding Explanation')).toBeInTheDocument();
    expect(screen.getByText('Circular Dependency in Auth Flow')).toBeInTheDocument();
    expect(screen.getByText('src/auth/authService.js')).toBeInTheDocument();
    expect(screen.getByText('Explain Finding with AI')).toBeInTheDocument();
  });

  it('prompts confirm modal and calls AI when confirmed', async () => {
    const { repositoryApi } = await import('../../../src/shared/api');

    render(
      <ExplainFindingPanel isOpen={true} risk={mockRisk} repoId="repo-1" onClose={vi.fn()} onDraftAdr={vi.fn()} />
    );

    // Click "Explain Finding with AI"
    fireEvent.click(screen.getByText('Explain Finding with AI'));

    // Confirmation dialog should be visible
    expect(screen.getByText(/AI Process & Quota/i)).toBeInTheDocument();
    expect(repositoryApi.getRisks).not.toHaveBeenCalled();

    // Confirm
    fireEvent.click(screen.getByText('Proceed to AI'));

    await waitFor(() => {
      expect(repositoryApi.getRisks).toHaveBeenCalledWith('repo-1', {
        generateAi: true,
        singleRisk: mockRisk,
      });
    });

    // Content should be populated in the AiResponse component
    await waitFor(() => {
      expect(screen.getByText(/High coupling detected/i)).toBeInTheDocument();
      expect(screen.getByText(/Extract token verification/i)).toBeInTheDocument();
    });
  });

  it('renders safely when risk.evidence is an object (e.g. complexity metrics)', () => {
    const complexRisk = {
      id: 'risk-hotspot-1',
      title: 'High Cyclomatic Complexity Function',
      category: 'COMPLEXITY',
      severity: 'high',
      file: 'src/core/parser.js',
      description: 'Function parseAST exceeds complexity threshold',
      evidence: {
        lineCount: 420,
        complexity: 35,
        threshold: 20,
        p50: 10,
        p75: 15,
        iqr: 5,
        detectionMethod: 'IQR Outlier',
      },
    };

    render(<ExplainFindingPanel isOpen={true} risk={complexRisk} repoId="repo-1" onClose={vi.fn()} />);

    expect(screen.getByText('High Cyclomatic Complexity Function')).toBeInTheDocument();
    expect(screen.getByText(/IQR Outlier/i)).toBeInTheDocument();
    expect(screen.getByText('420')).toBeInTheDocument();
  });

  it('triggers onDraftAdr when Draft ADR button is clicked', () => {
    const onDraftAdr = vi.fn();
    render(
      <ExplainFindingPanel isOpen={true} risk={mockRisk} repoId="repo-1" onClose={vi.fn()} onDraftAdr={onDraftAdr} />
    );

    const draftBtn = screen.getByTitle('Draft an Architecture Decision Record for this finding');
    fireEvent.click(draftBtn);

    expect(onDraftAdr).toHaveBeenCalledTimes(1);
    expect(onDraftAdr).toHaveBeenCalledWith(mockRisk);
  });

  it('calls onClose when close button or Escape key is pressed', () => {
    const onClose = vi.fn();
    const { unmount } = render(<ExplainFindingPanel isOpen={true} risk={mockRisk} repoId="repo-1" onClose={onClose} />);

    const closeBtn = screen.getByLabelText('Close explanation panel');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);

    unmount();
  });
});
