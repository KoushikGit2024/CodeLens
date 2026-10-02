import { toPng, toSvg } from 'html-to-image';

function isExcluded(node, excludedFeatures) {
  let current = node;
  while (current && current !== document.body) {
    if (current.classList) {
      if (current.classList.contains('export-element-button')) return true;
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

const downloadFile = (dataUrl, filename) => {
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  link.click();
};

const getReactFlowBounds = element => {
  const nodes = element.querySelectorAll('.react-flow__node');
  if (!nodes.length) return null;

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;

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

  const padding = 50;
  return {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  };
};

// Safe Pixel Ratio Calculation
// We push the limit all the way up to Chrome's physical max limit (~260 Megapixels).
// This guarantees the absolute maximum possible resolution for the PNG export.
const MAX_CANVAS_AREA = 260_000_000;

const getSafePixelRatio = (width, height, requestedRatio) => {
  const baseArea = width * height;
  if (baseArea <= 0) return requestedRatio;

  const areaLimitRatio = Math.sqrt(MAX_CANVAS_AREA / baseArea);
  const safeRatio = Math.min(requestedRatio, areaLimitRatio);

  return Math.max(1, Math.min(requestedRatio, safeRatio));
};

const getExportConfig = (elementRef, options) => {
  const el = elementRef.current;
  if (!el) throw new Error('Element ref is not attached');

  const {
    includeBackground = true,
    captureArea = 'full',
    excludedFeatures = new Set(['breadcrumbs', 'legend', 'controls', 'minimap', 'attribution']),
  } = options || {};

  // We explicitly target the inner viewport to get just the graph nodes and edges
  const viewport = el.querySelector('.react-flow__viewport');
  const isReactFlow = !!viewport;
  const targetEl = isReactFlow ? viewport : el;

  let width = el.offsetWidth;
  let height = el.offsetHeight;
  let customStyle = { overflow: 'visible' };

  const backgroundColor = includeBackground ? '#0C0E14' : 'transparent';

  if (captureArea === 'full' && isReactFlow) {
    const bounds = getReactFlowBounds(el);
    if (bounds) {
      width = bounds.width;
      height = bounds.height;
      // We apply the transform to the cloned viewport so it snaps to the origin
      customStyle.transform = `translate(${-bounds.x}px, ${-bounds.y}px) scale(1)`;
    }
  } else if (captureArea === 'full') {
    width = el.scrollWidth || el.offsetWidth;
    height = el.scrollHeight || el.offsetHeight;
  }

  // Request a massive pixelRatio (3) and let the safety math clamp it precisely
  // to the absolute highest decimal point the browser can handle without blanking out!
  const safePixelRatio = getSafePixelRatio(width, height, 3);

  // Background must be applied to customStyle so html-to-image renders it behind the transparent viewport
  if (includeBackground) {
    customStyle.backgroundColor = backgroundColor;
  }

  return {
    targetEl,
    width,
    height,
    customStyle,
    backgroundColor,
    excludedFeatures,
    pixelRatio: safePixelRatio,
  };
};

export const exportToPng = async (elementRef, filename = 'diagram.png', options = {}) => {
  try {
    const { targetEl, width, height, customStyle, backgroundColor, excludedFeatures, pixelRatio } = getExportConfig(
      elementRef,
      options
    );

    if (pixelRatio < 2) {
      console.warn(
        `[export] Reduced pixelRatio to ${pixelRatio.toFixed(2)} to prevent blank image silent failure on massive graph.`
      );
    }

    const dataUrl = await toPng(targetEl, {
      cacheBust: true,
      backgroundColor,
      pixelRatio,
      width,
      height,
      style: customStyle,
      filter: node => !isExcluded(node, excludedFeatures),
    });

    if (dataUrl === 'data:,') {
      throw new Error('Browser silently failed to generate image data (graph is too massive for canvas).');
    }

    downloadFile(dataUrl, filename);
    return true;
  } catch (error) {
    console.error('Failed to export PNG:', error);
    throw error;
  }
};

export const exportToSvg = async (elementRef, filename = 'diagram.svg', options = {}) => {
  try {
    const { targetEl, width, height, customStyle, backgroundColor, excludedFeatures } = getExportConfig(
      elementRef,
      options
    );

    const dataUrl = await toSvg(targetEl, {
      cacheBust: true,
      backgroundColor,
      width,
      height,
      style: customStyle,
      filter: node => !isExcluded(node, excludedFeatures),
    });

    downloadFile(dataUrl, filename);
    return true;
  } catch (error) {
    console.error('Failed to export SVG:', error);
    throw error;
  }
};
