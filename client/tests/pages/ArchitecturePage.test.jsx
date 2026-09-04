import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import ArchitecturePage from '../../src/features/architecture/ArchitecturePage';
import { RepositoryProvider } from '../../src/shared/context/RepositoryContext';
import { AIProvider } from '../../src/shared/context/AIContext';

vi.mock('../../src/shared/api', () => ({
  repositoryApi: {
    getArchitecture: vi.fn().mockResolvedValue({ data: { nodes: [], edges: [] } }),
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

describe('ArchitecturePage', () => {
  it('renders without crashing', () => {
    renderWithProviders(<ArchitecturePage />);
    expect(screen.getByText(/Architecture/i)).toBeInTheDocument();
  });
});
