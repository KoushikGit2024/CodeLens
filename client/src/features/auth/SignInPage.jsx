import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../shared/context/AuthContext';
import { Logo } from '../../shared/components/Logo';
import { Loader2, AlertCircle, Eye, EyeOff, Github } from 'lucide-react';
import api from '../../shared/api';
import { supabase } from '../../shared/lib/supabase';

export default function SignInPage() {
  const { signIn, signInWithOAuth, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [syncingAvatar, setSyncingAvatar] = useState(false);

  const handlePendingAvatar = async () => {
    const pendingAvatar = localStorage.getItem('pendingAvatarUpload');
    if (!pendingAvatar) return;
    
    try {
      setSyncingAvatar(true);
      const res = await fetch(pendingAvatar);
      const blob = await res.blob();
      
      const authRes = await api.get('/assets/auth');
      const { token, expire, signature } = authRes.data;
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const userId = session.user.id;

      const formData = new FormData();
      formData.append('file', blob, 'avatar.jpg');
      formData.append('publicKey', import.meta.env.VITE_IMAGEKIT_PUBLIC_KEY);
      formData.append('signature', signature);
      formData.append('expire', expire);
      formData.append('token', token);
      formData.append('folder', '/avatars');
      formData.append('fileName', `user_${userId}.jpg`);

      const uploadRes = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
        method: 'POST',
        body: formData,
      });

      if (!uploadRes.ok) throw new Error('Upload failed');
      const uploadData = await uploadRes.json();

      await supabase.auth.updateUser({
        data: { avatar_url: uploadData.url }
      });
      
    } catch (err) {
      console.error('Failed to sync pending avatar:', err);
    } finally {
      localStorage.removeItem('pendingAvatarUpload');
      setSyncingAvatar(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error: signInError } = await signIn(email, password);
    if (signInError) {
      setError(signInError.message);
      setLoading(false);
    } else {
      await handlePendingAvatar();
      navigate('/');
    }
  };

  return (
    <>
      {syncingAvatar && (
        <div className="absolute inset-0 bg-surface/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center">
          <Loader2 className="w-8 h-8 text-accent animate-spin mb-4" />
          <p className="text-white font-medium">Setting up your profile...</p>
        </div>
      )}
      
      <div className="w-full max-w-[420px] relative">
          <div className="flex flex-col items-start mb-8">
            <Logo className="w-10 h-10 mb-6 lg:hidden animate-in fade-in zoom-in-95 duration-700" style={{ animationFillMode: 'both' }} />
            <h1 className="text-3xl font-semibold text-white tracking-tight animate-in fade-in slide-in-from-bottom-4 duration-700" style={{ animationDelay: '150ms', animationFillMode: 'both' }}>Welcome back</h1>
            <p className="text-muted mt-2 text-sm animate-in fade-in slide-in-from-bottom-4 duration-700" style={{ animationDelay: '250ms', animationFillMode: 'both' }}>
              Please enter your details to sign in to CodeLens.
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-danger/10 border border-danger/30 rounded-lg flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
              <AlertCircle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
              <p className="text-sm text-danger font-medium leading-relaxed">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-700" style={{ animationDelay: '350ms', animationFillMode: 'both' }}>
            <div className="space-y-2">
              <label className="text-sm font-medium text-white/90">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                maxLength={255}
                autoComplete="email"
                className="w-full bg-panel border border-border rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all placeholder:text-muted/70"
                placeholder="you@example.com"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-white/90">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  maxLength={72}
                  autoComplete="current-password"
                  className="w-full bg-panel border border-border rounded-lg pl-4 pr-11 py-2.5 text-white focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all placeholder:text-muted/70"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer group">
                <input 
                  type="checkbox" 
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-border bg-panel text-accent focus:ring-accent focus:ring-offset-surface" 
                />
                <span className="text-sm text-muted group-hover:text-white/90 transition-colors">Remember me</span>
              </label>
              <Link to="/auth/forgot-password" className="text-sm text-accent hover:text-accent-hover hover:underline transition-colors font-medium">
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading || syncingAvatar}
              className="w-full bg-accent hover:bg-accent-hover text-white font-medium rounded-lg py-2.5 flex items-center justify-center transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed mt-4 shadow-lg shadow-accent/20"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Sign In'}
            </button>
          </form>

          <div className="mt-8 animate-in fade-in slide-in-from-bottom-4 duration-700" style={{ animationDelay: '450ms', animationFillMode: 'both' }}>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-surface text-muted">Or continue with</span>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-4">
              <button 
                type="button" 
                onClick={() => signInWithOAuth('github')}
                className="flex items-center justify-center gap-2 py-2.5 px-4 border border-border rounded-lg bg-panel hover:bg-surface-light text-white transition-colors"
              >
                <Github className="w-4 h-4" />
                <span className="text-sm font-medium">GitHub</span>
              </button>
              <button 
                type="button" 
                onClick={() => signInWithOAuth('google')}
                className="flex items-center justify-center gap-2 py-2.5 px-4 border border-border rounded-lg bg-panel hover:bg-surface-light text-white transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="blue" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                <span className="text-sm font-medium">Google</span>
              </button>
            </div>
          </div>

          <p className="mt-8 text-center text-sm text-muted animate-in fade-in duration-700" style={{ animationDelay: '550ms', animationFillMode: 'both' }}>
            Don't have an account?{' '}
            <Link to="/auth/signup" className="text-accent hover:text-accent-hover hover:underline transition-colors font-medium">
              Sign up
            </Link>
          </p>
      </div>
    </>
  );
}
