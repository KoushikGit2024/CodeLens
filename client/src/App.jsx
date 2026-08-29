import { Routes, Route, Navigate } from 'react-router-dom';
import UploadPage from './pages/UploadPage';
import ExplorerPage from './pages/ExplorerPage';
import DependencyGraphPage from './pages/DependencyGraphPage';
import ArchitecturePage from './pages/ArchitecturePage';
import DocumentationPage from './pages/DocumentationPage';
import RepositoryAssistantPage from './pages/RepositoryAssistantPage';
import ImpactPage from './pages/ImpactPage';
import EngineeringHealthPage from './pages/EngineeringHealthPage';
import RefactoringPage from './pages/RefactoringPage';
import RepositoryIntelligencePage from './pages/RepositoryIntelligencePage';
import HelpPage from './pages/HelpPage';
import { AIProvider } from './components/AIContext';
import RepositoryShell from './components/layout/RepositoryShell';

export default function App() {
  return (
    <AIProvider>
      <Routes>
        <Route path="/" element={<UploadPage />} />
        
        {/* The Canonical Repository Routes */}
        <Route path="/explore/:repoId" element={<RepositoryShell />}>
          <Route index element={<RepositoryIntelligencePage />} />
          <Route path="source" element={<ExplorerPage />} />
          <Route path="graph" element={<DependencyGraphPage />} />
          <Route path="architecture" element={<ArchitecturePage />} />
          <Route path="documentation" element={<DocumentationPage />} />
          <Route path="assistant" element={<RepositoryAssistantPage />} />
          <Route path="impact" element={<ImpactPage />} />
          <Route path="health" element={<EngineeringHealthPage />} />
          <Route path="refactoring" element={<RefactoringPage />} />
        </Route>

        <Route path="/help" element={<HelpPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AIProvider>
  );
}
