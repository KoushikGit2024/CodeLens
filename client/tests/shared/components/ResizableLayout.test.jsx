import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ResizableLayout } from '../../../src/shared/components/ResizableLayout';

describe('ResizableLayout', () => {
  const defaultPanels = [
    {
      id: 'left',
      title: 'Sidebar',
      minWidth: 200,
      defaultSize: 30,
      collapsible: true,
      collapseDirection: 'left',
      content: <div>Left Content</div>,
    },
    {
      id: 'right',
      title: 'Main Area',
      minWidth: 400,
      defaultSize: 70,
      content: <div>Right Content</div>,
    },
  ];

  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 1000,
      height: 600,
      top: 0,
      left: 0,
      right: 1000,
      bottom: 600,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders panels and an accessible separator with proper ARIA attributes', () => {
    render(<ResizableLayout panels={defaultPanels} />);

    expect(screen.getByText('Left Content')).toBeInTheDocument();
    expect(screen.getByText('Right Content')).toBeInTheDocument();

    const separator = screen.getByRole('separator');
    expect(separator).toBeInTheDocument();
    expect(separator).toHaveAttribute('tabIndex', '0');
    expect(separator).toHaveAttribute('aria-orientation', 'vertical');
    expect(separator).toHaveAttribute('aria-valuenow', '30');
    expect(separator).toHaveAttribute('aria-label', expect.stringContaining('Resize divider'));
  });

  it('has lowered z-index (z-10) to avoid overlapping top-level popups', () => {
    render(<ResizableLayout panels={defaultPanels} />);

    const separator = screen.getByRole('separator');
    expect(separator.className).toContain('z-10');
    expect(separator.className).not.toContain('z-40');
  });

  it('allows keyboard navigation via ArrowLeft and ArrowRight keys', () => {
    render(<ResizableLayout panels={defaultPanels} />);

    const separator = screen.getByRole('separator');

    // Focus separator
    separator.focus();
    expect(document.activeElement).toBe(separator);

    // ArrowRight should increase left panel width by step (1%)
    fireEvent.keyDown(separator, { key: 'ArrowRight' });
    expect(separator).toHaveAttribute('aria-valuenow', '31');

    // ArrowLeft should decrease left panel width
    fireEvent.keyDown(separator, { key: 'ArrowLeft' });
    expect(separator).toHaveAttribute('aria-valuenow', '30');

    // Shift + ArrowRight should step by 5%
    fireEvent.keyDown(separator, { key: 'ArrowRight', shiftKey: true });
    expect(separator).toHaveAttribute('aria-valuenow', '35');
  });

  it('handles Home and End keys for jumping to boundary sizes', () => {
    // Mock container width
    const { container } = render(<ResizableLayout panels={defaultPanels} />);
    const root = container.firstChild;
    vi.spyOn(root, 'getBoundingClientRect').mockReturnValue({
      width: 1000,
      height: 600,
      top: 0,
      left: 0,
      right: 1000,
      bottom: 600,
    });

    const separator = screen.getByRole('separator');

    // Home should jump to min left size (200px / 1000px = 20%)
    fireEvent.keyDown(separator, { key: 'Home' });
    expect(separator).toHaveAttribute('aria-valuenow', '20');

    // End should jump to max left size (100 - (400/1000 = 40%) = 60%)
    fireEvent.keyDown(separator, { key: 'End' });
    expect(separator).toHaveAttribute('aria-valuenow', '60');
  });

  it('toggles collapse on Enter key', () => {
    render(<ResizableLayout panels={defaultPanels} />);

    const separator = screen.getByRole('separator');

    // Press Enter to collapse left panel
    fireEvent.keyDown(separator, { key: 'Enter' });

    // Panel should now show collapsed title or button
    expect(screen.queryByText('Left Content')).not.toBeInTheDocument();
    expect(screen.getByTitle('Expand Sidebar')).toBeInTheDocument();

    // Press Enter again to expand
    fireEvent.keyDown(separator, { key: 'Enter' });
    expect(screen.getByText('Left Content')).toBeInTheDocument();
  });
});
