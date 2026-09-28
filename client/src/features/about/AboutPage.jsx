import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

import AboutPillNav from './components/AboutPillNav';
import ArchitectureShowcase from './tabs/ArchitectureShowcase';
import DependencyShowcase from './tabs/DependencyShowcase';
import EngineeringHealthTab from './tabs/EngineeringHealthTab';
import RefactoringEngineTab from './tabs/RefactoringEngineTab';
import CreatorProfile from './tabs/CreatorProfile';
import DashboardShowcase from './tabs/DashboardShowcase';
import AIAssistantShowcase from './tabs/AIAssistantShowcase';
import SourceExplorerShowcase from './tabs/SourceExplorerShowcase';
import FileTreeShowcase from './tabs/FileTreeShowcase';
import BookmarksShowcase from './tabs/BookmarksShowcase';
import ImpactAnalysisShowcase from './tabs/ImpactAnalysisShowcase';

export default function AboutPage() {
  const { repoId } = useParams();
  
  const VALID_TABS = [
    'dashboard', 'assistant', 'source', 'tree', 'bookmarks', 
    'architecture', 'dependencies', 'health', 'refactoring', 'impact', 'creator'
  ];

  const [activeTab, setActiveTab] = useState(() => {
    const hash = window.location.hash.replace('#', '');
    return VALID_TABS.includes(hash) ? hash : 'dashboard';
  });

  useEffect(() => {
    window.location.hash = activeTab;
  }, [activeTab]);

  const renderTab = () => {
    switch (activeTab) {
      case 'dashboard': return <DashboardShowcase />;
      case 'assistant': return <AIAssistantShowcase />;
      case 'source': return <SourceExplorerShowcase />;
      case 'tree': return <FileTreeShowcase />;
      case 'bookmarks': return <BookmarksShowcase />;
      case 'architecture': return <ArchitectureShowcase />;
      case 'dependencies': return <DependencyShowcase />;
      case 'health': return <EngineeringHealthTab />;
      case 'refactoring': return <RefactoringEngineTab />;
      case 'impact': return <ImpactAnalysisShowcase />;
      case 'creator': return <CreatorProfile />;
      default: return <DashboardShowcase />;
    }
  };

  return (
    <div className="h-screen w-full overflow-y-auto bg-surface text-text custom-scrollbar relative">
      
      {/* Semicircular Nav */}
      <AboutPillNav activeTab={activeTab} setActiveTab={setActiveTab} />
      
      {/* Back Button */}
      <Link 
        to={`/explore/${repoId}`}
        className="fixed top-8 left-8 z-[100] flex items-center gap-2 px-4 py-2 bg-panel/80 backdrop-blur border border-border rounded-full text-sm font-medium text-muted hover:text-text hover:border-accent/50 transition-all shadow-lg"
      >
        <ChevronLeft className="w-4 h-4" /> Back
      </Link>

      <div className="max-w-6xl mx-auto px-8 pt-32 pb-20">
        {renderTab()}
      </div>
    </div>
  );
}
