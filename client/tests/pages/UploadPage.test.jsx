import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import UploadPage from '../../src/features/repository/UploadPage';
import { RepositoryProvider } from '../../src/shared/context/RepositoryContext';
import { AIProvider } from '../../src/shared/context/AIContext';

vi.mock('../../src/shared/api', () => ({
  repositoryApi: {
    getAll: vi.fn().mockResolvedValue({ data: { repositories: [] } }),
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

describe('UploadPage', () => {
  it('renders without crashing', () => {
    renderWithProviders(<UploadPage />);
    expect(screen.getByText(/CodeLens/i)).toBeInTheDocument();
  });
});

