import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ImpactPage from '../../src/features/engineering/ImpactPage';
import { RepositoryProvider } from '../../src/shared/context/RepositoryContext';
import { AIProvider } from '../../src/shared/context/AIContext';

vi.mock('../../src/shared/api', () => ({
  repositoryApi: {
    get: vi.fn().mockResolvedValue({ data: { status: 'ready', analysis: { graph: {} } } }),
    listFiles: vi.fn().mockResolvedValue({ data: { tree: {} } }),
    getChangeImpact: vi.fn().mockResolvedValue({ data: {} })
  },
  getAiHealth: vi.fn().mockResolvedValue({ configured: true }),
  getAiStatus: vi.fn().mockResolvedValue({ providerConfigured: true, authState: 'authenticated', quotaStatus: 'available' })
}));

const renderWithProviders = (component) => {
  return render(
    <MemoryRouter initialEntries={['/explore/123/impact']}>
      <Routes>
        <Route path="/explore/:repoId/impact" element={
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

describe('ImpactPage', () => {
  it('renders without crashing', async () => {
    renderWithProviders(<ImpactPage />);
    await waitFor(() => {
      expect(screen.getByText(/Impact Analysis/i)).toBeInTheDocument();
    });
  });
});
