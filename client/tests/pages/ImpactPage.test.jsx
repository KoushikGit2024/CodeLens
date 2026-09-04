import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import ImpactPage from '../../src/features/engineering/ImpactPage';
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

describe('ImpactPage', () => {
  it('renders without crashing', () => {
    renderWithProviders(<ImpactPage />);
    expect(screen.getByText(/Impact Analysis/i)).toBeInTheDocument();
  });
});
