import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { exportToPng, exportToSvg } from '../../../src/shared/utils/exportDiagram';
import * as htmlToImage from 'html-to-image';

// Mock html-to-image
vi.mock('html-to-image', () => ({
  toPng: vi.fn().mockResolvedValue('data:image/png;base64,mockpngdata'),
  toSvg: vi.fn().mockResolvedValue('data:image/svg+xml;base64,mocksvgdata'),
}));

describe('exportDiagram', () => {
  let mockElement;
  let mockElementRef;
  let createElementSpy;
  let appendChildSpy;
  let removeChildSpy;
  let mockLink;

  beforeEach(() => {
    // Setup a mock DOM element for the diagram
    mockElement = document.createElement('div');
    mockElement.className = 'diagram-container';
    Object.defineProperty(mockElement, 'offsetWidth', { value: 800 });
    Object.defineProperty(mockElement, 'offsetHeight', { value: 600 });

    // Add a mock viewport child (needed for ReactFlow check)
    const viewport = document.createElement('div');
    viewport.className = 'react-flow__viewport';
    mockElement.appendChild(viewport);

    mockElementRef = { current: mockElement };

    // Setup mock for file download
    mockLink = {
      click: vi.fn(),
      download: '',
      href: '',
    };

    const originalCreateElement = document.createElement.bind(document);
    createElementSpy = vi.spyOn(document, 'createElement').mockImplementation(tagName => {
      if (tagName === 'a') return mockLink;
      return originalCreateElement(tagName);
    });

    vi.clearAllMocks();
  });

  afterEach(() => {
    createElementSpy.mockRestore();
  });

  it('throws an error if elementRef is not attached', async () => {
    const emptyRef = { current: null };
    await expect(exportToPng(emptyRef, 'test.png')).rejects.toThrow('Element ref is not attached');
  });

  it('calls toPng and triggers download with correct arguments', async () => {
    await exportToPng(mockElementRef, 'diagram-test.png', { includeBackground: true });

    expect(htmlToImage.toPng).toHaveBeenCalledTimes(1);
    const viewport = mockElement.querySelector('.react-flow__viewport');
    expect(htmlToImage.toPng.mock.calls[0][0]).toBe(viewport);

    const options = htmlToImage.toPng.mock.calls[0][1];
    // Background matches original hex color
    expect(options.backgroundColor).not.toBe('transparent');
    expect(options.backgroundColor).toBe('#0C0E14');
    expect(options.pixelRatio).toBe(3);

    // Check download logic
    expect(mockLink.download).toBe('diagram-test.png');
    expect(mockLink.href).toBe('data:image/png;base64,mockpngdata');
    expect(mockLink.click).toHaveBeenCalledTimes(1);
  });

  it('calls toSvg and triggers download with correct arguments', async () => {
    await exportToSvg(mockElementRef, 'diagram-test.svg', { includeBackground: false });

    expect(htmlToImage.toSvg).toHaveBeenCalledTimes(1);
    const viewport = mockElement.querySelector('.react-flow__viewport');
    expect(htmlToImage.toSvg.mock.calls[0][0]).toBe(viewport);

    const options = htmlToImage.toSvg.mock.calls[0][1];
    expect(options.backgroundColor).toBe('transparent');

    // Check download logic
    expect(mockLink.download).toBe('diagram-test.svg');
    expect(mockLink.href).toBe('data:image/svg+xml;base64,mocksvgdata');
    expect(mockLink.click).toHaveBeenCalledTimes(1);
  });

  it('filters out excluded elements correctly', async () => {
    await exportToPng(mockElementRef, 'test.png', {
      excludedFeatures: new Set(['controls']),
    });

    const options = htmlToImage.toPng.mock.calls[0][1];
    const filterFn = options.filter;

    const mockControls = document.createElement('div');
    mockControls.className = 'react-flow__controls';
    mockElement.appendChild(mockControls);

    const mockButton = document.createElement('button');
    mockButton.className = 'export-element-button';
    mockElement.appendChild(mockButton);

    const mockOverlay = document.createElement('div');
    mockOverlay.className = 'export-modal-overlay';
    mockElement.appendChild(mockOverlay);

    const mockNormalElement = document.createElement('div');
    mockNormalElement.className = 'normal-element';
    mockElement.appendChild(mockNormalElement);

    expect(filterFn(mockControls)).toBe(false); // Excluded by set
    expect(filterFn(mockButton)).toBe(false); // Always excluded
    expect(filterFn(mockNormalElement)).toBe(true); // Included
  });
});
