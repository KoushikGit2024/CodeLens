import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import DependencyGraphPage from '../../src/features/dependencies/DependencyGraphPage';
import { RepositoryProvider } from '../../src/shared/context/RepositoryContext';

vi.mock('../../src/shared/api', () => ({
  repositoryApi: {}
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

describe('DependencyGraphPage', () => {
  it('renders without crashing', () => {
    renderWithProviders(<DependencyGraphPage />);
    expect(screen.getByText(/Dependencies/i)).toBeInTheDocument();
  });
});
