import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, ImageIcon, FileCode2, Loader2, X } from 'lucide-react';
import { exportToPng, exportToSvg } from '../utils/exportDiagram';

/**
 * A button that opens a dialog to export a referenced DOM element to PNG or SVG.
 * 
 * @param {Object} props
 * @param {Array} props.nodes - React Flow nodes (optional, used for native SVG worker export)
 * @param {Array} props.edges - React Flow edges (optional, used for native SVG worker export)
 */
export function ExportDiagramButton({ 
  elementRef, 
  filename = 'diagram', 
  className = '',
  nodes = null,
  edges = null
}) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Settings
  const [format, setFormat] = useState('png'); // 'png' or 'svg'
  const [includeBackground, setIncludeBackground] = useState(true);

  const handleExport = async () => {
    setExporting(true);

    // Yield to the main thread so React can paint the "Exporting..." loading spinner
    // before html-to-image blocks the UI thread with heavy DOM cloning.
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      // For this simplified export, we always exclude UI overlays since we're capturing the inner viewport.
      const excludedFeatures = new Set(['breadcrumbs', 'legend', 'controls', 'minimap', 'attribution']);
      const captureArea = 'full';

      const options = {
        includeBackground,
        captureArea,
        excludedFeatures,
      };

      if (format === 'svg' && nodes && edges) {
        // Use native SVG Web Worker for 0-blocking high-performance export
        await new Promise((resolve, reject) => {
          const worker = new Worker(new URL('../../services/export/export.worker.js', import.meta.url), { type: 'module' });
          worker.onmessage = (e) => {
            if (e.data.success) {
              const blob = new Blob([e.data.svgString], { type: 'image/svg+xml;charset=utf-8' });
              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = url;
              link.download = `${filename}.svg`;
              link.click();
              URL.revokeObjectURL(url);
              resolve();
            } else {
              reject(new Error(e.data.error));
            }
            worker.terminate();
          };
          
          // Calculate bounds for worker
          const el = elementRef.current;
          let bounds = { x: 0, y: 0, width: 800, height: 600 };
          const viewport = el?.querySelector('.react-flow__viewport');
          if (viewport) {
             const domNodes = el.querySelectorAll('.react-flow__node');
             if (domNodes.length) {
               let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
               domNodes.forEach(n => {
                 const match = n.style.transform.match(/translate\(([^p]+)px,\s*([^p]+)px\)/);
                 if (match) {
                   const x = parseFloat(match[1]);
                   const y = parseFloat(match[2]);
                   minX = Math.min(minX, x);
                   minY = Math.min(minY, y);
                   maxX = Math.max(maxX, x + n.offsetWidth);
                   maxY = Math.max(maxY, y + n.offsetHeight);
                 }
               });
               if (minX !== Infinity) bounds = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
             }
          }
          
          worker.postMessage({ nodes, edges, bounds, options });
        });
      } else if (format === 'png') {
        await exportToPng(elementRef, `${filename}.png`, options);
      } else {
        await exportToSvg(elementRef, `${filename}.svg`, options);
      }
      
      setOpen(false);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Export failed. Try zooming out the diagram first or using PNG format.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={exporting}
        className={`export-element-button flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-panel border border-border text-muted hover:text-text hover:border-accent/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm ${className}`}
        title="Export diagram"
      >
        <Download className="w-3.5 h-3.5" />
        Export
      </button>

      {open && createPortal(
        <div className="export-modal-overlay fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-panel border border-border rounded-xl shadow-2xl w-[450px] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto custom-scrollbar">
            {/* Header */}
            <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-surface/50 shrink-0">
              <h3 className="font-semibold text-text">Export Diagram</h3>
              <button onClick={() => setOpen(false)} className="text-muted hover:text-text"><X className="w-4 h-4" /></button>
            </div>

            {/* Content */}
            <div className="p-5 space-y-6">
              {/* Format Selection */}
              <div>
                <label className="block text-xs font-medium text-muted mb-2 uppercase tracking-wider">Format</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setFormat('png')}
                    className={`flex items-center justify-center gap-2 px-3 py-2 border rounded-md text-sm transition-colors ${
                      format === 'png' ? 'bg-accent/10 border-accent text-accent' : 'bg-surface border-border text-muted hover:text-text'
                    }`}
                  >
                    <ImageIcon className="w-4 h-4" /> PNG (Recommended)
                  </button>
                  <button
                    onClick={() => setFormat('svg')}
                    className={`flex items-center justify-center gap-2 px-3 py-2 border rounded-md text-sm transition-colors ${
                      format === 'svg' ? 'bg-accent/10 border-accent text-accent' : 'bg-surface border-border text-muted hover:text-text'
                    }`}
                    title="SVG may not render text correctly for some node types"
                  >
                    <FileCode2 className="w-4 h-4" /> SVG
                  </button>
                </div>
                {format === 'svg' && (
                  <p className="mt-2 text-[11px] text-accent font-medium">
                    {nodes && edges 
                      ? "Generates a true vector file. Visual quality of complex elements may be diminished."
                      : "Using DOM SVG Engine (Warning: React text nodes may not render correctly in standard SVG viewers due to foreignObject limitations)."}
                  </p>
                )}
              </div>

              {/* Background Toggle */}
              <div>
                <label className="block text-xs font-medium text-muted mb-3 uppercase tracking-wider border-b border-border/50 pb-2">Export Contents</label>
                <div className="space-y-4 pt-1">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <div className="relative flex items-center">
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={includeBackground}
                        onChange={(e) => setIncludeBackground(e.target.checked)}
                      />
                      <div className={`w-9 h-5 rounded-full transition-colors ${includeBackground ? 'bg-accent' : 'bg-surface border border-border'}`}></div>
                      <div className={`absolute left-1 top-1 bg-text w-3 h-3 rounded-full transition-transform ${includeBackground ? 'translate-x-4' : 'translate-x-0'}`}></div>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm text-text group-hover:text-accent transition-colors">Include Background Color</span>
                      <span className="text-xs text-muted">If unchecked, the exported image will have a transparent background.</span>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-border bg-surface/30 flex justify-end gap-3 shrink-0">
              <button
                onClick={() => setOpen(false)}
                className="px-4 py-2 text-sm text-muted hover:text-text transition-colors"
                disabled={exporting}
              >
                Cancel
              </button>
              <button
                onClick={handleExport}
                disabled={exporting}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-accent text-text rounded-md hover:bg-accent/90 disabled:opacity-50 transition-colors shadow-lg shadow-accent/20"
              >
                {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {exporting ? 'Exporting...' : 'Export File'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
