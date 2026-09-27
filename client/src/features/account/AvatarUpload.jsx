import { useState, useRef } from 'react';
import ReactCrop, { centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { supabase } from '../../shared/lib/supabase';
import { Upload, X, Loader2 } from 'lucide-react';
import { useAuth } from '../../shared/context/AuthContext';
import api from '../../shared/api';

function centerAspectCrop(mediaWidth, mediaHeight, aspect) {
  return centerCrop(
    makeAspectCrop(
      {
        unit: '%',
        width: 90,
      },
      aspect,
      mediaWidth,
      mediaHeight,
    ),
    mediaWidth,
    mediaHeight,
  )
}

export default function AvatarUpload({ onUploadSuccess }) {
  const { user } = useAuth();
  const [imgSrc, setImgSrc] = useState('');
  const [crop, setCrop] = useState();
  const [completedCrop, setCompletedCrop] = useState();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  
  const imgRef = useRef(null);
  const fileInputRef = useRef(null);

  const onSelectFile = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setCrop(undefined); // Makes crop preview update between images.
      const reader = new FileReader();
      reader.addEventListener('load', () => setImgSrc(reader.result?.toString() || ''));
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const onImageLoad = (e) => {
    const { width, height } = e.currentTarget;
    setCrop(centerAspectCrop(width, height, 1));
  };

  const handleUpload = async () => {
    if (!completedCrop || !imgRef.current) return;
    setUploading(true);
    setError(null);

    try {
      // 1. Get cropped image blob
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
        0,
        0,
        completedCrop.width,
        completedCrop.height
      );

      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
      
      if (!blob) throw new Error('Canvas is empty');

      // 2. Get ImageKit auth params from backend
      const authRes = await api.get('/assets/auth');
      const { token, expire, signature } = authRes.data;

      // 3. Upload to ImageKit
      const formData = new FormData();
      formData.append('file', blob, 'avatar.jpg');
      formData.append('publicKey', import.meta.env.VITE_IMAGEKIT_PUBLIC_KEY);
      formData.append('signature', signature);
      formData.append('expire', expire);
      formData.append('token', token);
      formData.append('folder', '/MyProjects/CodeLens');
      formData.append('fileName', `user_${user.id}.jpg`);

      const uploadRes = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
        method: 'POST',
        body: formData,
      });

      if (!uploadRes.ok) throw new Error('Upload failed');
      const uploadData = await uploadRes.json();

      // 4. Update Supabase user metadata with new avatar URL
      const { error: updateError } = await supabase.auth.updateUser({
        data: { avatar_url: uploadData.url }
      });

      if (updateError) throw updateError;

      if (onUploadSuccess) onUploadSuccess(uploadData.url);
      setImgSrc('');
    } catch (err) {
      console.error('Avatar upload error:', err);
      setError(err.message || 'Failed to upload avatar');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-panel border border-border rounded-xl p-6">
      <h3 className="text-sm font-semibold mb-4">Profile Avatar</h3>
      
      {!imgSrc ? (
        <div className="flex flex-col items-start gap-4">
          <p className="text-xs text-muted">Upload a custom avatar to personalize your workspace.</p>
          <input
            type="file"
            accept="image/*"
            ref={fileInputRef}
            onChange={onSelectFile}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 bg-surface hover:bg-surface-light border border-border rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <Upload className="w-4 h-4 text-accent" />
            Select Image
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="relative border border-border rounded-lg overflow-hidden bg-surface max-w-sm mx-auto">
            <button 
              onClick={() => setImgSrc('')}
              className="absolute top-2 right-2 z-10 p-1 bg-black/50 hover:bg-black/80 rounded-full text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <ReactCrop
              crop={crop}
              onChange={(_, percentCrop) => setCrop(percentCrop)}
              onComplete={(c) => setCompletedCrop(c)}
              aspect={1}
              circularCrop
            >
              <img
                ref={imgRef}
                alt="Crop me"
                src={imgSrc}
                onLoad={onImageLoad}
                className="max-h-[300px] w-auto object-contain"
              />
            </ReactCrop>
          </div>

          {error && (
            <div className="p-3 bg-danger/10 border border-danger/20 rounded-lg text-xs text-danger">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 mt-2">
            <button
              onClick={() => setImgSrc('')}
              disabled={uploading}
              className="px-4 py-2 bg-surface hover:bg-surface-light border border-border rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleUpload}
              disabled={uploading || !completedCrop}
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {uploading && <Loader2 className="w-4 h-4 animate-spin" />}
              {uploading ? 'Uploading...' : 'Save Avatar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
