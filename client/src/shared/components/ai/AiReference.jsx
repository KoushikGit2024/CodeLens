import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { FileText, MapPin } from 'lucide-react';

/**
 * Parses a reference string like "[src/app.js:10-20]" or "src/app.js"
 */
function parseReference(refString) {
  let clean = refString.replace(/^\[/, '').replace(/\]$/, '');
  const parts = clean.split(':');
  const path = parts[0];
  let line = null;
  if (parts.length > 1) {
    line = parts[1]; // Could be "10" or "10-20"
  }
  return { path, line };
}

export default function AiReference({ reference, onNavigate }) {
  const { repoId } = useParams();
  if (!reference) return null;

  const refString = typeof reference === 'string' ? reference : (reference.path || '');
  if (!refString) return null;

  let path, line, reason;
  
  if (typeof reference === 'string') {
    const parsed = parseReference(refString);
    path = parsed.path;
    line = parsed.line;
  } else {
    path = reference.path;
    line = reference.lines || reference.line || reference.startLine;
    reason = reference.reason;
  }
  
  const displayPath = path.split('/').pop();
  
  const handleClick = (e) => {
    if (onNavigate) {
      e.preventDefault();
      onNavigate(path, line);
    }
  };

  const toUrl = `/explore/${repoId}/source?path=${encodeURIComponent(path)}${line ? `&line=${line}` : ''}`;

  return (
    <div className="flex flex-col gap-1 w-full max-w-sm min-w-0">
      <Link
        to={toUrl}
        onClick={handleClick}
        className="inline-flex items-center gap-2 bg-surface/50 border border-border/50 hover:border-accent hover:bg-surface rounded text-xs px-2.5 py-1.5 transition-colors group min-w-0"
        title={typeof reference === 'string' ? reference : `${path}${line ? `:${line}` : ''}`}
      >
        <FileText className="w-3.5 h-3.5 text-muted group-hover:text-accent transition-colors shrink-0" />
        <span className="text-white/80 group-hover:text-white truncate min-w-0">
          {displayPath}
        </span>
        {line && (
          <span className="flex items-center gap-0.5 text-muted group-hover:text-accent/80 text-[10px]">
            <MapPin className="w-3 h-3" />
            {line}
          </span>
        )}
      </Link>
      {reason && <span className="text-[10px] text-muted pl-1 truncate" title={reason}>{reason}</span>}
    </div>
  );
}
