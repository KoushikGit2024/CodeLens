import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import RepositoryAssistantPage from '../../src/features/assistant/RepositoryAssistantPage';
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

describe('RepositoryAssistantPage', () => {
  it('renders without crashing', () => {
    renderWithProviders(<RepositoryAssistantPage />);
    // Initial state without repo should say loading or prompt
    expect(screen.getByText(/assistant/i)).toBeInTheDocument();
  });
});
