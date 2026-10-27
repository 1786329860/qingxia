import { useEffect, useRef, useState } from 'react';
import { ArrowDown, Check, Download, ImagePlus, PackageOpen, Trash2, X } from 'lucide-react';
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
import { baseName, checkFileSize, downloadZip, errorMessage, formatBytes } from '../lib/files';
import {
  detectImageFormat,
  IMAGE_EXTENSIONS,
  type ImageOutput,
  type ImageProgressStage,
  type ProcessedImage,
} from '../lib/image-process';
import { createImageProcessor } from '../lib/image-client';

interface ImageResult extends ProcessedImage {
  name: string;
  sourceName: string;
  originalSize: number;
  preview: string;
}
interface ImageFailure {
  name: string;
  message: string;
}

function ImageTool({ mode }: { mode: 'compress' | 'convert' }) {
  const compress = mode === 'compress';
  const task = useToolTask(compress ? 'image-compress' : 'image-convert');
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<ImageResult[]>([]);
  const [failures, setFailures] = useState<ImageFailure[]>([]);
  const [quality, setQuality] = useState(80);
  const [format, setFormat] = useState<ImageOutput>(compress ? 'original' : 'webp');
  const [maxWidth, setMaxWidth] = useState('');
  const [maxHeight, setMaxHeight] = useState('');
  const [background, setBackground] = useState('#ffffff');
  const [currentFile, setCurrentFile] = useState('');
  const [currentStage, setCurrentStage] = useState<ImageProgressStage | ''>('');
  const [avifPreparation, setAvifPreparation] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    'idle',
  );
  const [prepareAttempt, setPrepareAttempt] = useState(0);
  const [zipBusy, setZipBusy] = useState(false);
  const processor = useRef<ReturnType<typeof createImageProcessor> | null>(null);
  const canceled = useRef(false);
  const mounted = useRef(true);
  const previews = useRef(new Set<string>());

  useEffect(() => {
    mounted.current = true;
    const urls = previews.current;
    return () => {
      mounted.current = false;
      processor.current?.dispose();
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  useEffect(() => {
    if (format !== 'avif') return;
    let current = true;
    const runner = (processor.current ??= createImageProcessor());
    setAvifPreparation('loading');
    void runner.prepareAvif().then(
      () => {
        if (current && mounted.current && processor.current === runner) setAvifPreparation('ready');
      },
      () => {
        if (current && mounted.current && processor.current === runner) setAvifPreparation('error');
      },
    );
    return () => {
      current = false;
    };
  }, [format, prepareAttempt]);

  const clearResults = () => {
    for (const url of previews.current) URL.revokeObjectURL(url);
    previews.current.clear();
    setResults([]);
    setFailures([]);
  };
  const addFiles = (incoming: File[]) => {
    task.setError('');
    const accepted: File[] = [];
    const errors: string[] = [];
    for (const file of incoming) {
      try {
        checkFileSize(file, 40);
        const detected = detectImageFormat(file);
        if (!detected || (compress && detected === 'avif'))
          throw new Error(
            `「${file.name}」格式不支持，请选择 ${compress ? 'JPG、PNG 或 WebP' : 'PNG、JPG、WebP 或 AVIF'}。`,
          );
        accepted.push(file);
      } catch (error) {
        errors.push(errorMessage(error));
      }
    }
    const combined = [...files, ...accepted].filter(
      (file, index, list) =>
        list.findIndex(
          (other) =>
            other.name === file.name &&
            other.size === file.size &&
            other.lastModified === file.lastModified,
        ) === index,
    );
    if (combined.length > 40) errors.push('每批最多 40 张图片，已保留前 40 张。');
    const limited = combined.slice(0, 40);
    if (limited.reduce((sum, file) => sum + file.size, 0) > 120 * 1024 * 1024)
      errors.push('本批文件总量超过 120 MB，请移除部分图片后处理。');
    setFiles(limited);
    if (errors.length) task.setError(errors.join(' '));
  };

  const process = () =>
    task.run(async () => {
      if (!files.length) throw new Error('请先选择需要处理的图片。');
      if (files.reduce((sum, file) => sum + file.size, 0) > 120 * 1024 * 1024)
        throw new Error('本批文件总量超过 120 MB，请分批处理。');
      const width = Number(maxWidth || 0),
        height = Number(maxHeight || 0);
      if (
        !Number.isFinite(width) ||
        !Number.isFinite(height) ||
        width < 0 ||
        height < 0 ||
        width > 16000 ||
        height > 16000 ||
        !Number.isInteger(width) ||
        !Number.isInteger(height)
      )
        throw new Error('尺寸必须是 0～16000 的整数，留空表示保持原尺寸。');
      clearResults();
      canceled.current = false;
      const runner = (processor.current ??= createImageProcessor());
      let successful = 0;
      let outputBytes = 0;
      try {
        for (let i = 0; i < files.length; i++) {
          if (canceled.current || !mounted.current) break;
          const file = files[i];
          setCurrentFile(file.name);
          try {
            const image = await runner.process(
              file,
              {
                format,
                quality: quality / 100,
                maxWidth: compress ? width : 0,
                maxHeight: compress ? height : 0,
                maxPixels: matchMedia('(pointer: coarse)').matches ? 12e6 : 32e6,
                keepSmaller: compress,
                background,
              },
              (stage) => {
                if (mounted.current && !canceled.current) setCurrentStage(stage);
              },
            );
            if (!mounted.current || canceled.current) break;
            if (outputBytes + image.blob.size > 128 * 1024 * 1024)
              throw new Error(
                '本批生成结果超过 128 MB 内存保护限制，请下载已完成结果后，分批处理剩余图片。',
              );
            outputBytes += image.blob.size;
            const preview = URL.createObjectURL(image.blob);
            previews.current.add(preview);
            const extension = IMAGE_EXTENSIONS[image.format];
            setResults((previous) => [
              ...previous,
              {
                ...image,
                sourceName: file.name,
                name: `${baseName(file.name)}${compress ? '-轻匣压缩' : ''}.${extension}`,
                originalSize: file.size,
                preview,
              },
            ]);
            successful++;
          } catch (error) {
            if (!mounted.current || canceled.current) break;
            setFailures((previous) => [
              ...previous,
              { name: file.name, message: errorMessage(error) },
            ]);
          }
          if (mounted.current) task.setProgress(((i + 1) / files.length) * 100);
        }
      } finally {
        if (mounted.current) {
          setCurrentFile('');
          setCurrentStage('');
        }
      }
      if (canceled.current) throw new Error('已取消，已经完成的结果仍可下载。');
      if (!successful) throw new Error('本批图片均未处理成功，请查看各文件的错误说明。');
    });

  const downloadAll = async () => {
    setZipBusy(true);
    try {
      await downloadZip(
        results.map(({ name, blob }) => ({ name, blob })),
        `轻匣-${compress ? '压缩图片' : '图片转换'}.zip`,
      );
    } catch (error) {
      task.setError(`ZIP 打包失败：${errorMessage(error)}。你仍可逐张下载。`);
    } finally {
      setZipBusy(false);
    }
  };
  const originalTotal = results.reduce((sum, result) => sum + result.originalSize, 0);
  const resultTotal = results.reduce((sum, result) => sum + result.blob.size, 0);

  return (
    <div className="tool-content image-tool">
      <FileDropzone
        multiple
        disabled={task.busy}
        accept={
          compress
            ? 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp'
            : 'image/jpeg,image/png,image/webp,image/avif,.jpg,.jpeg,.png,.webp,.avif'
        }
        onFiles={addFiles}
        hint={`${compress ? 'JPG / PNG / WebP' : 'PNG / JPG / WebP / AVIF'} · 每张不超过 40 MB · 每批最多 40 张`}
      />

      {files.length > 0 && (
        <section className="file-list" aria-label="已选择的图片">
          <div className="tool-actions">
            <span className="muted">
              已选 {files.length} 张 ·{' '}
              {formatBytes(files.reduce((sum, file) => sum + file.size, 0))}
            </span>
            <button
              type="button"
              className="button button-ghost"
              disabled={task.busy}
              onClick={() => {
                setFiles([]);
                clearResults();
                task.setError('');
              }}
            >
              <Trash2 size={15} />
              清空
            </button>
          </div>
          {files.map((file, index) => (
            <div className="file-row" key={`${file.name}-${file.size}-${file.lastModified}`}>
              <ImagePlus size={17} />
              <span className="file-name">{file.name}</span>
              <span className="muted">{formatBytes(file.size)}</span>
              <button
                className="icon-button"
                aria-label={`移除 ${file.name}`}
                disabled={task.busy}
                onClick={() => setFiles((previous) => previous.filter((_, i) => i !== index))}
              >
                <X size={15} />
              </button>
            </div>
          ))}
        </section>
      )}

      <div className="controls-grid">
        <Field
          label="输出格式"
          hint={
            compress
              ? '保持原格式时，仅在输出更小时替换原文件。'
              : '输出真实编码文件，保留原始尺寸；不会只修改扩展名。'
          }
        >
          <select
            value={format}
            onChange={(event) => setFormat(event.target.value as ImageOutput)}
            disabled={task.busy}
          >
            {compress && <option value="original">保持原格式</option>}
            <option value="webp">WebP · 体积与画质兼顾</option>
            <option value="jpeg">JPG · 兼容性优先</option>
            {!compress && <option value="png">PNG · 无损及透明背景</option>}
            {!compress && <option value="avif">AVIF · 高压缩率，处理较慢</option>}
          </select>
        </Field>
        <Field
          label={`画质 · ${quality}%`}
          hint="JPG / WebP / AVIF 为有损编码；PNG 不受画质滑杆影响。"
        >
          <input
            type="range"
            min={10}
            max={100}
            step={1}
            value={quality}
            disabled={task.busy || format === 'png'}
            onChange={(event) => setQuality(Number(event.target.value))}
          />
        </Field>
        {compress && (
          <>
            <Field label="最大宽度（px）" hint="留空保持原尺寸；按比例缩小，不放大。">
              <input
                type="number"
                min={1}
                max={16000}
                step={1}
                placeholder="保持原尺寸"
                value={maxWidth}
                disabled={task.busy}
                onChange={(event) => setMaxWidth(event.target.value)}
              />
            </Field>
            <Field label="最大高度（px）">
              <input
                type="number"
                min={1}
                max={16000}
                step={1}
                placeholder="保持原尺寸"
                value={maxHeight}
                disabled={task.busy}
                onChange={(event) => setMaxHeight(event.target.value)}
              />
            </Field>
          </>
        )}
        {format === 'jpeg' && (
          <Field label="透明区域填充颜色" hint="JPG 不支持透明，将使用此背景色。">
            <input
              type="color"
              value={background}
              disabled={task.busy}
              onChange={(event) => setBackground(event.target.value)}
            />
          </Field>
        )}
      </div>

      {format === 'avif' && (
        <Notice tone={avifPreparation === 'error' ? 'warning' : 'info'}>
          <span role="status" aria-live="polite">
            {avifPreparation === 'loading'
              ? '正在准备 AVIF，首次加载可能需要几秒；可以直接开始转换。'
              : avifPreparation === 'ready'
                ? 'AVIF 已就绪，可以开始转换。'
                : avifPreparation === 'error'
                  ? 'AVIF 准备未完成，请重试；开始转换时也会重新尝试。'
                  : 'AVIF 首次使用需要准备本地编码器，后续转换会复用。'}
          </span>{' '}
          图片不会上传，动态图片仅输出静态首帧。
          {avifPreparation === 'error' && !task.busy && (
            <button
              type="button"
              className="text-button"
              onClick={() => setPrepareAttempt((attempt) => attempt + 1)}
            >
              重试准备 AVIF
            </button>
          )}
        </Notice>
      )}
      {compress &&
        format === 'original' &&
        files.some((file) => detectImageFormat(file) === 'png') && (
          <Notice>
            PNG 是无损格式，调整画质不会降低 PNG 画质。可缩小尺寸或选择 WebP；已有优化的 PNG
            不保证继续变小。
          </Notice>
        )}
      {typeof OffscreenCanvas === 'undefined' && (
        <Notice tone="warning">
          当前浏览器不支持后台画布处理，大图可能使界面暂时卡顿；建议使用较新的桌面浏览器。
        </Notice>
      )}
      <Notice>
        处理后通常会移除 EXIF
        等元数据，颜色可能因浏览器色彩管理略有变化；动画仅保留静态首帧。桌面限制 3200
        万像素，移动设备限制 1200 万像素；本批结果总量上限 128 MB。
      </Notice>

      <ErrorNotice error={task.error} />
      <div className="tool-actions">
        <ActionButton busy={task.busy} disabled={!files.length} onClick={process}>
          {compress ? '开始压缩' : '开始转换'}
          {!task.busy && <ArrowDown size={17} />}
        </ActionButton>
        {task.busy && (
          <button
            className="button button-secondary"
            onClick={() => {
              canceled.current = true;
              processor.current?.cancel();
              processor.current = null;
              setAvifPreparation('idle');
            }}
          >
            取消处理
          </button>
        )}
        {!task.busy && results.length > 0 && (
          <button className="button button-secondary" onClick={clearResults}>
            清空结果
          </button>
        )}
      </div>
      {task.busy && (
        <Progress
          value={task.progress}
          label={
            currentStage === 'loading-codec'
              ? '正在准备 AVIF 编码器，图片仍在本机'
              : currentStage === 'decoding'
                ? '正在读取图片'
                : currentStage === 'encoding'
                  ? `正在转换${currentFile ? `：${currentFile}` : ''}`
                  : '正在准备'
          }
        />
      )}

      {(results.length > 0 || failures.length > 0) && (
        <ResultBox title="处理结果">
          {results.length > 0 && (
            <>
              <div className="tool-actions">
                <span>
                  <Check size={16} /> 已完成 {results.length} 张 · {formatBytes(originalTotal)} →{' '}
                  {formatBytes(resultTotal)}
                  {compress && originalTotal > 0 && resultTotal < originalTotal
                    ? `，节省 ${Math.round((1 - resultTotal / originalTotal) * 100)}%`
                    : ''}
                </span>
                <ActionButton busy={zipBusy} disabled={task.busy} onClick={downloadAll}>
                  <PackageOpen size={16} />
                  打包 ZIP 下载
                </ActionButton>
              </div>
              <div className="image-results">
                {results.map((result, index) => (
                  <article className="image-result" key={`${result.name}-${index}`}>
                    <div
                      className="image-preview"
                      style={{
                        background:
                          'repeating-conic-gradient(#e8e8e810 0% 25%, transparent 0% 50%) 50% / 18px 18px',
                      }}
                    >
                      <img
                        src={result.preview}
                        alt={`${result.sourceName} 的处理结果`}
                        loading="lazy"
                        style={{ width: '100%', maxHeight: 220, objectFit: 'contain' }}
                      />
                    </div>
                    <div className="image-result-info">
                      <strong>{result.name}</strong>
                      <p className="muted">
                        {result.width} × {result.height} · {formatBytes(result.originalSize)} →{' '}
                        {formatBytes(result.blob.size)}
                      </p>
                      {result.warning && <p className="muted">{result.warning}</p>}
                      <DownloadButton blob={result.blob} name={result.name}>
                        <Download size={15} />
                        下载 {result.format.toUpperCase()}
                      </DownloadButton>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
          {failures.length > 0 && (
            <div className="file-list">
              {failures.map((failure, index) => (
                <Notice key={`${failure.name}-${index}`} tone="warning">
                  <strong>{failure.name}</strong>：{failure.message}
                </Notice>
              ))}
            </div>
          )}
        </ResultBox>
      )}
    </div>
  );
}

export function ImageCompressTool() {
  return <ImageTool mode="compress" />;
}
export function ImageConvertTool() {
  return <ImageTool mode="convert" />;
}
