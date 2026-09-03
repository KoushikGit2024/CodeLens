import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import UploadPage from '../../src/features/repository/UploadPage';
import { RepositoryProvider } from '../../src/shared/context/RepositoryContext';

vi.mock('../../src/shared/api', () => ({
  repositoryApi: {
    getAll: vi.fn().mockResolvedValue({ data: { repositories: [] } }),
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

describe('UploadPage', () => {
  it('renders without crashing', () => {
    renderWithProviders(<UploadPage />);
    expect(screen.getByText(/CodeLens/i)).toBeInTheDocument();
    expect(screen.getByText(/Automated Code Intelligence/i)).toBeInTheDocument();
  });
});
