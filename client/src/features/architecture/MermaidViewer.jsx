import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { Copy, Download, AlertCircle } from 'lucide-react';
import { useToast } from '../../shared/context/ToastContext';
import { useTheme } from '../../shared/context/ThemeContext';

export default function MermaidViewer({ diagramStr, repoId }) {
  const { theme } = useTheme();
  const isLight = theme?.id?.includes('light');
  const containerRef = useRef(null);
  const [svgContent, setSvgContent] = useState('');
  const [error, setError] = useState(null);
  const { addToast } = useToast();

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: isLight ? 'default' : 'dark',
      securityLevel: 'loose',
    });
  }, [isLight]);

  useEffect(() => {
    let isMounted = true;
    const renderDiagram = async () => {
      if (!diagramStr || !containerRef.current) return;
      try {
        setError(null);
        containerRef.current.innerHTML = '';
        const id = `mermaid-arch-${Date.now()}`;
        const { svg } = await mermaid.render(id, diagramStr);
        if (isMounted) {
          containerRef.current.innerHTML = svg;
          setSvgContent(svg);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || 'Failed to render Mermaid diagram');
        }
      }
    };
    renderDiagram();
    return () => { isMounted = false; };
  }, [diagramStr]);

  const handleCopy = () => {
    navigator.clipboard.writeText(diagramStr);
    addToast({ title: 'Copied', description: 'Mermaid syntax copied to clipboard', type: 'success' });
  };

  const handleDownloadSource = () => {
    const blob = new Blob([diagramStr], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `architecture-${repoId}.mmd`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadSvg = () => {
    if (!svgContent) return;
    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `architecture-${repoId}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full w-full relative group">
      <div className="absolute top-4 right-4 z-10 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={handleCopy} className="p-2 bg-panel border border-border rounded shadow hover:bg-surface text-muted hover:text-text transition-colors" title="Copy Mermaid syntax">
          <Copy className="w-4 h-4" />
        </button>
        <button onClick={handleDownloadSource} className="px-3 py-2 bg-panel border border-border rounded shadow hover:bg-surface text-xs font-medium text-muted hover:text-text flex items-center gap-1 transition-colors" title="Download .mmd source">
          <Download className="w-3.5 h-3.5" /> .mmd
        </button>
        <button onClick={handleDownloadSvg} disabled={!svgContent} className="px-3 py-2 bg-panel border border-border rounded shadow hover:bg-surface text-xs font-medium text-muted hover:text-text flex items-center gap-1 transition-colors disabled:opacity-50" title="Download .svg image">
          <Download className="w-3.5 h-3.5" /> .svg
        </button>
      </div>
      
      <div className="flex-1 overflow-auto p-8 custom-scrollbar flex items-start justify-center bg-surface/50 w-full h-full min-h-[600px]">
        {error ? (
          <div className="flex flex-col items-center justify-center p-6 bg-danger/10 border border-danger/30 rounded-lg text-danger max-w-lg mt-10">
            <AlertCircle className="w-8 h-8 mb-2" />
            <span className="font-semibold mb-2">Mermaid Rendering Error</span>
            <pre className="text-[10px] bg-black/30 p-4 rounded w-full overflow-x-auto whitespace-pre-wrap">{error}</pre>
          </div>
        ) : (
          <div ref={containerRef} className="mermaid-container w-full flex justify-center [&>svg]:max-w-full [&>svg]:h-auto" />
        )}
      </div>
    </div>
  );
}
