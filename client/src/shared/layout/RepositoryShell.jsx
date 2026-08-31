import { useEffect } from 'react';
import { Outlet, useParams } from 'react-router-dom';
import RepositorySidebar from './RepositorySidebar';
import RepositoryHeader from './RepositoryHeader';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { RepositoryProvider } from '../context/RepositoryContext';

export default function RepositoryShell() {
  const { repoId } = useParams();

  useEffect(() => {
    if (repoId) {
      localStorage.setItem('lastRepoId', repoId);
    }
  }, [repoId]);

  if (!repoId) {
    return <div className="h-screen bg-surface flex items-center justify-center text-white">No Repository Selected</div>;
  }

  return (
    <RepositoryProvider>
      <div className="h-screen w-full flex bg-surface text-white overflow-hidden font-sans">
        <RepositorySidebar />

        <div className="flex flex-col flex-1 h-full bg-surface min-w-0">
          <RepositoryHeader />
          <main className="flex-1 overflow-hidden relative flex flex-col min-h-0">
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </main>
        </div>
      </div>
    </RepositoryProvider>
  );
}
