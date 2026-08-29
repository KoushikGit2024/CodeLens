import { useLocation, Link, useParams } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import React from 'react';

const ROUTE_LABELS = {
  '': 'Overview',
  'source': 'Source Explorer',
  'architecture': 'Architecture',
  'graph': 'Dependencies',
  'documentation': 'Documentation',
  'health': 'Engineering Health',
  'refactoring': 'Refactoring',
  'impact': 'Change Impact',
  'assistant': 'Repository Assistant'
};

export default function Breadcrumbs() {
  const { repoId } = useParams();
  const location = useLocation();
  
  if (!repoId) return null;

  // Path starts with /explore/REPO_ID/...
  const pathParts = location.pathname.split('/').filter(Boolean);
  
  // Anything after REPO_ID is a sub-route
  const subRouteIndex = pathParts.indexOf(repoId) + 1;
  const currentSubRoute = pathParts[subRouteIndex] || '';
  
  const label = ROUTE_LABELS[currentSubRoute] || 'Overview';
  
  // If we are in source explorer, we can also extract the file path from search params
  const searchParams = new URLSearchParams(location.search);
  const filePath = searchParams.get('path');

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted">
      <Link to={`/explore/${repoId}`} className="hover:text-white transition-colors flex items-center gap-1">
        <Home className="w-3.5 h-3.5" />
      </Link>
      
      <ChevronRight className="w-3.5 h-3.5 opacity-50" />
      
      <span className={!filePath ? "text-white/90 font-medium" : ""}>
        {label}
      </span>

      {filePath && (
        <>
          <ChevronRight className="w-3.5 h-3.5 opacity-50" />
          <span className="text-white/90 font-medium truncate max-w-[300px]" title={filePath}>
            {filePath.split('/').pop()}
          </span>
        </>
      )}
    </div>
  );
}
