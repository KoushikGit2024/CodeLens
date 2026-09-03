import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import RepositoryIntelligencePage from '../../src/features/repository/RepositoryIntelligencePage';
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

describe('RepositoryIntelligencePage', () => {
  it('renders without crashing', () => {
    renderWithProviders(<RepositoryIntelligencePage />);
    expect(screen.getByText(/Repository Intelligence/i)).toBeInTheDocument();
  });
});
