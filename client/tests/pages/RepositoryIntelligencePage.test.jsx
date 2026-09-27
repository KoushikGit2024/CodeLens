import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import RepositoryIntelligencePage from '../../src/features/repository/RepositoryIntelligencePage';
import { RepositoryProvider } from '../../src/shared/context/RepositoryContext';
import { AIProvider } from '../../src/shared/context/AIContext';

vi.mock('../../src/shared/api', () => ({
  repositoryApi: {
    get: vi.fn().mockResolvedValue({ data: { status: 'ready', analysis: { graph: {} } } }),
    listFiles: vi.fn().mockResolvedValue({ data: { tree: {} } }),
    getIntelligence: vi.fn().mockResolvedValue({ data: { 
      overall_risk_score: 50,
      risk_factors: [],
      architecture: { summary: "test" },
      complexity: { average_cyclomatic_complexity: 1 },
      documentation: { undocumented_functions_count: 0 },
      quality: { files_with_high_churn: [] },
      repository: { fileCount: 1, loc: 100, languages: { JS: 1 } },
      dependencies: { nodes: 0, edges: 0 },
      engineeringHealth: { score: 100 },
      refactoring: { candidateCount: 0 }
    } })
  },
  getAiHealth: vi.fn().mockResolvedValue({ configured: true }),
  getAiStatus: vi.fn().mockResolvedValue({ providerConfigured: true, authState: 'authenticated', quotaStatus: 'available' })
}));

const renderWithProviders = (component) => {
  return render(
    <MemoryRouter initialEntries={['/explore/123']}>
      <Routes>
        <Route path="/explore/:repoId" element={
          <RepositoryProvider>
            <AIProvider>
              {component}
            </AIProvider>
          </RepositoryProvider>
        } />
      </Routes>
    </MemoryRouter>
  );
};

describe('RepositoryIntelligencePage', () => {
  it('renders without crashing', async () => {
    renderWithProviders(<RepositoryIntelligencePage />);
    await waitFor(() => {
      expect(screen.getByText(/Repository Assistant/i)).toBeInTheDocument();
    });
  });
});
