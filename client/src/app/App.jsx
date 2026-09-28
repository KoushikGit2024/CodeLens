import { Routes, Route, Navigate } from 'react-router-dom';
import UploadPage from '../features/repository/UploadPage';
import ExplorerPage from '../features/explorer/ExplorerPage';
import FileTreePage from '../features/explorer/FileTreePage';
import DependencyGraphPage from '../features/dependencies/DependencyGraphPage';
import ArchitecturePage from '../features/architecture/ArchitecturePage';
import GitHistoryPage from '../features/git/GitHistoryPage';

import RepositoryAssistantPage from '../features/assistant/RepositoryAssistantPage';
import ImpactPage from '../features/engineering/ImpactPage';
import EngineeringHealthPage from '../features/engineering/EngineeringHealthPage';
import RefactoringPage from '../features/engineering/RefactoringPage';
import BookmarksPage from '../features/bookmarks/BookmarksPage';
import RepositoryIntelligencePage from '../features/repository/RepositoryIntelligencePage';
import HelpPage from '../features/help/HelpPage';
import AboutPage from '../features/about/AboutPage';
import { AuthProvider } from '../shared/context/AuthContext';
import SignInPage from '../features/auth/SignInPage';
import SignUpPage from '../features/auth/SignUpPage';
import ForgotPasswordPage from '../features/auth/ForgotPasswordPage';
import ResetPasswordPage from '../features/auth/ResetPasswordPage';
import AuthLayout from '../features/auth/AuthLayout';
import AuthGuard from '../features/auth/AuthGuard';
import AccountPage from '../features/account/AccountPage';
import { AIProvider } from '../shared/context/AIContext';
import { ToastProvider } from '../shared/context/ToastContext';
import RepositoryShell from '../shared/layout/RepositoryShell';
import { ErrorBoundary } from '../shared/components/ErrorBoundary';
import { EnvironmentGuard } from '../shared/components/EnvironmentGuard';
import { ThemeProvider } from '../shared/context/ThemeContext';
export default function App() {
  return (
    <ThemeProvider>
      <EnvironmentGuard>
        <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <AIProvider>
            <Routes>
              <Route path="/" element={<UploadPage />} />
              
              <Route element={<AuthLayout />}>
                <Route path="/auth/signin" element={<SignInPage />} />
                <Route path="/auth/signup" element={<SignUpPage />} />
                <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
              </Route>
              
              <Route path="/account" element={<AuthGuard><AccountPage /></AuthGuard>} />
              
              {/* The Canonical Repository Routes */}
              <Route path="/explore/:repoId" element={<RepositoryShell />}>
                <Route index element={<RepositoryIntelligencePage />} />
                <Route path="tree" element={<FileTreePage />} />
                <Route path="source" element={<ExplorerPage />} />
                <Route path="graph" element={<DependencyGraphPage />} />
                <Route path="architecture" element={<ArchitecturePage />} />
                <Route path="git" element={<GitHistoryPage />} />

                <Route path="assistant" element={<RepositoryAssistantPage />} />
                <Route path="impact" element={<ImpactPage />} />
                <Route path="health" element={<EngineeringHealthPage />} />
                <Route path="refactoring" element={<RefactoringPage />} />
                <Route path="bookmarks" element={<BookmarksPage />} />
              </Route>
              
              <Route path="/explore/:repoId/about" element={<AboutPage />} />

              <Route path="/help" element={<HelpPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AIProvider>
        </AuthProvider>
      </ToastProvider>
      </ErrorBoundary>
    </EnvironmentGuard>
    </ThemeProvider>
  );
}
