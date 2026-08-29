import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Loader2, AlertCircle } from 'lucide-react';
import { repositoryApi } from '../api';

export default function UploadPage() {
  const navigate = useNavigate();
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  const handleFile = useCallback((f) => {
    setError(null);
    if (!f.name.endsWith('.zip')) {
      setError('Only ZIP archives are supported.');
      return;
    }
    setFile(f);
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const onInputChange = (e) => {
    const f = e.target.files[0];
    if (f) handleFile(f);
  };

  const onUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    setProgress(0);
    try {
      const { data } = await repositoryApi.upload(file, (evt) => {
        if (evt.total) setProgress(Math.round((evt.loaded / evt.total) * 100));
      });
      navigate(`/explore/${data.id}`);
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      {/* Header */}
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-white">
          Code<span className="text-accent">Lens</span>
        </h1>
        <p className="mt-2 text-muted text-sm">
          AI-driven code intelligence &amp; automated documentation
        </p>
      </div>

      {/* Upload card */}
      <div className="w-full max-w-lg">
        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={[
            'relative border-2 border-dashed rounded-lg p-12 flex flex-col items-center gap-4 transition-colors cursor-pointer',
            dragging ? 'border-accent bg-accent/5' : 'border-border hover:border-muted',
            'bg-panel',
          ].join(' ')}
          onClick={() => document.getElementById('file-input').click()}
        >
          <Upload className="w-10 h-10 text-muted" />
          <div className="text-center">
            <p className="text-white font-medium">Drop your repository ZIP here</p>
            <p className="text-muted text-xs mt-1">or click to browse — max 100 MB</p>
          </div>
          <input
            id="file-input"
            type="file"
            accept=".zip"
            className="hidden"
            onChange={onInputChange}
          />
        </div>

        {/* Selected file */}
        {file && !uploading && (
          <div className="mt-3 px-4 py-3 bg-panel border border-border rounded-lg flex items-center justify-between">
            <span className="text-sm text-white truncate">{file.name}</span>
            <span className="text-xs text-muted ml-4 shrink-0">
              {(file.size / 1024 / 1024).toFixed(1)} MB
            </span>
          </div>
        )}

        {/* Progress bar */}
        {uploading && (
          <div className="mt-3">
            <div className="flex items-center gap-2 mb-1">
              <Loader2 className="w-4 h-4 text-accent animate-spin" />
              <span className="text-sm text-muted">Uploading &amp; extracting…</span>
              <span className="ml-auto text-xs text-muted">{progress}%</span>
            </div>
            <div className="h-1 bg-border rounded-full overflow-hidden">
              <div
                className="h-full bg-accent transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-3 px-4 py-3 bg-danger/10 border border-danger/30 rounded-lg flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-danger mt-0.5 shrink-0" />
            <p className="text-sm text-danger">{error}</p>
          </div>
        )}

        {/* Upload button */}
        <button
          onClick={onUpload}
          disabled={!file || uploading}
          className={[
            'mt-4 w-full py-2.5 rounded-lg text-sm font-medium transition-colors',
            file && !uploading
              ? 'bg-accent text-surface hover:bg-blue-400'
              : 'bg-border text-muted cursor-not-allowed',
          ].join(' ')}
        >
          {uploading ? 'Uploading…' : 'Analyze Repository'}
        </button>
      </div>

      {/* Footer note */}
      <p className="mt-12 text-xs text-muted">
        CodeLens performs static analysis only — your code is never executed
      </p>
    </div>
  );
}
