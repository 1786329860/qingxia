import { useId, useRef, useState, type ReactNode, type InputHTMLAttributes } from 'react';
import { UploadCloud, Download, LoaderCircle, AlertCircle, Copy, Check } from 'lucide-react';
import { downloadBlob, copyText, errorMessage } from '../lib/files';
import { trackToolUse } from '../lib/analytics';
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Notice({
  children,
  tone = 'info',
}: {
  children: ReactNode;
  tone?: 'info' | 'warning' | 'success';
}) {
  return (
    <div className={`notice notice-${tone}`}>
      <AlertCircle size={16} />
      <div>{children}</div>
    </div>
  );
}
export function FileDropzone({
  accept,
  multiple = false,
  onFiles,
  hint,
  disabled = false,
}: {
  accept?: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  hint?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  return (
    <div
      className={`dropzone ${drag ? 'is-dragging' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        if (!disabled) {
          const files = Array.from(e.dataTransfer.files);
          onFiles(multiple ? files : files.slice(0, 1));
        }
      }}
    >
      <input
        ref={input}
        id={id}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onChange={(e) => {
          onFiles(Array.from(e.target.files || []));
          e.target.value = '';
        }}
      />
      <button
        className="dropzone-button"
        type="button"
        disabled={disabled}
        onClick={() => input.current?.click()}
      >
        <span className="dropzone-icon">
          <UploadCloud size={26} />
        </span>
        <strong>点击选择{multiple ? '文件' : '文件'}，或拖拽到这里</strong>
        <span>{hint || '文件只在此设备处理，不会上传'}</span>
      </button>
    </div>
  );
}
export function ActionButton({
  children,
  busy = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  return (
    <button
      {...props}
      className={`button button-primary ${props.className || ''}`}
      disabled={busy || props.disabled}
    >
      {busy && <LoaderCircle className="spin" size={17} />}
      {children}
    </button>
  );
}
export function DownloadButton({
  blob,
  name,
  children,
}: {
  blob: Blob;
  name: string;
  children?: ReactNode;
}) {
  return (
    <button className="button button-primary" onClick={() => downloadBlob(blob, name)}>
      <Download size={16} />
      {children || '下载结果'}
    </button>
  );
}
export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  return (
    <>
      <button
        className="button button-secondary"
        onClick={async () => {
          try {
            await copyText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          } catch (e) {
            setError(errorMessage(e));
          }
        }}
      >
        {copied ? <Check size={15} /> : <Copy size={15} />}
        {copied ? '已复制' : '复制'}
      </button>
      {error && <span role="alert">{error}</span>}
    </>
  );
}
export function ResultBox({
  children,
  title = '处理结果',
}: {
  children: ReactNode;
  title?: string;
}) {
  return (
    <section className="result-box">
      <div className="section-eyebrow">{title}</div>
      {children}
    </section>
  );
}
export function Progress({ value, label }: { value: number; label?: string }) {
  return (
    <div
      className="task-progress"
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label || '处理进度'}
    >
      <div>
        <span>{label || '正在处理'}</span>
        <strong>{Math.round(value)}%</strong>
      </div>
      <div className="progress-track">
        <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}
export function useToolTask(tool: string) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const run = async (job: () => Promise<void> | void) => {
    if (busy) return;
    setBusy(true);
    setError('');
    setProgress(0);
    try {
      await job();
      setProgress(100);
      trackToolUse(tool);
    } catch (e) {
      setError(errorMessage(e));
      trackToolUse(tool, 'error');
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, progress, setProgress, run };
}
export function ErrorNotice({ error }: { error: string }) {
  return error ? (
    <div role="alert">
      <Notice tone="warning">{error}</Notice>
    </div>
  ) : null;
}
export function NumberInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input type="number" {...props} />;
}
