import { useAuth } from '../../shared/context/AuthContext';
import { useAIState } from '../../shared/context/AIContext';
import { User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function UserAvatarWidget() {
  const { user } = useAuth();
  const { aiState } = useAIState();
  const usage = aiState?.usage;
  const navigate = useNavigate();

  if (!user) {
    return (
      <div 
        className="relative rounded-full p-0.5 cursor-pointer border-2 border-border/50 hover:border-accent transition-colors"
        onClick={() => navigate('/auth/signin')}
        title="Sign In"
      >
        <div className="w-8 h-8 rounded-full overflow-hidden bg-surface flex items-center justify-center">
          <User className="w-5 h-5 text-muted hover:text-accent transition-colors" />
        </div>
      </div>
    );
  }

  // Calculate the highest usage percentage between requests and tokens
  let highestUsagePercent = 0;
  if (usage) {
    const reqPercent = usage.requestLimit > 0 ? (usage.requests / usage.requestLimit) * 100 : 0;
    const tokenPercent = usage.tokenLimit > 0 ? (usage.tokens / usage.tokenLimit) * 100 : 0;
    highestUsagePercent = Math.max(reqPercent, tokenPercent);
  }

  // Determine border color based on usage
  let borderColorClass = 'border-border'; // Default
  if (highestUsagePercent >= 95) {
    borderColorClass = 'border-red-500'; // Red
  } else if (highestUsagePercent >= 75) {
    borderColorClass = 'border-orange-400'; // Yellow/Orange
  } else if (highestUsagePercent > 0) {
    borderColorClass = 'border-green-500'; // Green
  }

  return (
    <div 
      className={`relative rounded-full p-0.5 cursor-pointer border-2 transition-colors ${borderColorClass}`}
      onClick={() => navigate('/account')}
      title="Go to Account & Usage"
    >
      <div className="w-8 h-8 rounded-full overflow-hidden bg-surface flex items-center justify-center">
        {(user?.user_metadata?.custom_avatar_url || user?.user_metadata?.avatar_url) ? (
          <img 
            src={user.user_metadata.custom_avatar_url || user.user_metadata.avatar_url} 
            alt="User Avatar" 
            className="w-full h-full object-cover"
          />
        ) : (
          <User className="w-5 h-5 text-muted" />
        )}
      </div>
    </div>
  );
}
