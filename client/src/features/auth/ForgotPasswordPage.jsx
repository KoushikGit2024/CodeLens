import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../shared/context/AuthContext';
import { Logo } from '../../shared/components/Logo';
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function ForgotPasswordPage() {
  const { resetPasswordForEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async e => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error: resetError } = await resetPasswordForEmail(email);
    if (resetError) {
      setError(resetError.message);
      setLoading(false);
    } else {
      setSuccess(true);
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex min-h-screen w-full bg-surface">
        <SpotlightPanel className="hidden lg:flex w-1/2 bg-panel border-r border-border p-12 flex-col justify-between">
          <div
            className="absolute inset-0 opacity-[0.03] pointer-events-none z-0"
            style={{
              backgroundImage: `linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)`,
              backgroundSize: '32px 32px',
            }}
          />
          <div className="relative z-10 flex flex-col justify-end p-12 h-full text-left pointer-events-none">
            <div className="mb-4">
              <Logo className="w-12 h-12 text-accent" />
            </div>
            <h2 className="text-3xl font-bold text-text mb-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
              Check your inbox
            </h2>
            <p
              className="text-lg text-text/70 max-w-md animate-in fade-in slide-in-from-bottom-4 duration-700"
              style={{ animationDelay: '100ms' }}
            >
              We've sent you a secure link to safely reset your password.
            </p>
          </div>
        </SpotlightPanel>

        <div className="flex-1 flex items-center justify-center p-8 sm:p-12">
          <div className="w-full max-w-[420px] text-center animate-in fade-in zoom-in-95 duration-500">
            <CheckCircle2 className="w-16 h-16 text-success mx-auto mb-6 drop-shadow-[0_0_15px_rgba(34,197,94,0.4)]" />
            <h1 className="text-3xl font-semibold text-text tracking-tight mb-3">Email Sent</h1>
            <p className="text-muted text-sm mb-8 leading-relaxed">
              We've sent a password reset link to <strong className="text-text">{email}</strong>. Please check your spam
              folder if you don't see it.
            </p>
            <Link
              to="/auth/signin"
              className="inline-flex bg-panel border border-border hover:bg-surface-light text-text font-medium rounded-lg px-6 py-2.5 transition-colors"
            >
              Back to Sign In
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="w-full max-w-[420px]">
        <div className="flex flex-col items-start mb-8">
          <Logo
            className="w-10 h-10 mb-6 lg:hidden animate-in fade-in zoom-in-95 duration-700"
            style={{ animationFillMode: 'both' }}
          />
          <h1
            className="text-3xl font-semibold text-text tracking-tight animate-in fade-in slide-in-from-bottom-4 duration-700"
            style={{ animationDelay: '150ms', animationFillMode: 'both' }}
          >
            Forgot Password
          </h1>
          <p
            className="text-muted mt-2 text-sm animate-in fade-in slide-in-from-bottom-4 duration-700"
            style={{ animationDelay: '250ms', animationFillMode: 'both' }}
          >
            Enter your email address and we'll send you a link to reset your password.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-danger/10 border border-danger/30 rounded-lg flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
            <AlertCircle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
            <p className="text-sm text-danger font-medium leading-relaxed">{error}</p>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-700"
          style={{ animationDelay: '350ms', animationFillMode: 'both' }}
        >
          <div className="space-y-2">
            <label className="text-sm font-medium text-text/90">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full bg-panel border border-border rounded-lg px-4 py-2.5 text-text focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all placeholder:text-muted/70"
              placeholder="you@example.com"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent hover:bg-accent-hover text-text font-medium rounded-lg py-2.5 flex items-center justify-center transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed mt-4 shadow-lg shadow-accent/20"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Send Reset Link'}
          </button>
        </form>

        <p
          className="mt-8 text-center text-sm text-muted animate-in fade-in duration-700"
          style={{ animationDelay: '450ms', animationFillMode: 'both' }}
        >
          Remembered your password?{' '}
          <Link
            to="/auth/signin"
            className="text-accent hover:text-accent-hover hover:underline transition-colors font-medium"
          >
            Back to Sign In
          </Link>
        </p>
      </div>
    </>
  );
}
