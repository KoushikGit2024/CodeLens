/**
 * OpenSourceButton.jsx
 *
 * Reusable button / link that navigates to a source location in the Code
 * Viewer.  Every feature (Engineering Health, Impact, Architecture, AI, ADR)
 * renders this instead of building its own <Link>.
 *
 * Props:
 *   ref       — SourceReference (from makeSourceRef / tryMakeSourceRef)
 *   label     — Optional button text (defaults to filename + line)
 *   className — Extra Tailwind classes
 *   variant   — 'link' | 'button' | 'icon'  (default: 'link')
 */
import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { FileText, MapPin, ExternalLink } from 'lucide-react';
import { buildSourceUrl } from '../navigation/sourceRef';

const OpenSourceButton = React.forwardRef(({ label, className = '', variant = 'link' }, sourceRef) => {
  const { repoId } = useParams();

  // Nothing to navigate to
  if (!sourceRef?.filePath || !repoId) return null;

  const url = buildSourceUrl(repoId, sourceRef);
  const filename = sourceRef.filePath.split('/').pop();
  const displayLabel = label ?? (sourceRef.startLine ? `${filename}:${sourceRef.startLine}` : filename);

  if (variant === 'icon') {
    return (
      <Link
        to={url}
        title={`Open ${sourceRef.filePath}${sourceRef.startLine ? `:${sourceRef.startLine}` : ''}`}
        className={`inline-flex items-center justify-center p-1.5 rounded text-muted hover:text-accent hover:bg-accent/10 transition-colors ${className}`}
      >
        <ExternalLink className="w-3.5 h-3.5" />
      </Link>
    );
  }

  if (variant === 'button') {
    return (
      <Link
        to={url}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-surface border border-border hover:border-accent hover:text-accent transition-colors ${className}`}
      >
        <FileText className="w-3.5 h-3.5 shrink-0" />
        {displayLabel}
        {sourceRef.startLine && (
          <span className="flex items-center gap-0.5 text-muted text-[10px]">
            <MapPin className="w-2.5 h-2.5" />
            {sourceRef.startLine}
          </span>
        )}
      </Link>
    );
  }

  // default: 'link'
  return (
    <Link
      to={url}
      className={`inline-flex items-center gap-1.5 text-xs text-accent hover:underline font-mono truncate ${className}`}
      title={sourceRef.filePath}
    >
      <FileText className="w-3 h-3 shrink-0" />
      {displayLabel}
    </Link>
  );
});

export default OpenSourceButton;
