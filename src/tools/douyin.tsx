import { useEffect, useRef, useState } from 'react';
import { Download, Link2, ExternalLink, LoaderCircle } from 'lucide-react';
import { ActionButton, Field, Notice, ResultBox, ErrorNotice } from '../components/ToolUI';
import { downloadBlob, errorMessage } from '../lib/files';
import { trackToolUse } from '../lib/analytics';
interface Result {
  title: string;
  author: string;
  cover: string | null;
  kind: 'video' | 'images';
  items: { url: string; type: 'image' | 'video' }[];
  notice: string;
}
export default function DouyinTool() {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [downloading, setDownloading] = useState<number | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  async function resolve() {
    if (busy) return;
    setBusy(true);
    setError('');
    setResult(null);
    const controller = new AbortController();
    abort.current = controller;
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch('/api/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: input }),
        signal: controller.signal,
      });
      const data = await response
        .json()
        .catch(() => ({ error: '解析服务未启动，请在 Vercel 部署或启动本地 API 服务。' }));
      if (!response.ok) throw new Error(data.error || '解析失败');
      setResult(data);
      trackToolUse('douyin');
    } catch (e) {
      setError(controller.signal.aborted ? '解析已取消或超时，请稍后再试。' : errorMessage(e));
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
    const controller = new AbortController();
    abort.current = controller;
    const timer = setTimeout(() => controller.abort(), 90000);
    try {
      const item = result.items[index];
      const response = await fetch(item.url, {
        signal: controller.signal,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
      if (!response.ok) throw new Error('媒体直链已失效或平台拒绝下载，请重新解析。');
      const limit = 200 * 1024 * 1024;
      const expected = Number(response.headers.get('content-length'));
      if (expected > limit) throw new Error('媒体超过 200 MB 浏览器下载上限。');
      const reader = response.body?.getReader();
      if (!reader) throw new Error('浏览器无法读取媒体内容。');
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > limit) throw new Error('媒体超过 200 MB 浏览器下载上限。');
          chunks.push(chunk.value);
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
      const type = response.headers.get('content-type')?.split(';')[0] || '';
      if (!(item.type === 'video' ? type.startsWith('video/') : type.startsWith('image/')))
        throw new Error('平台返回的不是可确认的媒体文件，已停止下载。');
      const extension =
        type === 'image/webp'
          ? 'webp'
          : type === 'image/png'
            ? 'png'
            : type === 'image/jpeg'
              ? 'jpg'
              : type === 'video/webm'
                ? 'webm'
                : 'mp4';
      downloadBlob(new Blob(chunks, { type }), `轻匣-抖音-${index + 1}.${extension}`);
    } catch (e) {
      const message = errorMessage(e);
      setError(
        e instanceof TypeError
          ? '平台未允许浏览器跨域下载。本站不会上传或中转媒体，当前链接无法在此直接保存。可重新解析或稍后再试。'
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
        <ActionButton busy={busy} disabled={!input.trim()} onClick={() => void resolve()}>
          <Link2 size={16} />
          解析链接
        </ActionButton>
        {busy && (
          <button className="button button-secondary" onClick={() => abort.current?.abort()}>
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
          }}
        >
          清空
        </button>
      </div>
      <ErrorNotice error={error} />
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
            <button className="button button-secondary" onClick={() => abort.current?.abort()}>
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
