import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../shared/context/AuthContext';
import { Logo } from '../../shared/components/Logo';
import { Loader2, AlertCircle, Eye, EyeOff } from 'lucide-react';

export default function ResetPasswordPage() {
  const { updateUserPassword } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Password strength logic
  const strength = useMemo(() => {
    let score = 0;
    if (password.length > 5) score += 1;
    if (password.length > 8) score += 1;
    if (/[A-Z]/.test(password)) score += 1;
    if (/[0-9]/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;
    return Math.min(4, score);
  }, [password]);

  const strengthLabels = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong'];
  const strengthColors = ['bg-danger', 'bg-orange-500', 'bg-yellow-500', 'bg-green-400', 'bg-success'];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (strength < 2) {
      setError('Password is too weak. Please include letters, numbers, and symbols.');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    const { error: resetError } = await updateUserPassword(password);
    if (resetError) {
      setError(resetError.message);
      setLoading(false);
    } else {
      navigate('/auth/signin');
    }
  };

  return (
    <>
      <div className="w-full max-w-[420px]">
        <div className="flex flex-col items-start mb-8">
          <Logo className="w-10 h-10 mb-6 lg:hidden animate-in fade-in zoom-in-95 duration-700" style={{ animationFillMode: 'both' }} />
          <h1 className="text-3xl font-semibold text-white tracking-tight animate-in fade-in slide-in-from-bottom-4 duration-700" style={{ animationDelay: '150ms', animationFillMode: 'both' }}>New Password</h1>
          <p className="text-muted mt-2 text-sm animate-in fade-in slide-in-from-bottom-4 duration-700" style={{ animationDelay: '250ms', animationFillMode: 'both' }}>
            Enter your new password below.
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
              <label className="text-sm font-medium text-white/90">New Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  className="w-full bg-panel border border-border rounded-lg pl-4 pr-11 py-2.5 text-white focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all placeholder:text-muted/70"
                  placeholder="••••••••"
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              
              {/* Password Strength Indicator */}
              {password.length > 0 && (
                <div className="pt-2 animate-in fade-in duration-300">
                  <div className="flex gap-1 mb-1">
                    {[0, 1, 2, 3].map((index) => (
                      <div 
                        key={index} 
                        className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                          index < strength ? strengthColors[strength] : 'bg-surface'
                        }`} 
                      />
                    ))}
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted">Password strength:</span>
                    <span className={`${strengthColors[strength].replace('bg-', 'text-')} font-medium transition-colors`}>
                      {strengthLabels[strength]}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || (password.length > 0 && strength < 2)}
              className="w-full bg-accent hover:bg-accent-hover text-white font-medium rounded-lg py-2.5 flex items-center justify-center transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed mt-4 shadow-lg shadow-accent/20"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Save New Password'}
            </button>
          </form>
        </div>
    </>
  );
}
