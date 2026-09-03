import { Routes, Route, Navigate } from 'react-router-dom';
import UploadPage from '../features/repository/UploadPage';
import ExplorerPage from '../features/explorer/ExplorerPage';
import DependencyGraphPage from '../features/dependencies/DependencyGraphPage';
import ArchitecturePage from '../features/architecture/ArchitecturePage';

import RepositoryAssistantPage from '../features/assistant/RepositoryAssistantPage';
import ImpactPage from '../features/engineering/ImpactPage';
import EngineeringHealthPage from '../features/engineering/EngineeringHealthPage';
import RefactoringPage from '../features/engineering/RefactoringPage';
import RepositoryIntelligencePage from '../features/repository/RepositoryIntelligencePage';
import HelpPage from '../features/help/HelpPage';
import { AIProvider } from '../shared/context/AIContext';
import RepositoryShell from '../shared/layout/RepositoryShell';
import { ErrorBoundary } from '../shared/components/ErrorBoundary';

export default function App() {
  return (
    <ErrorBoundary>
      <AIProvider>
        <Routes>
          <Route path="/" element={<UploadPage />} />
          
          {/* The Canonical Repository Routes */}
          <Route path="/explore/:repoId" element={<RepositoryShell />}>
            <Route index element={<RepositoryIntelligencePage />} />
            <Route path="source" element={<ExplorerPage />} />
            <Route path="graph" element={<DependencyGraphPage />} />
            <Route path="architecture" element={<ArchitecturePage />} />

            <Route path="assistant" element={<RepositoryAssistantPage />} />
            <Route path="impact" element={<ImpactPage />} />
            <Route path="health" element={<EngineeringHealthPage />} />
            <Route path="refactoring" element={<RefactoringPage />} />
          </Route>

          <Route path="/help" element={<HelpPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AIProvider>
    </ErrorBoundary>
  );
}
