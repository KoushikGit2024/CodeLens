import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ExplorerPage from '../../src/features/explorer/ExplorerPage';
import { RepositoryProvider } from '../../src/shared/context/RepositoryContext';
import { AIProvider } from '../../src/shared/context/AIContext';

vi.mock('../../src/shared/api', () => ({
  repositoryApi: {
    get: vi.fn().mockResolvedValue({
      data: { id: 'test-repo', status: 'ready', name: 'Test Repo' },
    }),
    listFiles: vi.fn().mockResolvedValue({
      data: {
        tree: [
          {
            name: 'App.jsx',
            type: 'file',
            path: 'client/src/app/App.jsx',
          },
        ],
      },
    }),
    getFile: vi.fn().mockResolvedValue({
      data: { content: 'export default function App() {}', language: 'javascript' },
    }),
    getModuleDocumentation: vi.fn().mockResolvedValue({ data: null }),
    askQuestion: vi.fn().mockResolvedValue({
      data: { response: 'This file handles application bootstrapping.' },
    }),
  },
  getAiStatus: vi.fn().mockResolvedValue({ configured: true }),
}));

const renderWithProviders = (component, route = '/explore/test-repo/source?path=client/src/app/App.jsx') => {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route
          path="/explore/:repoId/source"
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

describe('ExplorerPage', () => {
  it('renders without crashing', async () => {
    renderWithProviders(<ExplorerPage />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Ask a question…')).toBeInTheDocument();
    });
  });

  it('submits AI question and handles proxy response without summary crash', async () => {
    renderWithProviders(<ExplorerPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Ask a question…')).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText('Ask a question…');
    fireEvent.change(input, { target: { value: 'what this file does?' } });

    const submitBtn = input.closest('form').querySelector('button[type="submit"]');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/This file handles application bootstrapping/i)).toBeInTheDocument();
    });
  });
});
