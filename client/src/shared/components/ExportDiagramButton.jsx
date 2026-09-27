import { useState } from 'react';
import { Download, ImageIcon, FileCode2, Loader2, X } from 'lucide-react';
import { exportToPng, exportToSvg } from '../utils/exportDiagram';

/**
 * A button that opens a dialog to export a referenced DOM element to PNG or SVG.
 */
export function ExportDiagramButton({ elementRef, filename = 'diagram', className = '' }) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Settings
  const [format, setFormat] = useState('png'); // 'png' or 'svg'
  const [includeBackground, setIncludeBackground] = useState(true);
  const [captureArea, setCaptureArea] = useState('full'); // 'full' or 'visible'
  
  // Detailed UI Inclusion options (checked = include it in export)
  const [includeBreadcrumbs, setIncludeBreadcrumbs] = useState(false);
  const [includeLegend, setIncludeLegend] = useState(false);
  const [includeControls, setIncludeControls] = useState(false);
  const [includeMinimap, setIncludeMinimap] = useState(false);

  const handleExport = async () => {
    setExporting(true);

    // Yield to the main thread so React can paint the "Exporting..." loading spinner
    // before html-to-image blocks the UI thread with heavy DOM cloning.
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      // Any feature NOT included will be added to the excluded list
      const excludedFeatures = new Set();
      if (!includeBreadcrumbs) excludedFeatures.add('breadcrumbs');
      if (!includeLegend) excludedFeatures.add('legend');
      if (!includeControls) excludedFeatures.add('controls');
      if (!includeMinimap) excludedFeatures.add('minimap');
      excludedFeatures.add('attribution'); // Always exclude attribution watermarks

      const options = {
        includeBackground,
        captureArea,
        excludedFeatures,
      };

      if (format === 'png') {
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

  const CheckboxItem = ({ label, checked, onChange }) => (
    <label className="flex items-center gap-3 cursor-pointer group">
      <div className="relative flex items-center">
        <input
          type="checkbox"
          className="sr-only"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <div className={`w-9 h-5 rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-surface border border-border'}`}></div>
        <div className={`absolute left-1 top-1 bg-white w-3 h-3 rounded-full transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`}></div>
      </div>
      <span className="text-sm text-white group-hover:text-accent transition-colors">{label}</span>
    </label>
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={exporting}
        className={`export-element-button flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-panel border border-border text-muted hover:text-white hover:border-accent/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm ${className}`}
        title="Export diagram"
      >
        <Download className="w-3.5 h-3.5" />
        Export
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-panel border border-border rounded-xl shadow-2xl w-[450px] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto custom-scrollbar">
            {/* Header */}
            <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-surface/50 shrink-0">
              <h3 className="font-semibold text-white">Export Diagram</h3>
              <button onClick={() => setOpen(false)} className="text-muted hover:text-white"><X className="w-4 h-4" /></button>
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
                      format === 'png' ? 'bg-accent/10 border-accent text-accent' : 'bg-surface border-border text-muted hover:text-white'
                    }`}
                  >
                    <ImageIcon className="w-4 h-4" /> PNG (Recommended)
                  </button>
                  <button
                    onClick={() => setFormat('svg')}
                    className={`flex items-center justify-center gap-2 px-3 py-2 border rounded-md text-sm transition-colors ${
                      format === 'svg' ? 'bg-accent/10 border-accent text-accent' : 'bg-surface border-border text-muted hover:text-white'
                    }`}
                    title="SVG may not render text correctly for some node types"
                  >
                    <FileCode2 className="w-4 h-4" /> SVG
                  </button>
                </div>
                {format === 'svg' && (
                  <p className="mt-2 text-[11px] text-warning">
                    Note: SVG format cannot perfectly render React text nodes (due to foreignObject limitations). PNG is recommended.
                  </p>
                )}
              </div>

              {/* Area */}
              <div>
                <label className="block text-xs font-medium text-muted mb-2 uppercase tracking-wider">Capture Area</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setCaptureArea('full')}
                    className={`flex items-center justify-center gap-2 px-3 py-2 border rounded-md text-sm transition-colors ${
                      captureArea === 'full' ? 'bg-accent/10 border-accent text-accent' : 'bg-surface border-border text-muted hover:text-white'
                    }`}
                  >
                    Full Diagram
                  </button>
                  <button
                    onClick={() => setCaptureArea('visible')}
                    className={`flex items-center justify-center gap-2 px-3 py-2 border rounded-md text-sm transition-colors ${
                      captureArea === 'visible' ? 'bg-accent/10 border-accent text-accent' : 'bg-surface border-border text-muted hover:text-white'
                    }`}
                  >
                    Visible Area Only
                  </button>
                </div>
              </div>

              {/* Advanced UI Elements Toggles */}
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
                      <div className={`absolute left-1 top-1 bg-white w-3 h-3 rounded-full transition-transform ${includeBackground ? 'translate-x-4' : 'translate-x-0'}`}></div>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm text-white group-hover:text-accent transition-colors">Include Editor Background</span>
                      <span className="text-xs text-muted">If unchecked, the exported image will have a transparent background.</span>
                    </div>
                  </label>

                  <div className="pt-2">
                    <p className="text-[11px] text-muted mb-2 font-medium">Specific Overlay Elements (Check to include):</p>
                    <div className="grid grid-cols-2 gap-y-3 gap-x-4">
                      <CheckboxItem label="Breadcrumbs & Toolbar" checked={includeBreadcrumbs} onChange={setIncludeBreadcrumbs} />
                      <CheckboxItem label="Legends & Details" checked={includeLegend} onChange={setIncludeLegend} />
                      <CheckboxItem label="Zoom Controls" checked={includeControls} onChange={setIncludeControls} />
                      <CheckboxItem label="Minimap" checked={includeMinimap} onChange={setIncludeMinimap} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-border bg-surface/30 flex justify-end gap-3 shrink-0">
              <button
                onClick={() => setOpen(false)}
                className="px-4 py-2 text-sm text-muted hover:text-white transition-colors"
                disabled={exporting}
              >
                Cancel
              </button>
              <button
                onClick={handleExport}
                disabled={exporting}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-accent text-white rounded-md hover:bg-accent/90 disabled:opacity-50 transition-colors shadow-lg shadow-accent/20"
              >
                {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {exporting ? 'Exporting...' : 'Export File'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
