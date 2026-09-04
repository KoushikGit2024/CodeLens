import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import ExplorerPage from '../../src/features/explorer/ExplorerPage';
import { RepositoryProvider } from '../../src/shared/context/RepositoryContext';
import { AIProvider } from '../../src/shared/context/AIContext';

vi.mock('../../src/shared/api', () => ({
  repositoryApi: {
    listFiles: vi.fn().mockResolvedValue({ data: { tree: [] } })
  }
}));

const renderWithProviders = (component) => {
  return render(
    <BrowserRouter>
      <RepositoryProvider>
        <AIProvider>
          {component}
        </AIProvider>
      </RepositoryProvider>
    </BrowserRouter>
  );
};

describe('ExplorerPage', () => {
  it('renders without crashing', () => {
    renderWithProviders(<ExplorerPage />);
  });
});

