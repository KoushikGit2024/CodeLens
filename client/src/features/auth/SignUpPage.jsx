import { useState, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../shared/context/AuthContext';
import { Logo } from '../../shared/components/Logo';
import { Loader2, AlertCircle, CheckCircle2, Eye, EyeOff, Github, Upload, X } from 'lucide-react';
import ReactCrop, { centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

function centerAspectCrop(mediaWidth, mediaHeight, aspect) {
  return centerCrop(
    makeAspectCrop({ unit: '%', width: 90 }, aspect, mediaWidth, mediaHeight),
    mediaWidth,
    mediaHeight
  );
}

export default function SignUpPage() {
  const { signUp, signInWithOAuth } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  // Avatar Upload States
  const [imgSrc, setImgSrc] = useState('');
  const [crop, setCrop] = useState();
  const [completedCrop, setCompletedCrop] = useState();
  const [showCropModal, setShowCropModal] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [avatarSize, setAvatarSize] = useState(0);
  const imgRef = useRef(null);
  const fileInputRef = useRef(null);

  const isAvatarTooLarge = avatarSize > 1024 * 1024;

  const onSelectFile = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setError(null);
      setCrop(undefined);
      setCompletedCrop(undefined);
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        setImgSrc(reader.result?.toString() || '');
        setShowCropModal(true);
      });
      reader.readAsDataURL(file);
    }
  };

  const onImageLoad = (e) => {
    if (crop) return; // Keep existing crop if re-opening modal
    const { width, height } = e.currentTarget;
    setCrop(centerAspectCrop(width, height, 1));
  };

  const getCroppedBase64 = async () => {
    if (!completedCrop || !imgRef.current) return null;
    const canvas = document.createElement('canvas');
    const scaleX = imgRef.current.naturalWidth / imgRef.current.width;
    const scaleY = imgRef.current.naturalHeight / imgRef.current.height;
    canvas.width = completedCrop.width;
    canvas.height = completedCrop.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(
      imgRef.current,
      completedCrop.x * scaleX,
      completedCrop.y * scaleY,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY,
      0, 0, completedCrop.width, completedCrop.height
    );
    return canvas.toDataURL('image/jpeg', 0.9);
  };

  const handleSaveCrop = async () => {
    if (completedCrop && imgRef.current) {
      try {
        const base64 = await getCroppedBase64();
        if (base64) {
          // Calculate approximate byte size of base64 string
          const base64Data = base64.split(',')[1];
          const sizeInBytes = Math.round((base64Data.length * 3) / 4);
          
          setAvatarSize(sizeInBytes);
          setAvatarPreview(base64);
        }
        setShowCropModal(false);
      } catch (err) {
        console.warn('Failed to save avatar crop:', err);
      }
    }
  };

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
    
    // Store avatar in localStorage if cropped
    if (avatarPreview) {
      localStorage.setItem('pendingAvatarUpload', avatarPreview);
    }
    
    const { error: signUpError } = await signUp(email, password, fullName);
    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
    } else {
      setSuccess(true);
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="w-full max-w-[420px] text-center animate-in fade-in zoom-in-95 duration-500">
            <CheckCircle2 className="w-16 h-16 text-success mx-auto mb-6 drop-shadow-[0_0_15px_rgba(34,197,94,0.4)]" />
            <h1 className="text-3xl font-semibold text-text tracking-tight mb-3">Check your email</h1>
            <p className="text-muted text-sm mb-8 leading-relaxed">
              We've sent a confirmation link to <strong className="text-text">{email}</strong>. Please click it to verify your account and get started.
            </p>
            <Link to="/auth/signin" className="inline-flex bg-panel border border-border hover:bg-surface-light text-text font-medium rounded-lg px-6 py-2.5 transition-colors">
              Back to Sign In
            </Link>
          </div>
    );
  }

  return (
    <>
      <div className="w-full max-w-[420px] py-3">
          <div className="flex flex-col items-start mb-4">
            <Logo className="w-8 h-8 mb-3 lg:hidden animate-in fade-in zoom-in-95 duration-700" style={{ animationFillMode: 'both' }} />
            <h1 className="text-2xl font-semibold text-text tracking-tight animate-in fade-in slide-in-from-bottom-4 duration-700" style={{ animationDelay: '150ms', animationFillMode: 'both' }}>Create an Account</h1>
            <p className="text-muted mt-1 text-sm animate-in fade-in slide-in-from-bottom-4 duration-700" style={{ animationDelay: '250ms', animationFillMode: 'both' }}>
              Enter your details to create your CodeLens account.
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-danger/10 border border-danger/30 rounded-lg flex items-start gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
              <AlertCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
              <p className="text-xs text-danger font-medium leading-relaxed">{error}</p>
            </div>
          )}

          <div className="mb-4 flex flex-col items-center animate-in fade-in zoom-in-95 duration-700" style={{ animationDelay: '350ms', animationFillMode: 'both' }}>
            {/* Avatar upload compact */}
            {!avatarPreview ? (
              <div className="flex items-center gap-4 cursor-pointer group" onClick={() => fileInputRef.current?.click()}>
                <div className="w-16 h-16 rounded-lg bg-panel border-2 border-dashed border-border group-hover:border-accent flex items-center justify-center text-muted transition-colors">
                  <Upload className="w-5 h-5 group-hover:text-accent transition-colors" />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-text/90 group-hover:text-text transition-colors">Upload Avatar</span>
                  {/* <span className="text-xs text-muted transition-colors">Optional, but recommended</span> */}
                </div>
                <input
                  type="file"
                  accept="image/*"
                  ref={fileInputRef}
                  onChange={onSelectFile}
                  className="hidden"
                />
              </div>
            ) : (
              <div className="flex items-center gap-3 w-full"
                style={{
                  flexDirection: avatarPreview?"column":""
                }}  
              >
                <div 
                  onClick={() => setShowCropModal(true)} 
                  className="relative w-40 h-40 rounded-2xl border-2 border-border overflow-hidden bg-panel cursor-pointer hover:border-accent transition-all duration-200 shadow-lg group"
                >
                  <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center gap-1.5 transition-opacity duration-200">
                    <Upload className="w-6 h-6 text-text" />
                    <span className="text-xs text-text font-medium">Click to Adjust</span>
                  </div>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <span className="text-sm font-medium text-text/90">Avatar Selected</span>
                  <span className={`text-xs font-medium ${isAvatarTooLarge ? 'text-danger' : 'text-muted'}`}>
                    {(avatarSize / (1024 * 1024)).toFixed(2)} MB {isAvatarTooLarge && '(Max 1MB)'}
                  </span>
                  <button type="button" onClick={() => { setImgSrc(''); setAvatarPreview(''); setAvatarSize(0); }} className="text-xs text-danger hover:underline mt-1">Remove</button>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  ref={fileInputRef}
                  onChange={onSelectFile}
                  className="hidden"
                />
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-700" style={{ animationDelay: '450ms', animationFillMode: 'both' }}>
            <div className="space-y-2">
              <label className="text-sm font-medium text-text/90">Full Name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                maxLength={100}
                autoComplete="name"
                className="w-full bg-panel border border-border rounded-lg px-4 py-2.5 text-text focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all placeholder:text-muted/70"
                placeholder="Ada Lovelace"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-text/90">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                maxLength={255}
                autoComplete="email"
                className="w-full bg-panel border border-border rounded-lg px-4 py-2.5 text-text focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all placeholder:text-muted/70"
                placeholder="you@example.com"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-text/90">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  maxLength={72}
                  autoComplete="new-password"
                  className="w-full bg-panel border border-border rounded-lg pl-4 pr-11 py-2.5 text-text focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all placeholder:text-muted/70"
                  placeholder="••••••••"
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted hover:text-text transition-colors"
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
              disabled={loading || (password.length > 0 && strength < 2) || isAvatarTooLarge}
              className="w-full bg-accent hover:bg-accent-hover text-text font-medium rounded-lg py-2.5 flex items-center justify-center transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed mt-4 shadow-lg shadow-accent/20"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Create Account'}
            </button>
          </form>

          <div className="mt-4 animate-in fade-in slide-in-from-bottom-4 duration-700" style={{ animationDelay: '550ms', animationFillMode: 'both' }}>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-surface text-muted">Or sign up with</span>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <button 
                type="button" 
                onClick={() => signInWithOAuth('github')}
                className="flex items-center justify-center gap-2 py-2 px-4 border border-border rounded-lg bg-panel hover:bg-surface-light text-text transition-colors"
              >
                <Github className="w-4 h-4" />
                <span className="text-sm font-medium">GitHub</span>
              </button>
              <button 
                type="button" 
                onClick={() => signInWithOAuth('google')}
                className="flex items-center justify-center gap-2 py-2 px-4 border border-border rounded-lg bg-panel hover:bg-surface-light text-text transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                <span className="text-sm font-medium">Google</span>
              </button>
            </div>
          </div>

          <p className="mt-4 text-center text-sm text-muted animate-in fade-in duration-700" style={{ animationDelay: '650ms', animationFillMode: 'both' }}>
            Already have an account?{' '}
            <Link to="/auth/signin" className="text-accent hover:text-accent-hover hover:underline transition-colors font-medium">
              Sign in
            </Link>
          </p>
        </div>
      {showCropModal && imgSrc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-panel border border-border rounded-xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-semibold text-text">Adjust Avatar</h3>
              <button 
                onClick={() => { 
                  if (!avatarPreview) setImgSrc(''); // if first upload cancelled, clear it entirely
                  setShowCropModal(false); 
                }} 
                className="text-muted hover:text-text transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 bg-surface flex justify-center items-center overflow-auto max-h-[60vh] min-h-[300px]">
              <ReactCrop
                crop={crop}
                onChange={(_, percentCrop) => setCrop(percentCrop)}
                onComplete={(c) => setCompletedCrop(c)}
                aspect={1}
                className="rounded-lg shadow-lg"
              >
                <img
                  ref={imgRef}
                  alt="Crop me"
                  src={imgSrc}
                  onLoad={onImageLoad}
                  className="max-h-[400px] w-auto object-contain rounded-lg"
                />
              </ReactCrop>
            </div>
            <div className="p-4 border-t border-border flex justify-end gap-3 bg-panel">
              <button 
                onClick={() => { 
                  if (!avatarPreview) setImgSrc('');
                  setShowCropModal(false); 
                }}
                className="px-4 py-2 text-sm font-medium text-text/80 hover:text-text transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveCrop}
                disabled={!completedCrop}
                className="px-5 py-2 bg-accent hover:bg-accent-hover text-text text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save Avatar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
