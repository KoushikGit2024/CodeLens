import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ConfirmAiModal from '../../../src/shared/components/ai/ConfirmAiModal';

describe('ConfirmAiModal', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = render(<ConfirmAiModal isOpen={false} onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders title, description, and token warning when isOpen is true', () => {
    render(
      <ConfirmAiModal
        isOpen={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="Generate AI Interpretation?"
        subtitle="Repository Structural Health"
        description="Synthesize your codebase metrics using AI."
        tokenEstimate="~1,200 tokens"
        confirmText="Confirm & Generate"
      />
    );

    expect(screen.getByText('Generate AI Interpretation?')).toBeInTheDocument();
    expect(screen.getByText('Repository Structural Health')).toBeInTheDocument();
    expect(screen.getByText('Synthesize your codebase metrics using AI.')).toBeInTheDocument();
    expect(screen.getByText(/~1,200 tokens/i)).toBeInTheDocument();
    expect(screen.getByText('Confirm & Generate')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('calls onConfirm when confirm button is clicked', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();

    render(<ConfirmAiModal isOpen={true} onClose={onClose} onConfirm={onConfirm} confirmText="Confirm Action" />);

    fireEvent.click(screen.getByText('Confirm Action'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose when Cancel button or escape key is pressed', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();

    render(<ConfirmAiModal isOpen={true} onClose={onClose} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
