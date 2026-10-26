import { useEffect, useRef, useState } from 'react';
import { Download, FileVideo, Music2, X } from 'lucide-react';
import {
  ActionButton,
  DownloadButton,
  ErrorNotice,
  Field,
  FileDropzone,
  Notice,
  Progress,
  ResultBox,
  useToolTask,
} from '../components/ToolUI';
import {
  baseName,
  checkFileSize,
  downloadBlob,
  downloadZip,
  errorMessage,
  formatBytes,
} from '../lib/files';
import {
  assertNotAborted,
  canvasBlob,
  formatDuration,
  loadVideo,
  makeFrameTimes,
  mediaAbortError,
  seekVideo,
} from '../lib/media-utils';

type MediaResult = { name: string; blob: Blob; time?: number };
const videoAccept = 'video/*,.mp4,.mov,.m4v,.webm,.mkv,.avi';
function isMobileDevice() {
  return typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
}
function fileLimit() {
  return isMobileDevice() ? 80 : 250;
}
function VideoAdvice() {
  return (
    <Notice>
      文件不会离开你的浏览器。大文件、长视频及 4K
      视频建议使用桌面浏览器；实际格式支持取决于浏览器和本地编解码器。
    </Notice>
  );
}
function useObjectURL(blob: Blob | null) {
  const [url, setURL] = useState('');
  useEffect(() => {
    if (!blob) {
      setURL('');
      return;
    }
    const next = URL.createObjectURL(blob);
    setURL(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return url;
}
function ResultImage({ result }: { result: MediaResult }) {
  const url = useObjectURL(result.blob);
  return (
    <div className="media-frame-card">
      <img
        src={url || undefined}
        alt={`视频 ${result.time?.toFixed(2) ?? ''} 秒处的画面`}
        loading="lazy"
        style={{
          width: '100%',
          aspectRatio: '16 / 9',
          objectFit: 'contain',
          background: '#101817',
          borderRadius: 10,
        }}
      />
      <div className="file-row">
        <span>
          {result.time?.toFixed(2)} 秒 · {formatBytes(result.blob.size)}
        </span>
        <button
          className="button button-secondary"
          onClick={() => downloadBlob(result.blob, result.name)}
          aria-label={`下载 ${result.name}`}
        >
          <Download size={15} />
        </button>
      </div>
    </div>
  );
}
function SourceFile({
  file,
  onClear,
  disabled,
}: {
  file: File;
  onClear: () => void;
  disabled: boolean;
}) {
  return (
    <div className="file-row">
      <span>
        <FileVideo size={17} /> {file.name} <small>· {formatBytes(file.size)}</small>
      </span>
      <button className="button button-ghost" disabled={disabled} onClick={onClear}>
        <X size={15} />
        清空
      </button>
    </div>
  );
}

export function VideoFramesTool() {
  const [file, setFile] = useState<File | null>(null);
  const [metadata, setMetadata] = useState<{
    duration: number;
    width: number;
    height: number;
  } | null>(null);
  const [mode, setMode] = useState('interval');
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(10);
  const [interval, setInterval] = useState(5);
  const [point, setPoint] = useState(0);
  const [format, setFormat] = useState('image/jpeg');
  const [quality, setQuality] = useState(0.85);
  const [width, setWidth] = useState(1280);
  const [results, setResults] = useState<MediaResult[]>([]);
  const [zipBusy, setZipBusy] = useState(false);
  const task = useToolTask('video-frames');
  const controller = useRef<AbortController | null>(null);
  const inspection = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      controller.current?.abort();
      inspection.current?.abort();
    },
    [],
  );
  async function choose(files: File[]) {
    const selected = files[0];
    if (!selected) return;
    inspection.current?.abort();
    const abort = new AbortController();
    inspection.current = abort;
    setMetadata(null);
    setResults([]);
    task.setError('');
    try {
      checkFileSize(selected, fileLimit());
      setFile(selected);
      const loaded = await loadVideo(selected, abort.signal);
      if (inspection.current !== abort) {
        loaded.close();
        return;
      }
      setMetadata({
        duration: loaded.video.duration,
        width: loaded.video.videoWidth,
        height: loaded.video.videoHeight,
      });
      setStart(0);
      setPoint(0);
      setEnd(Number(Math.min(loaded.video.duration, 30).toFixed(3)));
      loaded.close();
    } catch (e) {
      if (abort.signal.aborted || inspection.current !== abort) return;
      task.setError(errorMessage(e));
    }
  }
  let estimate = 0;
  try {
    estimate =
      mode === 'point'
        ? 1
        : metadata
          ? makeFrameTimes(start, end, interval, metadata.duration, 100000).length
          : 0;
  } catch {
    /* invalid input is shown on processing */
  }
  function clear() {
    inspection.current?.abort();
    setFile(null);
    setMetadata(null);
    setResults([]);
    task.setError('');
  }
  async function process() {
    await task.run(async () => {
      if (!file) throw new Error('请先选择视频文件。');
      if (!Number.isFinite(width) || width < 64 || width > 1920)
        throw new Error('输出宽度应在 64～1920 像素之间。');
      const abort = new AbortController();
      controller.current = abort;
      const loaded = await loadVideo(file, abort.signal);
      const canvas = document.createElement('canvas');
      const next: MediaResult[] = [];
      try {
        const maxFrames = isMobileDevice() ? 80 : 300;
        const times =
          mode === 'point'
            ? (() => {
                if (!Number.isFinite(point) || point < 0 || point >= loaded.video.duration)
                  throw new Error('指定时间点需要位于视频时长内。');
                return [point];
              })()
            : makeFrameTimes(start, end, interval, loaded.video.duration, maxFrames);
        canvas.width = Math.min(Math.round(width), loaded.video.videoWidth);
        canvas.height = Math.max(
          1,
          Math.round((canvas.width * loaded.video.videoHeight) / loaded.video.videoWidth),
        );
        if (canvas.width * canvas.height > 8_000_000)
          throw new Error('画面尺寸过大，请降低输出宽度。');
        const context = canvas.getContext('2d');
        if (!context) throw new Error('浏览器无法创建画布，请尝试新版浏览器。');
        let total = 0;
        const extension = format === 'image/jpeg' ? 'jpg' : format.split('/')[1];
        setResults([]);
        for (let i = 0; i < times.length; i++) {
          assertNotAborted(abort.signal);
          await seekVideo(loaded.video, times[i], abort.signal);
          context.drawImage(loaded.video, 0, 0, canvas.width, canvas.height);
          const blob = await canvasBlob(canvas, format, quality);
          total += blob.size;
          if (total > (isMobileDevice() ? 70 : 180) * 1024 * 1024)
            throw new Error('输出图片总量超过设备建议限制，请减少帧数或降低分辨率。');
          next.push({
            name: `${baseName(file.name)}-${String(i + 1).padStart(3, '0')}-${times[i].toFixed(2)}s.${extension}`,
            blob,
            time: times[i],
          });
          task.setProgress(((i + 1) / times.length) * 100);
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
        assertNotAborted(abort.signal);
        setResults(next);
      } finally {
        loaded.close();
        canvas.width = 1;
        canvas.height = 1;
        if (controller.current === abort) controller.current = null;
      }
    });
  }
  return (
    <div className="tool-workspace">
      <VideoAdvice />
      <FileDropzone
        accept={videoAccept}
        onFiles={(files) => void choose(files)}
        disabled={task.busy}
        hint={`建议 MP4 / WebM；当前设备单文件上限 ${fileLimit()} MB`}
      />
      {file && <SourceFile file={file} onClear={clear} disabled={task.busy} />}
      {metadata && (
        <div className="muted">
          时长 {formatDuration(metadata.duration)} · {metadata.width} × {metadata.height} · 预计{' '}
          {estimate} 帧
        </div>
      )}
      <div className="controls-grid">
        <Field label="抽帧方式">
          <select value={mode} disabled={task.busy} onChange={(e) => setMode(e.target.value)}>
            <option value="interval">固定间隔</option>
            <option value="point">指定时间点</option>
          </select>
        </Field>
        {mode === 'interval' ? (
          <>
            <Field label="开始时间（秒）">
              <input
                type="number"
                min="0"
                step="0.1"
                value={start}
                onChange={(e) => setStart(Number(e.target.value))}
                disabled={task.busy}
              />
            </Field>
            <Field label="结束时间（秒）">
              <input
                type="number"
                min="0"
                step="0.1"
                value={end}
                onChange={(e) => setEnd(Number(e.target.value))}
                disabled={task.busy}
              />
            </Field>
            <Field label="抽帧间隔（秒）">
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={interval}
                onChange={(e) => setInterval(Number(e.target.value))}
                disabled={task.busy}
              />
            </Field>
          </>
        ) : (
          <Field label="时间点（秒）">
            <input
              type="number"
              min="0"
              step="0.01"
              value={point}
              onChange={(e) => setPoint(Number(e.target.value))}
              disabled={task.busy}
            />
          </Field>
        )}
        <Field label="输出格式">
          <select value={format} onChange={(e) => setFormat(e.target.value)} disabled={task.busy}>
            <option value="image/jpeg">JPG</option>
            <option value="image/png">PNG</option>
            <option value="image/webp">WebP</option>
          </select>
        </Field>
        <Field label="输出宽度（像素）" hint="保持比例，不放大原视频">
          <input
            type="number"
            min="64"
            max="1920"
            step="1"
            value={width}
            onChange={(e) => setWidth(Number(e.target.value))}
            disabled={task.busy}
          />
        </Field>
        <Field
          label={`图片质量 ${Math.round(quality * 100)}%`}
          hint={format === 'image/png' ? 'PNG 为无损格式，不使用质量参数' : undefined}
        >
          <input
            type="range"
            min="0.1"
            max="1"
            step="0.05"
            value={quality}
            onChange={(e) => setQuality(Number(e.target.value))}
            disabled={task.busy || format === 'image/png'}
          />
        </Field>
      </div>
      <div className="button-row">
        <ActionButton onClick={() => void process()} busy={task.busy} disabled={!file}>
          开始抽帧{estimate ? ` · ${estimate} 帧` : ''}
        </ActionButton>
        {task.busy && (
          <button className="button button-secondary" onClick={() => controller.current?.abort()}>
            取消处理
          </button>
        )}
      </div>
      {task.busy && <Progress value={task.progress} label="正在本地抽取画面" />}
      <ErrorNotice error={task.error} />
      {results.length > 0 && (
        <ResultBox title={`已生成 ${results.length} 帧`}>
          <div className="button-row">
            <button
              className="button button-primary"
              disabled={zipBusy}
              onClick={async () => {
                setZipBusy(true);
                try {
                  await downloadZip(results, `${baseName(file?.name || '视频')}-帧.zip`);
                } catch (e) {
                  task.setError(errorMessage(e));
                } finally {
                  setZipBusy(false);
                }
              }}
            >
              <Download size={16} />
              {zipBusy ? '正在打包…' : '下载全部 ZIP'}
            </button>
            <button className="button button-secondary" onClick={() => setResults([])}>
              清空结果
            </button>
          </div>
          <div
            className="media-frames-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: 14,
            }}
          >
            {results.map((result) => (
              <ResultImage key={result.name} result={result} />
            ))}
          </div>
        </ResultBox>
      )}
    </div>
  );
}

type FFmpegInstance = import('@ffmpeg/ffmpeg').FFmpeg;
async function withFFmpeg(
  file: File,
  signal: AbortSignal,
  progress: (value: number, stage?: string) => void,
  execute: (ffmpeg: FFmpegInstance, inputName: string) => Promise<MediaResult>,
): Promise<MediaResult> {
  if (typeof Worker === 'undefined' || typeof WebAssembly === 'undefined')
    throw new Error('当前浏览器不支持本地视频处理，请使用新版桌面 Chrome、Edge 或 Firefox。');
  const limit = isMobileDevice() ? 60 : 150;
  checkFileSize(file, limit);
  assertNotAborted(signal);
  progress(1, '正在加载本地处理引擎（首次约 32 MB）');
  const { FFmpeg } = await import('@ffmpeg/ffmpeg');
  const engine = new FFmpeg();
  const abort = () => {
    try {
      engine.terminate();
    } catch {
      /* already stopped */
    }
  };
  signal.addEventListener('abort', abort, { once: true });
  let timedOut = false;
  const timer = setTimeout(
    () => {
      timedOut = true;
      abort();
    },
    8 * 60 * 1000,
  );
  try {
    assertNotAborted(signal);
    engine.on('progress', ({ progress: value }) =>
      progress(Math.max(5, Math.min(98, value * 93 + 5)), '正在浏览器中处理'),
    );
    let loadTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        engine.load({
          coreURL: new URL('/ffmpeg/ffmpeg-core.js', location.origin).href,
          wasmURL: new URL('/ffmpeg/ffmpeg-core.wasm', location.origin).href,
        }),
        new Promise<never>((_, reject) => {
          loadTimer = setTimeout(() => {
            abort();
            reject(new Error('load timeout'));
          }, 60000);
        }),
      ]);
    } catch (e) {
      if (signal.aborted) throw mediaAbortError();
      throw new Error('本地处理引擎加载失败。请检查网络，或改用新版桌面浏览器；文件未上传。');
    } finally {
      clearTimeout(loadTimer);
    }
    assertNotAborted(signal);
    progress(5, '正在读取本地文件');
    const ext =
      file.name
        .split('.')
        .pop()
        ?.replace(/[^a-zA-Z0-9]/g, '')
        .slice(0, 8) || 'mp4';
    const inputName = `input.${ext}`;
    await engine.writeFile(inputName, new Uint8Array(await file.arrayBuffer()));
    assertNotAborted(signal);
    const result = await execute(engine, inputName);
    assertNotAborted(signal);
    await engine.deleteFile(inputName);
    progress(100, '处理完成');
    return result;
  } catch (error) {
    if (signal.aborted) throw mediaAbortError();
    if (timedOut) throw new Error('处理超过 8 分钟已自动停止，请缩短片段或使用更小文件。');
    if (
      error instanceof Error &&
      (error.message.includes('Aborted') || error.message.includes('memory'))
    )
      throw new Error('设备可用内存不足，请缩短片段、降低尺寸或改用桌面浏览器。');
    throw error;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
    try {
      engine.terminate();
    } catch {
      /* engine has been disposed */
    }
  }
}

async function probeDuration(ffmpeg: FFmpegInstance, input: string): Promise<number> {
  // This core can return -1 from ffprobe even when it writes valid output. Validate
  // this run's result file instead of treating its wrapper status as a duration.
  await ffmpeg.ffprobe([
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    input,
    '-o',
    'duration.txt',
  ]);
  try {
    const output = await ffmpeg.readFile('duration.txt');
    const duration = Number(
      (typeof output === 'string' ? output : new TextDecoder().decode(output)).trim(),
    );
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('invalid duration');
    await ffmpeg.deleteFile('duration.txt');
    return duration;
  } catch {
    throw new Error('无法读取视频的有效时长，请尝试其他视频或更常见的 MP4 / WebM 格式。');
  }
}

async function readOutput(
  ffmpeg: FFmpegInstance,
  name: string,
  mime: string,
  maxBytes: number,
): Promise<Blob> {
  const output = await ffmpeg.readFile(name);
  if (typeof output === 'string' || output.byteLength < 12)
    throw new Error('处理未产生有效文件，输入可能不含对应的视频或音频轨道。');
  if (output.byteLength >= maxBytes - 65536)
    throw new Error(
      '输出文件达到设备内存限制，已丢弃不完整结果。请缩短片段、降低参数或改用压缩格式。',
    );
  const bytes = Uint8Array.from(output);
  const head = new TextDecoder('ascii').decode(bytes.subarray(0, 12));
  if (mime === 'image/gif' && !head.startsWith('GIF8'))
    throw new Error('GIF 编码结果无效，请尝试更短片段。');
  if (mime === 'audio/wav' && !(head.startsWith('RIFF') && head.includes('WAVE')))
    throw new Error('WAV 编码结果无效。');
  if (
    mime === 'audio/mpeg' &&
    !(head.startsWith('ID3') || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0))
  )
    throw new Error('MP3 编码结果无效。');
  await ffmpeg.deleteFile(name);
  return new Blob([bytes], { type: mime });
}

function MediaPreview({ result }: { result: MediaResult }) {
  const url = useObjectURL(result.blob);
  return (
    <ResultBox>
      <div className="file-row">
        <strong>{result.name}</strong>
        <span>{formatBytes(result.blob.size)}</span>
      </div>
      {result.blob.type === 'image/gif' ? (
        <img
          src={url || undefined}
          alt="生成的 GIF 预览"
          style={{ maxWidth: '100%', maxHeight: 420, display: 'block', borderRadius: 12 }}
        />
      ) : (
        <audio controls src={url || undefined} style={{ width: '100%' }}>
          当前浏览器不支持音频预览，可以直接下载结果。
        </audio>
      )}
      <DownloadButton blob={result.blob} name={result.name} />
    </ResultBox>
  );
}

export function VideoGifTool() {
  const [file, setFile] = useState<File | null>(null);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(5);
  const [fps, setFps] = useState(10);
  const [width, setWidth] = useState(480);
  const [result, setResult] = useState<MediaResult | null>(null);
  const [stage, setStage] = useState('');
  const task = useToolTask('video-gif');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  function choose(files: File[]) {
    const selected = files[0];
    if (!selected) return;
    setResult(null);
    task.setError('');
    try {
      checkFileSize(selected, isMobileDevice() ? 60 : 150);
      setFile(selected);
    } catch (e) {
      task.setError(errorMessage(e));
    }
  }
  async function process() {
    await task.run(async () => {
      if (!file) throw new Error('请先选择视频文件。');
      const duration = end - start;
      const maxDuration = isMobileDevice() ? 15 : 30;
      if (
        ![start, end, fps, width].every(Number.isFinite) ||
        start < 0 ||
        duration <= 0 ||
        duration > maxDuration
      )
        throw new Error(`请选择有效片段，当前设备每次最多 ${maxDuration} 秒。`);
      if (
        !Number.isInteger(fps) ||
        fps < 1 ||
        fps > 20 ||
        !Number.isInteger(width) ||
        width < 64 ||
        width > 960
      )
        throw new Error('帧率需要为 1～20 的整数，输出宽度需要为 64～960 的整数。');
      const abort = new AbortController();
      controller.current = abort;
      setResult(null);
      try {
        const output = await withFFmpeg(
          file,
          abort.signal,
          (value, label) => {
            task.setProgress(value);
            if (label) setStage(label);
          },
          async (engine, input) => {
            const videoDuration = await probeDuration(engine, input);
            if (start >= videoDuration || end > videoDuration + 0.05)
              throw new Error(
                `视频总长 ${videoDuration.toFixed(2)} 秒，请将起止时间设置在视频时长内。`,
              );
            const maxBytes = (isMobileDevice() ? 35 : 90) * 1024 * 1024;
            const filter = `[0:v]fps=${fps},scale=${width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3`;
            const code = await engine.exec([
              '-ss',
              String(start),
              '-t',
              String(duration),
              '-i',
              input,
              '-filter_complex',
              filter,
              '-loop',
              '0',
              '-an',
              '-fs',
              String(maxBytes),
              'output.gif',
            ]);
            if (code !== 0)
              throw new Error(
                'GIF 转换失败。请确认片段位于视频时长内，并尝试 MP4/H.264、较短片段或更低分辨率。',
              );
            const blob = await readOutput(engine, 'output.gif', 'image/gif', maxBytes);
            if (blob.size > 100 * 1024 * 1024)
              throw new Error('GIF 结果超过 100 MB，请降低尺寸或帧率。');
            return { name: `${baseName(file.name)}.gif`, blob };
          },
        );
        setResult(output);
      } finally {
        if (controller.current === abort) controller.current = null;
      }
    });
  }
  return (
    <div className="tool-workspace">
      <VideoAdvice />
      <Notice tone="warning">
        GIF 文件通常比原视频大。建议选择 3～10 秒片段；首次使用会从本站加载约 32 MB
        的本地处理引擎，不上传视频。
      </Notice>
      <FileDropzone
        accept={videoAccept}
        onFiles={choose}
        disabled={task.busy}
        hint={`单文件上限 ${isMobileDevice() ? 60 : 150} MB；片段最长 ${isMobileDevice() ? 15 : 30} 秒`}
      />
      {file && (
        <SourceFile
          file={file}
          onClear={() => {
            setFile(null);
            setResult(null);
            task.setError('');
          }}
          disabled={task.busy}
        />
      )}
      <div className="controls-grid">
        <Field label="开始时间（秒）">
          <input
            type="number"
            min="0"
            step="0.1"
            value={start}
            onChange={(e) => setStart(Number(e.target.value))}
            disabled={task.busy}
          />
        </Field>
        <Field label="结束时间（秒）">
          <input
            type="number"
            min="0"
            step="0.1"
            value={end}
            onChange={(e) => setEnd(Number(e.target.value))}
            disabled={task.busy}
          />
        </Field>
        <Field label="帧率（FPS）">
          <input
            type="number"
            min="1"
            max="20"
            value={fps}
            onChange={(e) => setFps(Number(e.target.value))}
            disabled={task.busy}
          />
        </Field>
        <Field label="输出宽度（像素）" hint="保持原画面比例">
          <select
            value={width}
            onChange={(e) => setWidth(Number(e.target.value))}
            disabled={task.busy}
          >
            <option value="320">320 px · 小巧</option>
            <option value="480">480 px · 推荐</option>
            <option value="640">640 px · 清晰</option>
            <option value="960">960 px · 较大</option>
          </select>
        </Field>
      </div>
      <div className="button-row">
        <ActionButton onClick={() => void process()} busy={task.busy} disabled={!file}>
          生成 GIF
        </ActionButton>
        {task.busy && (
          <button className="button button-secondary" onClick={() => controller.current?.abort()}>
            取消处理
          </button>
        )}
      </div>
      {task.busy && <Progress value={task.progress} label={stage} />}
      <ErrorNotice error={task.error} />
      {result && <MediaPreview result={result} />}
    </div>
  );
}

export function ExtractAudioTool() {
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState('mp3');
  const [bitrate, setBitrate] = useState('192');
  const [result, setResult] = useState<MediaResult | null>(null);
  const [stage, setStage] = useState('');
  const task = useToolTask('extract-audio');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  function choose(files: File[]) {
    const selected = files[0];
    if (!selected) return;
    setResult(null);
    task.setError('');
    try {
      checkFileSize(selected, isMobileDevice() ? 60 : 150);
      setFile(selected);
    } catch (e) {
      task.setError(errorMessage(e));
    }
  }
  async function process() {
    await task.run(async () => {
      if (!file) throw new Error('请先选择含音轨的视频文件。');
      const abort = new AbortController();
      controller.current = abort;
      setResult(null);
      try {
        const output = await withFFmpeg(
          file,
          abort.signal,
          (value, label) => {
            task.setProgress(value);
            if (label) setStage(label);
          },
          async (engine, input) => {
            const maxBytes = (isMobileDevice() ? 60 : 120) * 1024 * 1024;
            const args =
              format === 'wav'
                ? ['-c:a', 'pcm_s16le', '-ar', '44100']
                : ['-c:a', 'libmp3lame', '-b:a', `${bitrate}k`];
            const code = await engine.exec([
              '-i',
              input,
              '-map',
              '0:a:0',
              '-vn',
              ...args,
              '-fs',
              String(maxBytes),
              `output.${format}`,
            ]);
            if (code !== 0)
              throw new Error(
                '提取失败：文件可能没有音轨，或编码不受支持。请尝试其他视频；静音视频无法生成音频。',
              );
            const blob = await readOutput(
              engine,
              `output.${format}`,
              format === 'wav' ? 'audio/wav' : 'audio/mpeg',
              maxBytes,
            );
            return { name: `${baseName(file.name)}.${format}`, blob };
          },
        );
        setResult(output);
      } finally {
        if (controller.current === abort) controller.current = null;
      }
    });
  }
  return (
    <div className="tool-workspace">
      <VideoAdvice />
      <Notice>
        提取视频中的第一条音轨。MP3 体积较小；WAV 为未压缩
        PCM，文件可能明显增大。首次使用会加载本站的本地处理引擎。
      </Notice>
      <FileDropzone
        accept={videoAccept}
        onFiles={choose}
        disabled={task.busy}
        hint={`MP4 / MOV / WebM 等；单文件上限 ${isMobileDevice() ? 60 : 150} MB`}
      />
      {file && (
        <SourceFile
          file={file}
          onClear={() => {
            setFile(null);
            setResult(null);
            task.setError('');
          }}
          disabled={task.busy}
        />
      )}
      <div className="controls-grid">
        <Field label="输出格式">
          <select value={format} onChange={(e) => setFormat(e.target.value)} disabled={task.busy}>
            <option value="mp3">MP3 · 通用压缩音频</option>
            <option value="wav">WAV · 未压缩 PCM</option>
          </select>
        </Field>
        <Field label="MP3 比特率" hint={format === 'wav' ? 'WAV 不使用此参数' : undefined}>
          <select
            value={bitrate}
            onChange={(e) => setBitrate(e.target.value)}
            disabled={task.busy || format === 'wav'}
          >
            <option value="128">128 kbps · 较小</option>
            <option value="192">192 kbps · 推荐</option>
            <option value="320">320 kbps · 较高</option>
          </select>
        </Field>
      </div>
      <div className="button-row">
        <ActionButton onClick={() => void process()} busy={task.busy} disabled={!file}>
          <Music2 size={17} />
          提取音频
        </ActionButton>
        {task.busy && (
          <button className="button button-secondary" onClick={() => controller.current?.abort()}>
            取消处理
          </button>
        )}
      </div>
      {task.busy && <Progress value={task.progress} label={stage} />}
      <ErrorNotice error={task.error} />
      {result && <MediaPreview result={result} />}
    </div>
  );
}
