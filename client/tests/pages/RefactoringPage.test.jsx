import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import RefactoringPage from '../../src/features/engineering/RefactoringPage';
import { RepositoryProvider } from '../../src/shared/context/RepositoryContext';
import { AIProvider } from '../../src/shared/context/AIContext';

vi.mock('../../src/shared/api', () => ({
  repositoryApi: {
    getRefactoring: vi.fn().mockResolvedValue({ data: { candidates: [] } })
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

describe('RefactoringPage', () => {
  it('renders without crashing', () => {
    renderWithProviders(<RefactoringPage />);
    expect(screen.getByText(/Refactoring/i)).toBeInTheDocument();
  });
});
