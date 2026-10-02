import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../shared/context/AuthContext';
import { useAIState } from '../../shared/context/AIContext';
import { ArrowLeft, User, LogOut, Loader2, Zap, Mail, Shield, Clock } from 'lucide-react';
import AvatarUpload from './AvatarUpload';

export default function AccountPage() {
  const { user, signOut } = useAuth();
  const { aiState } = useAIState();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  if (!user) {
    return null; // AuthGuard handles redirect
  }

  const { usage } = aiState;
  
  const tokenPct = usage && usage.tokenLimit > 0 
    ? Math.min(100, Math.round((usage.tokens / usage.tokenLimit) * 100))
    : 0;

  const reqPct = usage && usage.requestLimit > 0
    ? Math.min(100, Math.round((usage.requests / usage.requestLimit) * 100))
    : 0;

  return (
    <div className="flex h-screen bg-surface text-text">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-12">
          
          <div className="flex items-center gap-4 mb-8">
            <Link to="/" className="p-2 hover:bg-panel rounded-full transition-colors">
              <ArrowLeft className="w-5 h-5 text-muted hover:text-text" />
            </Link>
            <h1 className="text-2xl font-semibold">Account Settings</h1>
          </div>

          <div className="flex flex-col gap-6">
            
            {/* Profile Card */}
            <div className="bg-panel border border-border rounded-xl p-6 sm:p-8 flex flex-col sm:flex-row items-center sm:items-start gap-6 relative overflow-hidden">
              <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border-4 border-surface shadow-xl bg-surface-light flex items-center justify-center shrink-0 relative z-10 overflow-hidden">
                {(user.user_metadata?.custom_avatar_url || user.user_metadata?.avatar_url) ? (
                  <img src={user.user_metadata.custom_avatar_url || user.user_metadata.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-10 h-10 text-muted" />
                )}
              </div>
              <div className="flex-1 text-center sm:text-left z-10">
                <h2 className="text-xl font-bold text-text flex items-center justify-center sm:justify-start gap-3">
                  {user.user_metadata?.full_name || 'CodeLens Developer'}
                  <span className="text-[10px] font-bold uppercase tracking-widest bg-accent text-text px-2 py-0.5 rounded-full border border-accent-light shadow-sm">
                    Pro
                  </span>
                </h2>
                <p className="text-muted text-sm mt-1 flex items-center justify-center sm:justify-start gap-2">
                  <Mail className="w-3.5 h-3.5" />
                  {user.email}
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center sm:justify-start gap-4">
                  <span className="text-xs text-muted flex items-center gap-1.5 bg-surface px-2.5 py-1 rounded-lg border border-border/50">
                    <Shield className="w-3.5 h-3.5 text-green-400" />
                    Account Active
                  </span>
                  <span className="text-xs text-muted flex items-center gap-1.5 bg-surface px-2.5 py-1 rounded-lg border border-border/50">
                    <Clock className="w-3.5 h-3.5 text-accent" />
                    Member since {new Date(user.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
              
              <button 
                onClick={handleSignOut}
                className="absolute top-4 right-4 sm:top-6 sm:right-6 p-2 text-muted hover:text-text hover:bg-surface rounded-lg transition-colors flex items-center gap-2 text-sm z-10"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>

              <div className="absolute -right-20 -top-20 w-64 h-64 bg-accent/5 rounded-full blur-3xl pointer-events-none"></div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Avatar Upload Section */}
              <div className="col-span-1">
                <AvatarUpload />
              </div>

              {/* Usage & Plan Section */}
              <div className="col-span-1">
                <div className="bg-panel rounded-xl p-6 border border-border h-full">
                  <div className="flex items-center gap-3 mb-6">
                    <Zap className="w-6 h-6 text-accent" />
                    <h2 className="text-xl font-medium">AI Usage & Quota</h2>
                  </div>

                  {!usage ? (
                    <div className="flex items-center gap-2 text-muted text-sm py-4">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading usage data...
                    </div>
                  ) : (
                    <div className="space-y-8">
                      {/* Tokens */}
                      <div>
                        <div className="flex justify-between text-sm mb-2">
                          <span className="text-gray-300 font-medium">AI Tokens</span>
                          <span className="text-muted">
                            {usage.tokens.toLocaleString()} / {usage.tokenLimit > 0 ? usage.tokenLimit.toLocaleString() : 'Unlimited'}
                          </span>
                        </div>
                        <div className="h-2 w-full bg-surface rounded-full overflow-hidden">
                          <div 
                            className={`h-full ${tokenPct > 90 ? 'bg-danger' : 'bg-accent'}`} 
                            style={{ width: `${tokenPct}%` }}
                          />
                        </div>
                        <p className="text-xs text-muted mt-2">
                          Tokens measure the size of the AI's input and output. Heavy refactoring tasks use more tokens.
                        </p>
                      </div>

                      {/* Requests */}
                      <div>
                        <div className="flex justify-between text-sm mb-2">
                          <span className="text-gray-300 font-medium">AI Requests</span>
                          <span className="text-muted">
                            {usage.requests.toLocaleString()} / {usage.requestLimit > 0 ? usage.requestLimit.toLocaleString() : 'Unlimited'}
                          </span>
                        </div>
                        <div className="h-2 w-full bg-surface rounded-full overflow-hidden">
                          <div 
                            className={`h-full ${reqPct > 90 ? 'bg-danger' : 'bg-accent'}`} 
                            style={{ width: `${reqPct}%` }}
                          />
                        </div>
                        <p className="text-xs text-muted mt-2">
                          Total number of prompts sent to the AI this billing cycle.
                        </p>
                      </div>
                      
                      <div className="pt-4 border-t border-border flex justify-between items-center">
                        <span className="text-sm text-muted">
                          Current Plan: <strong className="text-text">Free Tier</strong>
                        </span>
                        <span className="text-sm text-muted">
                          Resets: {new Date(usage.periodEnd).toLocaleDateString()}
                        </span>
                      </div>

                    </div>
                  )}
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
