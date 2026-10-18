import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ADRRegistryModal from '../../../src/features/engineering/ADRRegistryModal';

const mockAdrs = [
  {
    cacheKey: 'repo-test::adr::cycle-1::pv1',
    cachedAt: 1700000000000,
    data: {
      id: 'adr-1',
      title: 'Decouple Auth Module Cycle',
      status: 'Proposed',
      decision: 'Introduce EventBus for auth events',
      context: 'Direct dependency caused recursion',
      date: '2026-10-18',
    },
  },
  {
    cacheKey: 'repo-test::adr::large-file-2::pv1',
    cachedAt: 1700000500000,
    data: {
      id: 'adr-2',
      title: 'Split RepositoryIntelligencePage Component',
      status: 'Accepted',
      decision: 'Decompose into smaller sub-tab components',
      context: 'Component exceeded 700 lines with high cyclomatic complexity',
      date: '2026-10-17',
    },
  },
  {
    cacheKey: 'repo-test::adr::dead-code-3::pv1',
    cachedAt: 1700000200000,
    data: {
      id: 'adr-3',
      title: 'Deprecate Legacy Utils File',
      status: 'Deprecated',
      decision: 'Remove unused exports in v2 release',
      context: 'Zero import reachability detected in dependency graph',
      date: '2026-10-16',
    },
  },
];

vi.mock('../../../src/shared/api', () => ({
  repositoryApi: {
    listADRs: vi.fn(),
    deleteADR: vi.fn().mockResolvedValue({ success: true }),
  },
}));

describe('ADRRegistryModal', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { repositoryApi } = await import('../../../src/shared/api');
    repositoryApi.listADRs.mockResolvedValue({ data: mockAdrs });
  });

  it('renders list of ADRs with counts and status badges when open', async () => {
    render(<ADRRegistryModal isOpen={true} onClose={vi.fn()} repoId="repo-test" onSelectAdr={vi.fn()} />);

    // Wait for ADRs to load
    await waitFor(() => {
      expect(screen.getByText('Decouple Auth Module Cycle')).toBeInTheDocument();
      expect(screen.getByText('Split RepositoryIntelligencePage Component')).toBeInTheDocument();
      expect(screen.getByText('Deprecate Legacy Utils File')).toBeInTheDocument();
    });

    // Check count badge
    expect(screen.getAllByText('3').length).toBeGreaterThan(0);
  });

  it('searches and filters ADRs live by keyword', async () => {
    render(<ADRRegistryModal isOpen={true} onClose={vi.fn()} repoId="repo-test" onSelectAdr={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Decouple Auth Module Cycle')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Search ADRs by title/i);
    fireEvent.change(searchInput, { target: { value: 'Decompose' } });

    // Should match adr-2 by decision snippet "Decompose into smaller sub-tab components"
    expect(screen.getByText('Split RepositoryIntelligencePage Component')).toBeInTheDocument();
    // Others should be filtered out
    expect(screen.queryByText('Decouple Auth Module Cycle')).not.toBeInTheDocument();
    expect(screen.queryByText('Deprecate Legacy Utils File')).not.toBeInTheDocument();
  });

  it('filters by status chip (e.g. Accepted)', async () => {
    render(<ADRRegistryModal isOpen={true} onClose={vi.fn()} repoId="repo-test" onSelectAdr={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Decouple Auth Module Cycle')).toBeInTheDocument();
    });

    // Click "Accepted" filter chip
    const acceptedChip = screen.getByRole('button', { name: /Accepted/i });
    fireEvent.click(acceptedChip);

    expect(screen.getByText('Split RepositoryIntelligencePage Component')).toBeInTheDocument();
    expect(screen.queryByText('Decouple Auth Module Cycle')).not.toBeInTheDocument();
    expect(screen.queryByText('Deprecate Legacy Utils File')).not.toBeInTheDocument();
  });

  it('triggers onSelectAdr when an ADR card is clicked', async () => {
    const onSelectAdr = vi.fn();
    render(<ADRRegistryModal isOpen={true} onClose={vi.fn()} repoId="repo-test" onSelectAdr={onSelectAdr} />);

    await waitFor(() => {
      expect(screen.getByText('Decouple Auth Module Cycle')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Decouple Auth Module Cycle'));
    expect(onSelectAdr).toHaveBeenCalledTimes(1);
    expect(onSelectAdr).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Decouple Auth Module Cycle' }),
      'repo-test::adr::cycle-1::pv1'
    );
  });

  it('calls onClose when close button or Escape key is pressed', async () => {
    const onClose = vi.fn();
    const { unmount } = render(
      <ADRRegistryModal isOpen={true} onClose={onClose} repoId="repo-test" onSelectAdr={vi.fn()} />
    );

    const closeBtn = screen.getByLabelText('Close ADR registry');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);

    unmount();
  });
});
