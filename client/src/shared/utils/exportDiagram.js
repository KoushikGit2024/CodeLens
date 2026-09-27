import { toPng, toSvg } from 'html-to-image';

/**
 * Returns true if the node or any of its ancestors should be excluded based on selected features.
 */
function isExcluded(node, excludedFeatures) {
  let current = node;
  while (current && current !== document.body) {
    if (current.classList) {
      // ALWAYS exclude the export button itself
      if (current.classList.contains('export-element-button')) return true;
      
      // Exclude specific features based on the Set provided
      if (excludedFeatures.has('breadcrumbs') && current.classList.contains('export-element-breadcrumbs')) return true;
      if (excludedFeatures.has('legend') && current.classList.contains('export-element-legend')) return true;
      if (excludedFeatures.has('controls') && current.classList.contains('react-flow__controls')) return true;
      if (excludedFeatures.has('minimap') && current.classList.contains('react-flow__minimap')) return true;
      if (excludedFeatures.has('attribution') && current.classList.contains('react-flow__attribution')) return true;
    }
    current = current.parentElement;
  }
  return false;
}

/**
 * Triggers a file download in the browser.
 */
const downloadFile = (dataUrl, filename) => {
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  link.click();
};

/**
 * Calculates the bounding box of all ReactFlow nodes to ensure nothing is cropped.
 */
const getReactFlowBounds = (element) => {
  const nodes = element.querySelectorAll('.react-flow__node');
  if (!nodes.length) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  nodes.forEach(node => {
    const transform = node.style.transform;
    const match = transform.match(/translate\(([^p]+)px,\s*([^p]+)px\)/);
    if (match) {
      const x = parseFloat(match[1]);
      const y = parseFloat(match[2]);
      const w = node.offsetWidth;
      const h = node.offsetHeight;
      
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w);
      maxY = Math.max(maxY, y + h);
    }
  });

  if (minX === Infinity) return null;

  // Add padding
  const padding = 50;
  return {
    x: minX - padding,
    y: minY - padding,
    width: (maxX - minX) + padding * 2,
    height: (maxY - minY) + padding * 2
  };
};

/**
 * Common export options configuration helper
 */
const getExportConfig = (elementRef, options) => {
  const el = elementRef.current;
  if (!el) throw new Error('Element ref is not attached');

  const {
    includeBackground = true,
    captureArea = 'full',
    excludedFeatures = new Set(['breadcrumbs', 'legend', 'controls', 'minimap', 'attribution'])
  } = options || {};

  const viewport = el.querySelector('.react-flow__viewport');
  const isReactFlow = !!viewport;
  let targetEl = isReactFlow ? viewport : el;
  
  let width = el.offsetWidth;
  let height = el.offsetHeight;
  let customStyle = { overflow: 'visible' };
  
  const backgroundColor = includeBackground ? '#0C0E14' : 'transparent';

  if (captureArea === 'full' && isReactFlow) {
    const bounds = getReactFlowBounds(el);
    if (bounds) {
      width = bounds.width;
      height = bounds.height;
      customStyle.transform = `translate(${-bounds.x}px, ${-bounds.y}px) scale(1)`;
      
      if (includeBackground) {
        customStyle.backgroundColor = backgroundColor;
      }
    }
  } else if (captureArea === 'full') {
    width = el.scrollWidth || el.offsetWidth;
    height = el.scrollHeight || el.offsetHeight;
  }
  
  return {
    targetEl,
    width,
    height,
    customStyle,
    backgroundColor,
    excludedFeatures
  };
};

/**
 * Export a DOM element to a high-quality PNG image.
 */
export const exportToPng = async (elementRef, filename = 'diagram.png', options = {}) => {
  try {
    const { targetEl, width, height, customStyle, backgroundColor, excludedFeatures } = getExportConfig(elementRef, options);

    const dataUrl = await toPng(targetEl, {
      cacheBust: true,
      backgroundColor,
      pixelRatio: 2,
      width,
      height,
      style: customStyle,
      filter: (node) => !isExcluded(node, excludedFeatures),
    });
    downloadFile(dataUrl, filename);
    return true;
  } catch (error) {
    console.error('Failed to export PNG:', error);
    throw error;
  }
};

/**
 * Export a DOM element to SVG.
 */
export const exportToSvg = async (elementRef, filename = 'diagram.svg', options = {}) => {
  try {
    const { targetEl, width, height, customStyle, backgroundColor, excludedFeatures } = getExportConfig(elementRef, options);

    const dataUrl = await toSvg(targetEl, {
      cacheBust: true,
      backgroundColor,
      width,
      height,
      style: customStyle,
      filter: (node) => !isExcluded(node, excludedFeatures),
    });
    downloadFile(dataUrl, filename);
    return true;
  } catch (error) {
    console.error('Failed to export SVG:', error);
    throw error;
  }
};
