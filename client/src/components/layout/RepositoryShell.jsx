import { Outlet, useParams } from 'react-router-dom';
import RepositorySidebar from './RepositorySidebar';
import RepositoryHeader from './RepositoryHeader';
import WelcomeTour from '../WelcomeTour';

export default function RepositoryShell() {
  const { repoId } = useParams();

  if (!repoId) {
    return <div className="h-screen bg-surface flex items-center justify-center text-white">No Repository Selected</div>;
  }

  return (
    <div className="h-screen w-full flex bg-surface text-white overflow-hidden font-sans">
      <WelcomeTour />
      
      {/* Global Navigation Sidebar */}
      <RepositorySidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <RepositoryHeader />
        
        {/* The active child route renders here */}
        <main className="flex-1 overflow-hidden relative flex flex-col min-h-0 bg-surface">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
