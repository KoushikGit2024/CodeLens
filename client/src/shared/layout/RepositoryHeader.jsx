import { RefreshCw, Loader2, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Breadcrumbs from '../ui/Breadcrumbs';
import AIStatusIndicator from '../../features/assistant/AIStatusIndicator';
import UserAvatarWidget from '../../features/account/UserAvatarWidget';
import { repositoryApi } from '../api';
import { useRepository } from '../context/RepositoryContext';
import ThemeSwitcher from '../components/ThemeSwitcher';

export default function RepositoryHeader() {
  const { repoId } = useParams();
  const navigate = useNavigate();
  const { repo, refetchRepo } = useRepository();
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
      {repo?.name && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 hidden md:flex max-w-[30%] items-center justify-center">
          <div className="group relative flex items-center gap-2 px-3 py-1 rounded-md bg-surface/90 border border-accent/20 shadow-[0_0_10px_rgba(var(--color-accent-rgb),0.1)] transition-all duration-300 ease-out hover:-translate-y-0.5 hover:scale-[1.04] hover:border-accent/60 hover:bg-accent/[0.06] hover:shadow-[0_0_20px_rgba(var(--color-accent-rgb),0.3)] cursor-default overflow-hidden">
            <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-accent/10 to-transparent skew-x-[-20deg] transition-transform duration-700 ease-out group-hover:translate-x-[200%]" />
            <div className="relative w-1.5 h-1.5 rounded-full bg-accent shadow-[0_0_6px_rgba(var(--color-accent-rgb),0.8)] transition-all duration-300 group-hover:scale-125 group-hover:shadow-[0_0_10px_rgba(var(--color-accent-rgb),1)]">
              <div className="absolute inset-0 rounded-full bg-accent opacity-40" />
            </div>
            <span
              className="relative text-sm font-semibold tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-text to-text/70 truncate transition-all duration-300 group-hover:from-text group-hover:to-accent"
              title={repo.name}
            >
              {repo.name}
            </span>
            <div className="relative w-0 h-px bg-accent/70 transition-all duration-300 group-hover:w-2" />
          </div>
        </div>
      )}

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
