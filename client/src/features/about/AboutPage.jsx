import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ChevronLeft, Layers, Zap, Network, Globe } from 'lucide-react';

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
    'dashboard',
    'assistant',
    'source',
    'tree',
    'bookmarks',
    'architecture',
    'dependencies',
    'health',
    'refactoring',
    'impact',
    'creator',
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
      case 'dashboard':
        return <DashboardShowcase />;
      case 'assistant':
        return <AIAssistantShowcase />;
      case 'source':
        return <SourceExplorerShowcase />;
      case 'tree':
        return <FileTreeShowcase />;
      case 'bookmarks':
        return <BookmarksShowcase />;
      case 'architecture':
        return <ArchitectureShowcase />;
      case 'dependencies':
        return <DependencyShowcase />;
      case 'health':
        return <EngineeringHealthTab />;
      case 'refactoring':
        return <RefactoringEngineTab />;
      case 'impact':
        return <ImpactAnalysisShowcase />;
      case 'creator':
        return <CreatorProfile />;
      default:
        return <DashboardShowcase />;
    }
  };

  return (
    <div className="h-screen w-full bg-surface text-text relative flex flex-col overflow-hidden">
      {/* Semicircular Nav - Still fixed to bottom right */}
      <AboutPillNav activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Back Button */}
      <Link
        to={repoId ? `/explore/${repoId}` : `/`}
        className="fixed top-4 left-6 z-[100] flex items-center gap-2 px-4 py-2 bg-panel/80 backdrop-blur border border-border rounded-full text-sm font-medium text-muted hover:text-text hover:border-accent/50 transition-all shadow-lg"
      >
        <ChevronLeft className="w-4 h-4" /> Back
      </Link>

      {/* Main Scrollable Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar pt-6 pb-6 relative z-10">
        <div className="max-w-6xl mx-auto px-8">{renderTab()}</div>
      </div>

      {/* Global Fixed Footer */}
      <div className="shrink-0 py-3 text-center relative z-40">
        <p className="text-xs text-muted/60">
          &copy; {new Date().getFullYear()} CodeLens. All rights reserved. Designed to streamline repository exploration
          and architectural analysis. All data remains entirely local to ensure absolute privacy and security.
        </p>
      </div>
    </div>
  );
}
