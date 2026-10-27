import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type InputHTMLAttributes,
} from 'react';
import { UploadCloud, Download, LoaderCircle, AlertCircle, Copy, Check } from 'lucide-react';
import { downloadBlob, copyText, errorMessage } from '../lib/files';
import { trackToolUse } from '../lib/analytics';
import './task-surfaces.css';
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
  const hintId = `${id}-hint`;
  const input = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [drag, setDrag] = useState(false);
  useEffect(() => {
    if (disabled) {
      dragDepth.current = 0;
      setDrag(false);
    }
  }, [disabled]);
  return (
    <div
      className={`dropzone ${drag ? 'is-dragging' : ''}`}
      data-upload-state={disabled ? 'disabled' : drag ? 'dragging' : 'idle'}
      onDragEnter={(e) => {
        if (disabled || !Array.from(e.dataTransfer.types).includes('Files')) return;
        e.preventDefault();
        dragDepth.current++;
        setDrag(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled && Array.from(e.dataTransfer.types).includes('Files')) {
          e.dataTransfer.dropEffect = 'copy';
          setDrag(true);
        }
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (!dragDepth.current) setDrag(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        dragDepth.current = 0;
        setDrag(false);
        if (!disabled) {
          const files = Array.from(e.dataTransfer.files);
          if (files.length) onFiles(multiple ? files : files.slice(0, 1));
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
        tabIndex={-1}
        onChange={(e) => {
          onFiles(Array.from(e.target.files || []));
          e.target.value = '';
        }}
      />
      <button
        className="dropzone-button"
        type="button"
        disabled={disabled}
        aria-describedby={hintId}
        onClick={() => input.current?.click()}
      >
        <span className="dropzone-icon">
          <UploadCloud size={26} />
        </span>
        <strong>点击选择{multiple ? '文件' : '文件'}，或拖拽到这里</strong>
        <span id={hintId}>{hint || '文件只在此设备处理，不会上传'}</span>
      </button>
      <span className="sr-only" aria-live="polite">
        {drag ? '松开即可选择文件，文件仍在此设备处理。' : ''}
      </span>
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
      aria-busy={busy}
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
  const feedback = useTransientFeedback();
  return (
    <span className="task-button-feedback">
      <button
        className={`button button-primary task-feedback-button ${feedback.message ? 'is-confirmed' : ''}`}
        onClick={() => {
          downloadBlob(blob, name);
          feedback.show('已请求下载，请在浏览器中查看文件。');
        }}
      >
        {feedback.message ? <Check size={16} /> : <Download size={16} />}
        {children || '下载结果'}
      </button>
      <span className="sr-only" aria-live="polite">
        {feedback.message}
      </span>
    </span>
  );
}
function useTransientFeedback() {
  const [message, setMessage] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
    };
  }, []);
  return {
    message,
    show(value: string) {
      if (!mounted.current) return;
      clearTimeout(timer.current);
      setMessage(value);
      timer.current = setTimeout(() => setMessage(''), 1800);
    },
    isMounted: () => mounted.current,
  };
}
export function CopyButton({ value }: { value: string }) {
  const feedback = useTransientFeedback();
  const [error, setError] = useState('');
  return (
    <span className="task-button-feedback">
      <button
        className={`button button-secondary task-feedback-button ${feedback.message ? 'is-confirmed' : ''}`}
        onClick={async () => {
          setError('');
          try {
            await copyText(value);
            feedback.show('已复制到剪贴板');
          } catch (e) {
            if (feedback.isMounted()) setError(errorMessage(e));
          }
        }}
      >
        {feedback.message ? <Check size={15} /> : <Copy size={15} />}
        {feedback.message ? '已复制' : '复制'}
      </button>
      <span className="sr-only" aria-live="polite">
        {feedback.message}
      </span>
      {error && <span role="alert">{error}</span>}
    </span>
  );
}
export function ResultBox({
  children,
  title = '处理结果',
}: {
  children: ReactNode;
  title?: string;
}) {
  const titleId = useId();
  return (
    <section className="result-box" aria-labelledby={titleId}>
      <h2 className="result-heading" id={titleId}>
        {title}
      </h2>
      {children}
    </section>
  );
}
export function Progress({ value, label }: { value: number; label?: string }) {
  const progress = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  return (
    <div
      className={`task-progress ${progress === 100 ? 'is-complete' : ''}`}
      role="progressbar"
      aria-valuenow={Math.round(progress)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label || '处理进度'}
    >
      <div>
        <span>{label || '正在处理'}</span>
        <strong>{Math.round(progress)}%</strong>
      </div>
      <div className="progress-track">
        <span style={{ transform: `scaleX(${progress / 100})` }} />
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
