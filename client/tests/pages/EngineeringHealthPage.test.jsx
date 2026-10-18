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
    getRisks: vi.fn().mockResolvedValue({
      data: {
        score: 85,
        risks: [
          {
            id: 'risk-dead-code-99',
            title: 'Unreachable Export Function',
            category: 'DEAD_CODE',
            severity: 'medium',
            file: 'src/utils/legacy.js',
            description: 'Unreachable export detected in module.',
          },
          {
            id: 'risk-cycle-42',
            title: 'Circular Dependency in Auth Flow',
            category: 'ARCHITECTURE',
            severity: 'critical',
            file: 'src/auth/service.js',
            description: 'Circular import with session.js',
          },
        ],
        ignoredRisks: [],
        hotspots: [],
      },
    }),
    listADRs: vi.fn().mockResolvedValue({ data: [] }),
  },
  getAiHealth: vi.fn().mockResolvedValue({ configured: true }),
  getAiStatus: vi
    .fn()
    .mockResolvedValue({ providerConfigured: true, authState: 'authenticated', quotaStatus: 'available' }),
}));

const renderWithProviders = (component, initialRoute = '/explore/123/health') => {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <Routes>
        <Route
          path="/explore/:repoId/health"
          element={
            <RepositoryProvider>
              <AIProvider>{component}</AIProvider>
            </RepositoryProvider>
          }
        />
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

  it('filters risks by risk ID via search bar', async () => {
    renderWithProviders(<EngineeringHealthPage />, '/explore/123/health?search=risk-cycle-42');
    await waitFor(() => {
      expect(screen.getByText('Circular Dependency in Auth Flow')).toBeInTheDocument();
      expect(screen.queryByText('Unreachable Export Function')).not.toBeInTheDocument();
    });
  });

  it('filters risks by short ID snippet without risk prefix', async () => {
    renderWithProviders(<EngineeringHealthPage />, '/explore/123/health?search=cycle-42');
    await waitFor(() => {
      expect(screen.getByText('Circular Dependency in Auth Flow')).toBeInTheDocument();
      expect(screen.queryByText('Unreachable Export Function')).not.toBeInTheDocument();
    });
  });

  it('allows ID search to find risk even if a category filter is active', async () => {
    renderWithProviders(<EngineeringHealthPage />, '/explore/123/health?category=DEAD_CODE&search=cycle-42');
    await waitFor(() => {
      expect(screen.getByText('Circular Dependency in Auth Flow')).toBeInTheDocument();
    });
  });
});
