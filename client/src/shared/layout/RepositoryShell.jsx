import { useEffect, useState, useRef } from 'react';
import { Outlet, useParams, useSearchParams } from 'react-router-dom';
import RepositorySidebar from './RepositorySidebar';
import RepositoryHeader from './RepositoryHeader';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { RepositoryProvider } from '../context/RepositoryContext';
import GlobalCommandPalette from '../components/GlobalCommandPalette';
import { Database, AlertTriangle, Save, X } from 'lucide-react';
import { useRepository } from '../context/RepositoryContext';
import AnalysisProgress from '../../features/repository/AnalysisProgress';

function RepositoryContentWrapper() {
  const { repo, livePhase } = useRepository();
  const [showProgress, setShowProgress] = useState(false);
  const isAnalyzing = repo?.status === 'analyzing' || !!livePhase;
  const wasAnalyzingRef = useRef(isAnalyzing);

  useEffect(() => {
    if (isAnalyzing) {
      wasAnalyzingRef.current = true;
      setShowProgress(true);
    } else if (repo?.status === 'ready' && wasAnalyzingRef.current) {
      // Keep it visible for a short delay after finishing so the Outlet can mount cleanly behind it
      const timer = setTimeout(() => {
        setShowProgress(false);
        wasAnalyzingRef.current = false;
      }, 1500);
      return () => clearTimeout(timer);
    } else {
      setShowProgress(false);
    }
  }, [isAnalyzing, repo?.status]);

  if (showProgress) {
    return (
      <>
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-surface">
          <AnalysisProgress
            currentPhase={livePhase?.phase ?? repo?.phase}
            phaseDetails={livePhase?.details ?? repo?.phaseDetails}
          />
        </div>
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </>
    );
  }

  return (
    <ErrorBoundary>
      <Outlet />
    </ErrorBoundary>
  );
}

export default function RepositoryShell() {
  const { repoId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isSavedPermanently, setIsSavedPermanently] = useState(false);
  const [showMobileStorageWarning, setShowMobileStorageWarning] = useState(false);

  useEffect(() => {
    if (repoId) {
      localStorage.setItem('lastRepoId', repoId);
      // Check if user has explicitly saved this repo permanently on mobile
      setIsSavedPermanently(localStorage.getItem(`mobile_save_${repoId}`) === 'true');
    }
  }, [repoId]);

  useEffect(() => {
    const saved = localStorage.getItem(`mobile_save_${repoId}`) === 'true';
    const dismissed = sessionStorage.getItem(`mobile_save_dismiss_${repoId}`) === 'true';
    setShowMobileStorageWarning(!saved && !dismissed);

    if (!isSavedPermanently) {
      const handleUnload = () => {
        // Fire-and-forget deletion using IndexedDB directly since we're unloading
        // Note: This relies on the browser allowing IDB operations during unload
        const request = indexedDB.open('CodeLensDB');
        request.onsuccess = e => {
          const db = e.target.result;
          try {
            db.transaction('repos', 'readwrite').objectStore('repos').delete(repoId);
            db.transaction('analysis', 'readwrite').objectStore('analysis').delete(repoId);

            // Clear files
            const txFiles = db.transaction('files', 'readwrite');
            const storeFiles = txFiles.objectStore('files');
            const reqFiles = storeFiles.openCursor();
            reqFiles.onsuccess = ev => {
              const cursor = ev.target.result;
              if (cursor) {
                if (cursor.key[0] === repoId) cursor.delete();
                cursor.continue();
              }
            };
          } catch (err) {
            console.error('Failed to cleanup on unload', err);
          }
        };
      };

      window.addEventListener('pagehide', handleUnload);
      return () => window.removeEventListener('pagehide', handleUnload);
    }
  }, [isSavedPermanently, repoId]);

  if (!repoId) {
    return (
      <div className="h-[100svh] bg-surface flex items-center justify-center text-text">No Repository Selected</div>
    );
  }

  return (
    <RepositoryProvider>
      <GlobalCommandPalette />
      <div className="h-[100svh] w-full flex bg-surface text-text overflow-hidden font-sans relative">
        {/* Mobile Navigation Backdrop */}
        {searchParams.get('mobileNav') === 'open' && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[90] sm:hidden"
            onClick={() => {
              setSearchParams(
                prev => {
                  prev.delete('mobileNav');
                  return prev;
                },
                { replace: true }
              );
            }}
          />
        )}

        <RepositorySidebar />

        <div className="flex flex-col flex-1 h-full bg-surface min-w-0 relative">
          {/* Ephemeral Storage Warning Banner */}
          {showMobileStorageWarning && (
            <div className="bg-yellow-500/10 border-b border-yellow-500/20 p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shrink-0 z-10 relative pr-10 sm:pr-3">
              <button
                onClick={() => {
                  sessionStorage.setItem(`mobile_save_dismiss_${repoId}`, 'true');
                  setShowMobileStorageWarning(false);
                }}
                className="absolute top-2 right-2 p-1.5 text-yellow-600/50 hover:text-yellow-600 hover:bg-yellow-500/10 rounded-md transition-colors sm:hidden"
                title="Dismiss warning"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="flex items-start gap-3 flex-1">
                <AlertTriangle className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-text pr-4 sm:pr-0">Ephemeral Storage Active</p>
                  <p className="text-muted text-xs mt-0.5">
                    This repository will be auto-deleted when you close the app to prevent storage bloat.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                <button
                  onClick={() => {
                    localStorage.setItem(`mobile_save_${repoId}`, 'true');
                    setIsSavedPermanently(true);
                    setShowMobileStorageWarning(false);
                  }}
                  className="flex-1 sm:flex-none px-4 py-2 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-600 font-medium text-xs rounded-md transition-colors flex items-center justify-center gap-2"
                >
                  <Save className="w-4 h-4" /> Keep Repository
                </button>
                <button
                  onClick={() => {
                    sessionStorage.setItem(`mobile_save_dismiss_${repoId}`, 'true');
                    setShowMobileStorageWarning(false);
                  }}
                  className="hidden sm:flex px-3 py-2 text-yellow-600/70 hover:text-yellow-600 hover:bg-yellow-500/10 rounded-md transition-colors"
                  title="Dismiss warning"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          <RepositoryHeader />
          <main className="flex-1 overflow-hidden relative flex flex-col min-h-0">
            <RepositoryContentWrapper />
          </main>
        </div>
      </div>
    </RepositoryProvider>
  );
}
