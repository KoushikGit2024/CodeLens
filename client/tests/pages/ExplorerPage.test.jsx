import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import ExplorerPage from '../../src/features/explorer/ExplorerPage';
import { RepositoryProvider } from '../../src/shared/context/RepositoryContext';

vi.mock('../../src/shared/api', () => ({
  repositoryApi: {
    getTree: vi.fn().mockResolvedValue({ data: { tree: [] } })
  }
}));

const renderWithProviders = (component) => {
  return render(
    <BrowserRouter>
      <RepositoryProvider>
        {component}
      </RepositoryProvider>
    </BrowserRouter>
  );
};

describe('ExplorerPage', () => {
  it('renders without crashing', () => {
    renderWithProviders(<ExplorerPage />);
    expect(screen.getByText(/Explorer/i)).toBeInTheDocument();
  });
});
