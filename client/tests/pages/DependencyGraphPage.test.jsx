import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import DependencyGraphPage from '../../src/features/dependencies/DependencyGraphPage';
import { RepositoryProvider } from '../../src/shared/context/RepositoryContext';
import { AIProvider } from '../../src/shared/context/AIContext';

vi.mock('../../src/shared/api', () => ({
  repositoryApi: {
    getDependencyGraph: vi.fn().mockResolvedValue({ data: { nodes: [], edges: [] } })
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

describe('DependencyGraphPage', () => {
  it('renders without crashing', () => {
    renderWithProviders(<DependencyGraphPage />);
    expect(screen.getByText(/Building dependency graph/i)).toBeInTheDocument();
  });
});

