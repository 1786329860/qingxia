import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Download } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useMember } from '../components/MemberSession';
import {
  ActionButton,
  ErrorNotice,
  Field,
  Notice,
  Progress,
  ResultBox,
} from '../components/ToolUI';
import { trackToolUse } from '../lib/analytics';
import { downloadBlob, errorMessage, formatBytes } from '../lib/files';
import { readSunoMedia } from '../lib/suno-download';
import { extractSunoShare, type SunoSong } from '../lib/suno-links';

export default function SunoDownloadTool() {
  const { session } = useMember();
  const [input, setInput] = useState('');
  const [stage, setStage] = useState('');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState({ received: 0, total: 0 });
  const [result, setResult] = useState<{ blob: Blob; name: string } | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort('unmount'), []);

  async function download(event: FormEvent) {
    event.preventDefault();
    if (abort.current) return;
    const url = extractSunoShare(input);
    if (!url) {
      setError('请粘贴 Suno 的单首歌曲分享链接，支持 suno.com/song/… 和 suno.com/s/…');
      return;
    }
    const controller = new AbortController();
    abort.current = controller;
    const timer = setTimeout(() => controller.abort('timeout'), 300_000);
    const { signal } = controller;
    setError('');
    setResult(null);
    setStage('正在读取 Suno 分享页…');
    setProgress({ received: 0, total: 0 });
    try {
      const response = await fetch('/api/suno', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + (session?.access_token || ''),
        },
        body: JSON.stringify({ url: url.href }),
        signal: AbortSignal.any([signal, AbortSignal.timeout(25_000)]),
      });
      const data: SunoSong & { error?: string } = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(data.sources))
        throw new Error(data.error || '歌曲解析失败，请稍后重试。');
      let failure: unknown = new Error('未找到可保存的音频。');
      for (const source of data.sources.slice(0, 2)) {
        signal.throwIfAborted();
        try {
          const status = source.kind === 'mp4' ? '正在读取作品媒体…' : '正在下载歌曲音频…';
          setStage(status);
          setProgress({ received: 0, total: 0 });
          const remux =
            source.kind === 'mp4' ? import('../lib/suno-remux').catch(() => null) : null;
          let blob = await readSunoMedia(
            source,
            data.id,
            signal,
            (received, total) => setProgress({ received, total }),
            () => {
              setStage('媒体连接中断，正在重新连接…');
              setProgress({ received: 0, total: 0 });
            },
          );
          if (source.kind === 'mp4') {
            setStage('正在提取音轨…');
            setProgress({ received: 0, total: 0 });
            const fast = await remux;
            const audio = await fast?.remuxSunoAac(blob, signal).catch(() => null);
            signal.throwIfAborted();
            if (audio) {
              blob = audio;
            } else {
              const { extractVideoAudio } = await import('./media');
              blob = await extractVideoAudio(new File([blob], 'suno.mp4'), signal, setStage);
            }
          }
          signal.throwIfAborted();
          const title =
            data.title
              .replace(/[<>:"/\\|?*\p{Cc}\p{Cf}]/gu, '_')
              .trim()
              .replace(/[. ]+$/, '') || 'Suno 歌曲';
          const name = `${title}.${source.kind === 'mp3' ? 'mp3' : 'm4a'}`;
          downloadBlob(blob, name);
          setResult({ blob, name });
          trackToolUse('suno-download');
          return;
        } catch (cause) {
          signal.throwIfAborted();
          failure = cause;
        }
      }
      throw failure;
    } catch (cause) {
      if (signal.reason === 'unmount') return;
      setError(
        signal.aborted
          ? signal.reason === 'timeout'
            ? '下载超时，未保存文件。请稍后重试。'
            : '已取消，未保存文件。'
          : cause instanceof DOMException && cause.name === 'TimeoutError'
            ? '读取 Suno 分享页超时，请稍后重试。'
            : cause instanceof TypeError
              ? '浏览器无法读取 Suno 媒体，请检查网络后重试。'
              : errorMessage(cause),
      );
      if (!signal.aborted) trackToolUse('suno-download', 'error');
    } finally {
      clearTimeout(timer);
      if (abort.current === controller) abort.current = null;
      if (signal.reason !== 'unmount') setStage('');
    }
  }

  return (
    <div className="tool-workspace">
      <Notice>
        粘贴 Suno
        单首歌曲的分享链接或文案。找到可用音轨后，浏览器会保存音频文件。仅保存你有权下载的作品。
      </Notice>
      <form className="tool-form" onSubmit={download}>
        <Field label="Suno 分享链接或文案" hint="只提交提取出的链接，不发送整段文案">
          <textarea
            value={input}
            disabled={!!stage}
            rows={3}
            maxLength={4000}
            placeholder="https://suno.com/s/…"
            onChange={(event) => {
              setInput(event.target.value);
              setError('');
              setResult(null);
            }}
          />
        </Field>
        <div className="button-row">
          <ActionButton type="submit" disabled={!input.trim() || !!stage}>
            <Download size={17} />
            下载音频
          </ActionButton>
          {stage && (
            <button
              type="button"
              className="button button-secondary"
              onClick={() => abort.current?.abort('user')}
            >
              取消
            </button>
          )}
        </div>
      </form>
      {stage && <p role="status">{stage}</p>}
      {!!stage && progress.total > 0 && (
        <Progress
          value={(progress.received / progress.total) * 100}
          label={`${formatBytes(progress.received)} / ${formatBytes(progress.total)}`}
        />
      )}
      <ErrorNotice error={error} />
      {result && (
        <ResultBox title="音频已就绪">
          <p>
            {result.name} · {formatBytes(result.blob.size)}
          </p>
          <ActionButton type="button" onClick={() => downloadBlob(result.blob, result.name)}>
            <Download size={17} />
            再下载一次
          </ActionButton>
        </ResultBox>
      )}
      <Link to="/tool/audio-convert">需要 MP3 或其他格式？去本地转换</Link>
    </div>
  );
}
