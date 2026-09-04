import { RefreshCw, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Breadcrumbs from '../ui/Breadcrumbs';
import AIStatusIndicator from '../../features/assistant/AIStatusIndicator';
import { repositoryApi } from '../api';
import { useRepository } from '../context/RepositoryContext';

export default function RepositoryHeader() {
  const { repoId } = useParams();
  const navigate = useNavigate();
  const { refetchRepo } = useRepository();
  const [reanalyzing, setReanalyzing] = useState(false);

  const handleReanalyze = async () => {
    setReanalyzing(true);
    try {
      await repositoryApi.analyze(repoId);
      await refetchRepo();
      navigate(`/explore/${repoId}`);
    } catch (err) {
      console.error('Failed to re-analyze', err);
    } finally {
      setReanalyzing(false);
    }
  };

  return (
    <header className="h-12 flex items-center px-4 border-b border-border bg-panel shrink-0 gap-4 justify-between">
      <div className="flex items-center gap-4 min-w-0">
        <div className="flex items-center gap-1">
          <button 
            onClick={() => navigate(-1)}
            className="p-1.5 text-muted hover:text-white hover:bg-surface rounded transition-colors"
            title="Go back"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button 
            onClick={() => navigate(1)}
            className="p-1.5 text-muted hover:text-white hover:bg-surface rounded transition-colors"
            title="Go forward"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <div className="h-4 w-px bg-border hidden sm:block"></div>
        <Breadcrumbs />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleReanalyze}
          disabled={reanalyzing}
          className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-white transition-colors border border-blue-400/40 hover:border-white/40 rounded px-2 py-1 disabled:opacity-50"
          title="Re-analyze Repository"
        >
          {reanalyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {reanalyzing ? 'Analyzing...' : 'Re-analyze'}
        </button>

        <div className="h-4 w-px bg-border"></div>
        <AIStatusIndicator />
      </div>
    </header>
  );
}
