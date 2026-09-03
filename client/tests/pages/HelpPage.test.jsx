import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import HelpPage from '../../src/features/help/HelpPage';
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

describe('HelpPage', () => {
  it('renders without crashing', () => {
    renderWithProviders(<HelpPage />);
    expect(screen.getByText(/Welcome to CodeLens/i)).toBeInTheDocument();
  });
});
