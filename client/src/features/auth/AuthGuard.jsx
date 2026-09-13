import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../shared/context/AuthContext';

export default function AuthGuard({ children }) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/auth/signin" state={{ from: location }} replace />;
  }

  return children;
}
