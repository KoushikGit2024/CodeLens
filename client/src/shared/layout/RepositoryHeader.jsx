import { RefreshCw, Loader2, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Breadcrumbs from '../ui/Breadcrumbs';
import AIStatusIndicator from '../../features/assistant/AIStatusIndicator';
import UserAvatarWidget from '../../features/account/UserAvatarWidget';
import { repositoryApi } from '../api';
import { useRepository } from '../context/RepositoryContext';
import ThemeSwitcher from '../components/ThemeSwitcher';
import { useToast } from '../context/ToastContext';

export default function RepositoryHeader() {
  const { repoId } = useParams();
  const navigate = useNavigate();
  const { repo, refetchRepo } = useRepository();
  const [reanalyzing, setReanalyzing] = useState(false);
  const { addToast } = useToast();

  const handleReanalyze = async () => {
    setReanalyzing(true);
    try {
      await repositoryApi.analyze(repoId);
      await refetchRepo();
      navigate(`/explore/${repoId}`);
    } catch (err) {
      console.error('Failed to re-analyze', err);
      addToast({
        title: 'Re-analysis Failed',
        description: err.message || 'An unexpected error occurred.',
        type: 'error'
      });
    } finally {
      setReanalyzing(false);
    }
  };

  return (
    <header className="h-12 flex items-center px-4 border-b border-border bg-panel shrink-0 gap-4 justify-between relative z-50">
      <div className="flex items-center gap-4 min-w-0 z-10">
        <div className="flex items-center gap-1">
          <button 
            onClick={() => navigate(-1)}
            aria-label="Go back"
            className="p-1.5 text-muted hover:text-text hover:bg-surface rounded transition-colors"
            title="Go back"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button 
            onClick={() => navigate(1)}
            aria-label="Go forward"
            className="p-1.5 text-muted hover:text-text hover:bg-surface rounded transition-colors"
            title="Go forward"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <div className="h-4 w-px bg-border hidden sm:block"></div>
        <Breadcrumbs />
      </div>

      {/* Center Project Name */}
      <div className="flex-1 flex justify-center min-w-0 px-2 md:flex">
        {repo?.name && (
          <div className="group relative flex items-center justify-center cursor-default">
            <div className="relative flex items-center justify-center px-5 py-1.5 rounded-md overflow-hidden bg-surface/80 border border-accent/15 transition-all duration-500 ease-out group-hover:border-accent/50 group-hover:bg-accent/[0.035] group-hover:shadow-[0_0_25px_rgba(var(--color-accent-rgb),0.18)] group-hover:-translate-y-px">
              {/* Left reveal rail */}
              <span className="absolute left-0 top-1/2 -translate-y-1/2 h-[1px] w-0 bg-accent/70 shadow-[0_0_8px_rgba(var(--color-accent-rgb),0.7)] transition-all duration-500 ease-out group-hover:w-3" />
              {/* Right reveal rail */}
              <span className="absolute right-0 top-1/2 -translate-y-1/2 h-[1px] w-0 bg-accent/70 shadow-[0_0_8px_rgba(var(--color-accent-rgb),0.7)] transition-all duration-500 ease-out group-hover:w-3" />
              {/* Left bracket */}
              <span className="relative z-10 w-0 overflow-hidden opacity-0 -translate-x-2 text-accent font-mono font-bold text-sm transition-all duration-400 ease-out group-hover:w-4 group-hover:opacity-100 group-hover:translate-x-0">
                &lt;
              </span>
              {/* Project name */}
              <span
                className="relative z-10 mx-1 text-sm font-semibold tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-text via-text to-text/70 truncate transition-all duration-500 ease-out group-hover:from-text group-hover:via-accent group-hover:to-text"
                title={repo.name}
              >
                {repo.name}
              </span>
              {/* Right bracket */}
              <span className="relative z-10 w-0 overflow-hidden opacity-0 translate-x-2 text-accent font-mono font-bold text-sm transition-all duration-400 ease-out group-hover:w-4 group-hover:opacity-100 group-hover:translate-x-0">
                &gt;
              </span>
              {/* Symmetric sweep */}
              <span className="pointer-events-none absolute inset-y-0 left-1/2 w-0 -translate-x-1/2 bg-accent/[0.035] transition-all duration-500 ease-out group-hover:w-full" />
              {/* Top highlight */}
              <span className="pointer-events-none absolute left-1/2 top-0 h-px w-0 -translate-x-1/2 bg-gradient-to-r from-transparent via-accent/60 to-transparent transition-all duration-500 ease-out group-hover:w-[70%]" />
              {/* Bottom highlight */}
              <span className="pointer-events-none absolute left-1/2 bottom-0 h-px w-0 -translate-x-1/2 bg-gradient-to-r from-transparent via-accent/30 to-transparent transition-all duration-700 ease-out group-hover:w-[55%]" />
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 z-10">
        <button
          onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', ctrlKey: true }))}
          className="flex items-center gap-2 text-xs text-muted hover:text-text transition-colors border border-border/50 bg-surface/50 hover:bg-surface rounded-md px-2 py-1"
          title="Search Files (Ctrl+P)"
        >
          <Search className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Search...</span>
          <kbd className="hidden sm:inline-block font-sans text-[10px] px-1.5 py-0 rounded-sm bg-surface/50 border border-border/50 text-muted ml-1">Ctrl+P</kbd>
        </button>

        <button
          onClick={handleReanalyze}
          disabled={reanalyzing}
          aria-label="Re-analyze Repository"
          className="flex items-center gap-1.5 text-xs text-accent hover:text-text transition-colors border border-accent/30 hover:border-muted/50 rounded px-2 py-1 disabled:opacity-50"
          title="Re-analyze Repository"
        >
          {reanalyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {reanalyzing ? 'Analyzing...' : 'Re-analyze'}
        </button>

        <div className="h-4 w-px bg-border" />
        <ThemeSwitcher />
        <div className="h-4 w-px bg-border" />
        <AIStatusIndicator />
        <UserAvatarWidget />
      </div>
    </header>
  );
}
