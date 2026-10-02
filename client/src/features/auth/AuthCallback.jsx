import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../shared/lib/supabase';
import { Loader2 } from 'lucide-react';

export default function AuthCallback() {
  const navigate = useNavigate();
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    // 1. Log the incoming URL to see what Supabase sent back
    // console.log('[AuthCallback] URL Hash:', window.location.hash);
    // console.log('[AuthCallback] URL Search:', window.location.search);

    // Check if Supabase appended an error to the URL directly
    const params = new URLSearchParams(window.location.hash.substring(1));
    if (params.get('error_description')) {
      const err = decodeURIComponent(params.get('error_description'));
      console.error('[AuthCallback] URL Error:', err);
      setErrorMsg(err);
      return;
    }

    // 2. Listen to state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[AuthCallback] onAuthStateChange:', event, 'HasSession:', !!session);
      if (event === 'SIGNED_IN' || session) {
        navigate('/');
      }
    });

    // 3. Force check session
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      // console.log('[AuthCallback] getSession response:', !!session, 'Error:', error);
      if (error) {
        setErrorMsg(error.message);
      } else if (session) {
        navigate('/');
      } else {
        // If no session and no error, maybe it's still parsing.
        // We'll give it a timeout before failing.
        setTimeout(() => {
          supabase.auth.getSession().then(({ data: { session } }) => {
            if (!session) {
              console.warn('[AuthCallback] Timeout reached, still no session.');
              setErrorMsg('Failed to establish session from Google. The tokens might be invalid or expired.');
            }
          });
        }, 3000);
      }
    });

    return () => subscription?.unsubscribe();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-4">
      {!errorMsg ? (
        <>
          <Loader2 className="w-8 h-8 text-accent animate-spin mb-4" />
          <p className="text-text font-medium">Completing sign in...</p>
          <p className="text-muted text-sm mt-2">Please wait while we verify your credentials.</p>
        </>
      ) : (
        <div className="bg-danger/10 border border-danger/30 p-6 rounded-xl max-w-md w-full text-center">
          <h2 className="text-danger font-semibold text-lg mb-2">Sign-In Failed</h2>
          <p className="text-text/80 text-sm mb-4">{errorMsg}</p>
          <button
            onClick={() => navigate('/auth/signin')}
            className="px-4 py-2 bg-panel hover:bg-surface border border-border rounded text-sm text-text transition-colors"
          >
            Go Back
          </button>
        </div>
      )}
    </div>
  );
}
