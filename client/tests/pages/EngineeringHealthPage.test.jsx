import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import EngineeringHealthPage from '../../src/features/engineering/EngineeringHealthPage';
import { RepositoryProvider } from '../../src/shared/context/RepositoryContext';
import { AIProvider } from '../../src/shared/context/AIContext';

vi.mock('../../src/shared/api', () => ({
  repositoryApi: {
    get: vi.fn().mockResolvedValue({ data: { status: 'ready', analysis: { graph: {} } } }),
    listFiles: vi.fn().mockResolvedValue({ data: { tree: {} } }),
    getRisks: vi.fn().mockResolvedValue({ data: { risks: [] } })
  },
  getAiHealth: vi.fn().mockResolvedValue({ configured: true }),
  getAiStatus: vi.fn().mockResolvedValue({ providerConfigured: true, authState: 'authenticated', quotaStatus: 'available' })
}));

const renderWithProviders = (component) => {
  return render(
    <MemoryRouter initialEntries={['/explore/123/health']}>
      <Routes>
        <Route path="/explore/:repoId/health" element={
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

describe('EngineeringHealthPage', () => {
  it('renders without crashing', async () => {
    renderWithProviders(<EngineeringHealthPage />);
    await waitFor(() => {
      expect(screen.getByText(/Engineering Health/i)).toBeInTheDocument();
    });
  });
});
