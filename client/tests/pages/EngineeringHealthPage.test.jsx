import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import EngineeringHealthPage from '../../src/features/engineering/EngineeringHealthPage';
import { RepositoryProvider } from '../../src/shared/context/RepositoryContext';

vi.mock('../../src/shared/api', () => ({
  repositoryApi: {
    getRisks: vi.fn().mockResolvedValue({ data: { risks: [] } })
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

describe('EngineeringHealthPage', () => {
  it('renders without crashing', () => {
    renderWithProviders(<EngineeringHealthPage />);
    expect(screen.getByText(/Engineering Health/i)).toBeInTheDocument();
  });
});
