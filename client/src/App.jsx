import { Routes, Route, Navigate } from 'react-router-dom';
import UploadPage from './pages/UploadPage';
import ExplorerPage from './pages/ExplorerPage';
import DependencyGraphPage from './pages/DependencyGraphPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<UploadPage />} />
      <Route path="/explore/:repoId" element={<ExplorerPage />} />
      <Route path="/explore/:repoId/graph" element={<DependencyGraphPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
