import { useEffect, useRef, useState } from 'react';
import { Download, Link2, ExternalLink, LoaderCircle } from 'lucide-react';
import {
  ActionButton,
  Field,
  Notice,
  ResultBox,
  ErrorNotice,
  Progress,
} from '../components/ToolUI';
import { downloadBlob, errorMessage, formatBytes } from '../lib/files';
import { trackToolUse } from '../lib/analytics';
import { downloadPublicMedia, type DownloadMedia } from '../lib/douyin-download';
import { extractShareURL, safeMediaURL } from '../../api/_lib/douyin';
interface Result {
  title: string;
  author: string;
  cover: string | null;
  kind: 'video' | 'images';
  items: DownloadMedia[];
  notice: string;
}
export default function DouyinTool() {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [downloading, setDownloading] = useState<number | null>(null);
  const [downloadStatus, setDownloadStatus] = useState('');
  const [downloadProgress, setDownloadProgress] = useState<{
    received: number;
    total: number | null;
  } | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    if (!result) return;
    // Warm only a bounded set of official origins, without fetching the media itself.
    const origins = [
      ...new Set(
        result.items
          .flatMap((item) => [item.url, ...(item.fallbackUrls || [])])
          .slice(0, 4)
          .map(safeMediaURL)
          .filter((url): url is string => Boolean(url))
          .map((url) => new URL(url).origin),
      ),
    ].slice(0, 2);
    const links = origins.map((origin) => {
      const link = document.createElement('link');
      link.rel = 'preconnect';
      link.href = origin;
      link.crossOrigin = 'anonymous';
      document.head.append(link);
      return link;
    });
    return () => links.forEach((link) => link.remove());
  }, [result]);
  async function resolve() {
    if (busy) return;
    setBusy(true);
    setError('');
    setDownloadStatus('');
    setDownloadProgress(null);
    setResult(null);
    const controller = new AbortController();
    abort.current = controller;
    const timer = setTimeout(() => controller.abort('timeout'), 25000);
    try {
      const response = await fetch('/api/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: extractShareURL(input).href }),
        signal: controller.signal,
      });
      const data = await response
        .json()
        .catch(() => ({ error: '解析服务未启动，请在 Vercel 部署或启动本地 API 服务。' }));
      if (!response.ok) throw new Error(data.error || '解析失败');
      setResult(data);
      trackToolUse('douyin');
    } catch (e) {
      setError(
        controller.signal.aborted
          ? controller.signal.reason === 'user'
            ? '解析已取消。'
            : '解析超时，请稍后再试。'
          : errorMessage(e),
      );
      trackToolUse('douyin', 'error');
    } finally {
      clearTimeout(timer);
      setBusy(false);
      if (abort.current === controller) abort.current = null;
    }
  }
  async function download(index: number) {
    if (!result || downloading !== null) return;
    setDownloading(index);
    setError('');
    setDownloadStatus('');
    setDownloadProgress(null);
    const controller = new AbortController();
    abort.current = controller;
    const timer = setTimeout(() => controller.abort('timeout'), 90000);
    try {
      const media = await downloadPublicMedia(
        result.items[index],
        controller.signal,
        (attempt) =>
          setDownloadStatus(attempt ? '正在尝试作品提供的备用下载地址…' : '正在读取媒体文件…'),
        fetch,
        (received, total) => setDownloadProgress({ received, total }),
      );
      downloadBlob(media.blob, `轻匣-抖音-${index + 1}.${media.extension}`);
      setDownloadStatus('下载已发起，请在浏览器中查看文件。');
    } catch (e) {
      setDownloadStatus('');
      const message = errorMessage(e);
      setError(
        controller.signal.aborted
          ? controller.signal.reason === 'user'
            ? '下载已取消，未保存不完整文件。'
            : '下载超时，未保存不完整文件。请重新解析或稍后再试。'
          : e instanceof TypeError
            ? '浏览器无法读取媒体，可能是跨域、防盗链或网络限制。本站不会上传或中转媒体，请重新解析或稍后再试。'
            : message,
      );
    } finally {
      clearTimeout(timer);
      setDownloading(null);
      if (abort.current === controller) abort.current = null;
    }
  }
  return (
    <div className="tool-workspace">
      <Notice tone="warning">
        实验性工具：仅解析公开分享页面，不绕过登录、验证码或平台访问限制。平台结构和跨域策略可能导致解析或下载失败，不保证所有作品可用。
      </Notice>
      <Field label="抖音分享链接" hint="可以直接粘贴包含链接的整段分享文案">
        <textarea
          rows={4}
          value={input}
          maxLength={3000}
          onChange={(e) => setInput(e.target.value)}
          placeholder="粘贴 https://v.douyin.com/… 或作品分享链接"
        />
      </Field>
      <div className="button-row">
        <ActionButton
          busy={busy}
          disabled={!input.trim() || downloading !== null}
          onClick={() => void resolve()}
        >
          <Link2 size={16} />
          解析链接
        </ActionButton>
        {busy && (
          <button className="button button-secondary" onClick={() => abort.current?.abort('user')}>
            取消
          </button>
        )}
        <button
          className="button button-secondary"
          disabled={busy || downloading !== null}
          onClick={() => {
            setInput('');
            setResult(null);
            setError('');
            setDownloadStatus('');
          }}
        >
          清空
        </button>
      </div>
      <ErrorNotice error={error} />
      {downloadStatus && (
        <p className="muted" role="status">
          {downloadStatus}
        </p>
      )}
      {downloading !== null &&
        downloadProgress &&
        (downloadProgress.total ? (
          <Progress
            value={(downloadProgress.received / downloadProgress.total) * 100}
            label={`正在接收 ${formatBytes(downloadProgress.received)} / ${formatBytes(downloadProgress.total)}`}
          />
        ) : (
          <p className="muted">
            已接收 {formatBytes(downloadProgress.received)}，平台未提供总大小。
          </p>
        ))}
      {result && (
        <ResultBox title="解析结果">
          <h2>{result.title}</h2>
          <p className="muted">
            {result.author} · {result.kind === 'video' ? '视频' : `${result.items.length} 张图片`}
          </p>
          <Notice>{result.notice} 下载请求直接发送到媒体平台，文件不经过本站服务器。</Notice>
          <div className="resolved-media-list">
            {result.items.map((item, i) => (
              <div key={i} className="file-row">
                <span>{item.type === 'video' ? '视频文件' : `图片 ${i + 1}`}</span>
                <button
                  className="button button-primary"
                  disabled={downloading !== null}
                  onClick={() => void download(i)}
                >
                  {downloading === i ? (
                    <LoaderCircle size={15} className="spin" />
                  ) : (
                    <Download size={15} />
                  )}
                  下载{item.type === 'image' ? `图片 ${i + 1}` : '视频'}
                </button>
              </div>
            ))}
          </div>
          {downloading !== null && (
            <button
              className="button button-secondary"
              onClick={() => abort.current?.abort('user')}
            >
              取消下载
            </button>
          )}
        </ResultBox>
      )}
      <Notice>
        请仅下载你有权保存和使用的内容。本站不提供作品搜索、批量抓取或去水印编辑。
        <ExternalLink size={12} />
      </Notice>
    </div>
  );
}
