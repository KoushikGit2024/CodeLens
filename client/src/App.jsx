import { Routes, Route, Navigate } from 'react-router-dom';
import UploadPage from './pages/UploadPage';
import ExplorerPage from './pages/ExplorerPage';
import DependencyGraphPage from './pages/DependencyGraphPage';
import ArchitecturePage from './pages/ArchitecturePage';
import DocumentationPage from './pages/DocumentationPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<UploadPage />} />
      <Route path="/explore/:repoId" element={<ExplorerPage />} />
      <Route path="/explore/:repoId/graph" element={<DependencyGraphPage />} />
      <Route path="/explore/:repoId/architecture" element={<ArchitecturePage />} />
      <Route path="/explore/:repoId/documentation" element={<DocumentationPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
