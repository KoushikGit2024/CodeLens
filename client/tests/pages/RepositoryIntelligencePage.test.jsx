import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import RepositoryIntelligencePage from '../../src/features/repository/RepositoryIntelligencePage';
import { RepositoryProvider } from '../../src/shared/context/RepositoryContext';
import { AIProvider } from '../../src/shared/context/AIContext';

vi.mock('../../src/shared/api', () => ({
  repositoryApi: {}
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

describe('RepositoryIntelligencePage', () => {
  it('renders without crashing', () => {
    renderWithProviders(<RepositoryIntelligencePage />);
    expect(screen.getByText(/Repository Intelligence/i)).toBeInTheDocument();
  });
});
