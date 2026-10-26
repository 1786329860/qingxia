import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, FileText, Download, X } from 'lucide-react';
import { PDFDocument, PageSizes, type PDFImage } from 'pdf-lib';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
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
import { fitImageOnPage, jpegOrientation, parsePageRanges } from '../lib/pdf-utils';

type OutputFile = { name: string; blob: Blob };
const PDF_ACCEPT = '.pdf,application/pdf';
const MAX_PAGES = 300;
const MAX_BATCH_BYTES = 100 * 1024 * 1024;
const nextFrame = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function mobileDevice() {
  return typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
}
function validatePdf(file: File) {
  if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf')
    throw new Error('请选择 PDF 文件，不支持把其他文件改名为 .pdf。');
  checkFileSize(file, mobileDevice() ? 25 : 50);
}
async function readPdf(file: File) {
  validatePdf(file);
  try {
    const doc = await PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false });
    if (doc.getPageCount() < 1) throw new Error('PDF 中没有可处理的页面。');
    if (doc.getPageCount() > MAX_PAGES)
      throw new Error(`当前最多处理 ${MAX_PAGES} 页，请先分成较小文件。`);
    return doc;
  } catch (error) {
    const message = errorMessage(error);
    if (/encrypt|password/i.test(message))
      throw new Error('这份 PDF 受到密码保护。请先使用有权限的软件解锁，再选择文件。');
    if (/最多处理|没有可处理/.test(message)) throw error;
    throw new Error('无法读取这份 PDF，文件可能损坏或格式不受支持。请确认它能正常打开后重试。');
  }
}
async function savePdf(doc: PDFDocument) {
  const bytes = await doc.save({
    useObjectStreams: true,
    addDefaultPage: false,
    updateFieldAppearances: false,
    objectsPerTick: 20,
  });
  return new Blob([bytes], { type: 'application/pdf' });
}
async function renderDocument(file: File) {
  validatePdf(file);
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  try {
    const task = pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      isEvalSupported: false,
      cMapUrl: '/vendor/pdfjs/cmaps/',
      cMapPacked: true,
      standardFontDataUrl: '/vendor/pdfjs/standard_fonts/',
      useSystemFonts: true,
    });
    // Password entry is intentionally not implemented by these P0 tools.
    task.onPassword = () => {
      void task.destroy();
    };
    const doc = await task.promise;
    if (doc.numPages > MAX_PAGES) {
      await doc.destroy();
      throw new Error(`当前最多处理 ${MAX_PAGES} 页，请先选择较小文件。`);
    }
    return doc;
  } catch (error) {
    const message = errorMessage(error);
    if (/password|encrypt|worker was destroyed/i.test(message))
      throw new Error('这份 PDF 受到密码保护，请先解锁后重试。');
    if (/最多处理/.test(message)) throw error;
    throw new Error('PDF 渲染失败，文件可能损坏、被加密或浏览器不支持。请换用最新版桌面浏览器。');
  }
}
async function canvasBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error('图像生成失败，可能已超过浏览器内存限制。')),
      type,
      quality,
    ),
  );
}
async function renderPage(
  doc: Awaited<ReturnType<typeof renderDocument>>,
  index: number,
  dpi: number,
  type: 'image/jpeg' | 'image/png',
  quality: number,
) {
  const page = await doc.getPage(index + 1);
  const viewport = page.getViewport({ scale: dpi / 72 });
  const maxPixels = mobileDevice() ? 6_000_000 : 16_000_000;
  if (viewport.width * viewport.height > maxPixels) {
    page.cleanup();
    throw new Error(`第 ${index + 1} 页的输出尺寸过大，请降低清晰度（DPI）后重试。`);
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('浏览器无法创建绘图画布，请关闭其他占用内存的标签后重试。');
  try {
    await page.render({ canvasContext: context, viewport, background: '#ffffff' }).promise;
    return await canvasBlob(canvas, type, quality);
  } finally {
    canvas.width = canvas.height = 0;
    page.cleanup();
  }
}
function FileListEditor({
  files,
  onChange,
  disabled = false,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
}) {
  const move = (index: number, direction: number) => {
    const copy = [...files];
    [copy[index], copy[index + direction]] = [copy[index + direction], copy[index]];
    onChange(copy);
  };
  return files.length ? (
    <div className="file-list">
      {files.map((file, index) => (
        <div className="file-row" key={`${file.name}-${file.lastModified}-${index}`}>
          <FileText size={18} />
          <div className="file-row-info">
            <strong>
              {index + 1}. {file.name}
            </strong>
            <small>{formatBytes(file.size)}</small>
          </div>
          <div className="button-row">
            <button
              className="icon-button"
              aria-label={`上移 ${file.name}`}
              disabled={disabled || index === 0}
              onClick={() => move(index, -1)}
            >
              <ArrowUp size={16} />
            </button>
            <button
              className="icon-button"
              aria-label={`下移 ${file.name}`}
              disabled={disabled || index === files.length - 1}
              onClick={() => move(index, 1)}
            >
              <ArrowDown size={16} />
            </button>
            <button
              className="icon-button"
              aria-label={`移除 ${file.name}`}
              disabled={disabled}
              onClick={() => onChange(files.filter((_, i) => i !== index))}
            >
              <X size={16} />
            </button>
          </div>
        </div>
      ))}
    </div>
  ) : null;
}
function PdfCaution() {
  return (
    <Notice>
      请保留原件。修改 PDF 会使已有数字签名失效，复杂书签、表单及文档级交互可能无法完整保留。
    </Notice>
  );
}
function SinglePdf({
  file,
  setFile,
  busy,
}: {
  file: File | null;
  setFile: (file: File | null) => void;
  busy: boolean;
}) {
  return (
    <>
      <FileDropzone
        accept={PDF_ACCEPT}
        disabled={busy}
        hint={`PDF 文件，单份不超过 ${mobileDevice() ? 25 : 50} MB，最多 ${MAX_PAGES} 页`}
        onFiles={(files) => setFile(files[0] || null)}
      />
      {file && (
        <FileListEditor
          files={[file]}
          disabled={busy}
          onChange={(files) => setFile(files[0] || null)}
        />
      )}
    </>
  );
}
function Cancellation({ busy, onCancel }: { busy: boolean; onCancel: () => void }) {
  return busy ? (
    <button className="button button-secondary" onClick={onCancel}>
      取消处理
    </button>
  ) : null;
}
function ensureActive(cancel: React.RefObject<boolean>) {
  if (cancel.current) throw new Error('已取消处理，没有修改你的原文件。');
}

export function PdfMergeTool() {
  const [files, setFiles] = useState<File[]>([]);
  const [result, setResult] = useState<{ blob: Blob; pages: number } | null>(null);
  const task = useToolTask('pdf-merge');
  const cancel = useRef(false);
  const change = (next: File[]) => {
    setFiles(next);
    setResult(null);
    task.setError('');
  };
  return (
    <div className="tool-form">
      <FileDropzone
        accept={PDF_ACCEPT}
        multiple
        disabled={task.busy}
        hint="按添加顺序合并，可上下调整；最多 20 个文件，总计 100 MB"
        onFiles={(next) => change([...files, ...next])}
      />
      <FileListEditor files={files} onChange={change} disabled={task.busy} />
      <PdfCaution />
      <div className="button-row">
        <ActionButton
          busy={task.busy}
          disabled={files.length < 2}
          onClick={() =>
            task.run(async () => {
              cancel.current = false;
              setResult(null);
              if (files.length > 20) throw new Error('一次最多合并 20 个 PDF，请减少文件。');
              if (files.reduce((sum, file) => sum + file.size, 0) > MAX_BATCH_BYTES)
                throw new Error('文件总大小超过 100 MB，请分批合并。');
              const output = await PDFDocument.create();
              for (const [i, file] of files.entries()) {
                ensureActive(cancel);
                const doc = await readPdf(file);
                if (output.getPageCount() + doc.getPageCount() > MAX_PAGES)
                  throw new Error(`合并后最多 ${MAX_PAGES} 页，请减少文件。`);
                const pages = await output.copyPages(doc, doc.getPageIndices());
                pages.forEach((page) => output.addPage(page));
                task.setProgress(((i + 1) / files.length) * 90);
                await nextFrame();
              }
              ensureActive(cancel);
              setResult({ blob: await savePdf(output), pages: output.getPageCount() });
            })
          }
        >
          合并 PDF
        </ActionButton>
        <Cancellation
          busy={task.busy}
          onCancel={() => {
            cancel.current = true;
          }}
        />
        <button
          className="button button-ghost"
          disabled={task.busy || !files.length}
          onClick={() => change([])}
        >
          清空
        </button>
      </div>
      {task.busy && <Progress value={task.progress} label="正在合并页面" />}
      <ErrorNotice error={task.error} />
      {result && (
        <ResultBox>
          <p>
            已合并 {files.length} 份文件，共 {result.pages} 页 · {formatBytes(result.blob.size)}
          </p>
          <DownloadButton blob={result.blob} name="轻匣-合并文件.pdf" />
        </ResultBox>
      )}
    </div>
  );
}

export function PdfSplitTool() {
  const [file, setFile] = useState<File | null>(null);
  const [range, setRange] = useState('');
  const [mode, setMode] = useState<'range' | 'pages'>('range');
  const [results, setResults] = useState<OutputFile[]>([]);
  const [pageCount, setPageCount] = useState(0);
  const [zipping, setZipping] = useState(false);
  const task = useToolTask('pdf-split');
  const cancel = useRef(false);
  const reset = (next: File | null) => {
    setFile(next);
    setResults([]);
    setPageCount(0);
    task.setError('');
  };
  return (
    <div className="tool-form">
      <SinglePdf file={file} setFile={reset} busy={task.busy} />
      <div className="controls-grid">
        <Field label="导出方式">
          <select
            disabled={task.busy}
            value={mode}
            onChange={(e) => {
              setMode(e.target.value as typeof mode);
              setResults([]);
            }}
          >
            <option value="range">所选页面合成一份 PDF</option>
            <option value="pages">每页导出一份 PDF</option>
          </select>
        </Field>
        <Field label="页码范围" hint="留空表示全部；例如 1-3,5,8-10，重复页码会合并">
          <input
            disabled={task.busy}
            placeholder="全部页面"
            value={range}
            onChange={(e) => {
              setRange(e.target.value);
              setResults([]);
            }}
          />
        </Field>
      </div>
      <PdfCaution />
      <div className="button-row">
        <ActionButton
          disabled={!file}
          busy={task.busy}
          onClick={() =>
            task.run(async () => {
              if (!file) return;
              cancel.current = false;
              setResults([]);
              const doc = await readPdf(file);
              setPageCount(doc.getPageCount());
              const indices = parsePageRanges(range, doc.getPageCount());
              const output: OutputFile[] = [];
              if (mode === 'range') {
                const dest = await PDFDocument.create();
                const pages = await dest.copyPages(doc, indices);
                pages.forEach((page) => dest.addPage(page));
                ensureActive(cancel);
                output.push({
                  blob: await savePdf(dest),
                  name: `${baseName(file.name)}-所选页面.pdf`,
                });
              } else {
                for (const [i, pageIndex] of indices.entries()) {
                  ensureActive(cancel);
                  const dest = await PDFDocument.create();
                  const [page] = await dest.copyPages(doc, [pageIndex]);
                  dest.addPage(page);
                  output.push({
                    blob: await savePdf(dest),
                    name: `${baseName(file.name)}-第${String(pageIndex + 1).padStart(3, '0')}页.pdf`,
                  });
                  task.setProgress(((i + 1) / indices.length) * 95);
                  await nextFrame();
                }
              }
              ensureActive(cancel);
              setResults(output);
            })
          }
        >
          拆分 PDF
        </ActionButton>
        <Cancellation
          busy={task.busy}
          onCancel={() => {
            cancel.current = true;
          }}
        />
        <button className="button button-ghost" disabled={task.busy} onClick={() => reset(null)}>
          清空
        </button>
      </div>
      {task.busy && <Progress value={task.progress} label="正在拆分页面" />}
      <ErrorNotice error={task.error} />
      {results.length > 0 && (
        <ResultBox>
          <p>
            原文件 {pageCount} 页，生成 {results.length} 份 PDF。
          </p>
          {results.length > 1 && (
            <ActionButton
              busy={zipping}
              onClick={async () => {
                setZipping(true);
                try {
                  await downloadZip(results, `${baseName(file!.name)}-拆分.zip`);
                } catch (error) {
                  task.setError(errorMessage(error));
                } finally {
                  setZipping(false);
                }
              }}
            >
              <Download size={16} />
              打包下载 ZIP
            </ActionButton>
          )}
          <div className="file-list">
            {results.map((result) => (
              <div className="file-row" key={result.name}>
                <div className="file-row-info">
                  <strong>{result.name}</strong>
                  <small>{formatBytes(result.blob.size)}</small>
                </div>
                <DownloadButton blob={result.blob} name={result.name}>
                  下载
                </DownloadButton>
              </div>
            ))}
          </div>
        </ResultBox>
      )}
    </div>
  );
}

export function PdfToImagesTool() {
  const [file, setFile] = useState<File | null>(null);
  const [range, setRange] = useState('');
  const [format, setFormat] = useState<'image/jpeg' | 'image/png'>('image/png');
  const [dpi, setDpi] = useState(120);
  const [quality, setQuality] = useState(0.85);
  const [results, setResults] = useState<OutputFile[]>([]);
  const [zipping, setZipping] = useState(false);
  const task = useToolTask('pdf-to-images');
  const cancel = useRef(false);
  const clear = () => setResults([]);
  const reset = (next: File | null) => {
    setFile(next);
    clear();
    task.setError('');
  };
  return (
    <div className="tool-form">
      <SinglePdf file={file} setFile={reset} busy={task.busy} />
      <div className="controls-grid">
        <Field label="输出格式">
          <select
            disabled={task.busy}
            value={format}
            onChange={(e) => {
              setFormat(e.target.value as typeof format);
              clear();
            }}
          >
            <option value="image/png">PNG · 无损</option>
            <option value="image/jpeg">JPG · 更小体积</option>
          </select>
        </Field>
        <Field label="清晰度">
          <select
            disabled={task.busy}
            value={dpi}
            onChange={(e) => {
              setDpi(Number(e.target.value));
              clear();
            }}
          >
            <option value={72}>72 DPI · 轻量</option>
            <option value={120}>120 DPI · 日常使用</option>
            <option value={150}>150 DPI · 清晰</option>
            <option value={200}>200 DPI · 更清晰</option>
          </select>
        </Field>
        <Field label="页码范围" hint="留空为全部，例如 1-3,5">
          <input
            disabled={task.busy}
            value={range}
            placeholder="全部页面"
            onChange={(e) => {
              setRange(e.target.value);
              clear();
            }}
          />
        </Field>
        {format === 'image/jpeg' && (
          <Field label={`JPG 质量 ${Math.round(quality * 100)}%`}>
            <input
              disabled={task.busy}
              type="range"
              min="0.3"
              max="1"
              step="0.05"
              value={quality}
              onChange={(e) => {
                setQuality(Number(e.target.value));
                clear();
              }}
            />
          </Field>
        )}
      </div>
      <Notice>
        逐页在本地渲染，保留可见页面内容。移动端最多导出 40 页，桌面端最多 100 页；图片总计不超过
        100 MB，大文件建议分段导出。
      </Notice>
      <div className="button-row">
        <ActionButton
          busy={task.busy}
          disabled={!file}
          onClick={() =>
            task.run(async () => {
              if (!file) return;
              cancel.current = false;
              clear();
              const doc = await renderDocument(file);
              try {
                const indices = parsePageRanges(range, doc.numPages);
                const limit = mobileDevice() ? 40 : 100;
                if (indices.length > limit)
                  throw new Error(`一次最多导出 ${limit} 页，请缩小页码范围后分批处理。`);
                const output: OutputFile[] = [];
                let total = 0;
                for (const [i, page] of indices.entries()) {
                  ensureActive(cancel);
                  const blob = await renderPage(doc, page, dpi, format, quality);
                  total += blob.size;
                  if (total > MAX_BATCH_BYTES)
                    throw new Error('输出图片已超过 100 MB，请降低清晰度或减少页数。');
                  output.push({
                    name: `${baseName(file.name)}-第${String(page + 1).padStart(3, '0')}页.${format === 'image/png' ? 'png' : 'jpg'}`,
                    blob,
                  });
                  task.setProgress(((i + 1) / indices.length) * 95);
                  await nextFrame();
                }
                ensureActive(cancel);
                setResults(output);
              } finally {
                await doc.destroy();
              }
            })
          }
        >
          导出图片
        </ActionButton>
        <Cancellation
          busy={task.busy}
          onCancel={() => {
            cancel.current = true;
          }}
        />
        <button className="button button-ghost" disabled={task.busy} onClick={() => reset(null)}>
          清空
        </button>
      </div>
      {task.busy && <Progress value={task.progress} label="正在渲染 PDF 页面" />}
      <ErrorNotice error={task.error} />
      {results.length > 0 && (
        <ResultBox>
          <p>
            已生成 {results.length} 张图片 ·{' '}
            {formatBytes(results.reduce((sum, result) => sum + result.blob.size, 0))}
          </p>
          {results.length > 1 && (
            <ActionButton
              busy={zipping}
              onClick={async () => {
                setZipping(true);
                try {
                  await downloadZip(results, `${baseName(file!.name)}-图片.zip`);
                } catch (error) {
                  task.setError(errorMessage(error));
                } finally {
                  setZipping(false);
                }
              }}
            >
              <Download size={16} />
              批量下载 ZIP
            </ActionButton>
          )}
          <div className="file-list">
            {results.map((result) => (
              <div className="file-row" key={result.name}>
                <div className="file-row-info">
                  <strong>{result.name}</strong>
                  <small>{formatBytes(result.blob.size)}</small>
                </div>
                <DownloadButton blob={result.blob} name={result.name}>
                  下载
                </DownloadButton>
              </div>
            ))}
          </div>
        </ResultBox>
      )}
    </div>
  );
}

async function embedImage(doc: PDFDocument, file: File): Promise<PDFImage> {
  checkFileSize(file, 20);
  if (!/\.(jpe?g|png|webp)$/i.test(file.name) && !/^image\/(jpeg|png|webp)$/.test(file.type))
    throw new Error(`「${file.name}」格式不支持，请使用 JPG、PNG 或 WebP。`);
  let image: ImageBitmap;
  try {
    image = await createImageBitmap(file);
  } catch {
    throw new Error(`无法读取「${file.name}」，请检查图片格式或换用最新版浏览器。`);
  }
  try {
    if (image.width * image.height > (mobileDevice() ? 16_000_000 : 36_000_000))
      throw new Error(`「${file.name}」像素过多，请先使用图片压缩减小尺寸。`);
    const jpeg = file.type === 'image/jpeg' || /\.jpe?g$/i.test(file.name);
    if (jpeg) {
      const bytes = await file.arrayBuffer();
      if (jpegOrientation(bytes) === 1) return await doc.embedJpg(bytes);
    }
    if (file.type === 'image/png' || /\.png$/i.test(file.name))
      return await doc.embedPng(await file.arrayBuffer());
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    try {
      const context = canvas.getContext('2d');
      if (!context) throw new Error('浏览器可用内存不足，无法处理图片。');
      context.drawImage(image, 0, 0);
      const bytes = await (
        await canvasBlob(canvas, jpeg ? 'image/jpeg' : 'image/png', 0.96)
      ).arrayBuffer();
      return jpeg ? await doc.embedJpg(bytes) : await doc.embedPng(bytes);
    } finally {
      canvas.width = canvas.height = 0;
    }
  } finally {
    image.close();
  }
}

export function ImagesToPdfTool() {
  const [files, setFiles] = useState<File[]>([]);
  const [size, setSize] = useState('a4');
  const [orientation, setOrientation] = useState('portrait');
  const [margin, setMargin] = useState(24);
  const [result, setResult] = useState<Blob | null>(null);
  const task = useToolTask('images-to-pdf');
  const cancel = useRef(false);
  const change = (next: File[]) => {
    setFiles(next);
    setResult(null);
    task.setError('');
  };
  return (
    <div className="tool-form">
      <FileDropzone
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        multiple
        disabled={task.busy}
        onFiles={(next) => change([...files, ...next])}
        hint="JPG / PNG / WebP；最多 50 张，每张 20 MB，总计 100 MB"
      />
      <FileListEditor files={files} onChange={change} disabled={task.busy} />
      <div className="controls-grid">
        <Field label="页面尺寸">
          <select
            disabled={task.busy}
            value={size}
            onChange={(e) => {
              setSize(e.target.value);
              setResult(null);
            }}
          >
            <option value="a4">A4</option>
            <option value="letter">Letter</option>
            <option value="original">按图片比例</option>
          </select>
        </Field>
        <Field label="页面方向">
          <select
            disabled={task.busy}
            value={orientation}
            onChange={(e) => {
              setOrientation(e.target.value);
              setResult(null);
            }}
          >
            <option value="portrait">纵向</option>
            <option value="landscape">横向</option>
            <option value="auto">随图片方向</option>
          </select>
        </Field>
        <Field label="页边距（pt）" hint="72 pt = 1 英寸">
          <input
            type="number"
            min={0}
            max={72}
            step={1}
            disabled={task.busy}
            value={margin}
            onChange={(e) => {
              setMargin(Number(e.target.value));
              setResult(null);
            }}
          />
        </Field>
      </div>
      <Notice>
        图片按比例居中放入页面，不裁剪内容。JPG 与 PNG
        尽量保留原始编码；带旋转信息的手机照片会先校正方向，WebP 转为 PNG 后嵌入。
      </Notice>
      <div className="button-row">
        <ActionButton
          busy={task.busy}
          disabled={!files.length}
          onClick={() =>
            task.run(async () => {
              cancel.current = false;
              setResult(null);
              if (files.length > 50) throw new Error('一次最多合成 50 张图片，请分批处理。');
              if (!Number.isFinite(margin) || margin < 0 || margin > 72)
                throw new Error('页边距请输入 0 到 72 之间的数值。');
              if (files.reduce((sum, file) => sum + file.size, 0) > MAX_BATCH_BYTES)
                throw new Error('图片总大小超过 100 MB，请减少文件或先压缩图片。');
              const doc = await PDFDocument.create();
              for (const [i, file] of files.entries()) {
                ensureActive(cancel);
                const image = await embedImage(doc, file);
                let dimensions: [number, number] =
                  size === 'a4'
                    ? [...PageSizes.A4]
                    : size === 'letter'
                      ? [...PageSizes.Letter]
                      : [image.width * 0.75 + margin * 2, image.height * 0.75 + margin * 2];
                const landscape =
                  orientation === 'landscape' ||
                  (orientation === 'auto' && image.width > image.height);
                dimensions = landscape
                  ? [Math.max(...dimensions), Math.min(...dimensions)]
                  : [Math.min(...dimensions), Math.max(...dimensions)];
                const page = doc.addPage(dimensions);
                page.drawImage(
                  image,
                  fitImageOnPage(image.width, image.height, dimensions[0], dimensions[1], margin),
                );
                task.setProgress(((i + 1) / files.length) * 90);
                await nextFrame();
              }
              ensureActive(cancel);
              setResult(await savePdf(doc));
            })
          }
        >
          生成 PDF
        </ActionButton>
        <Cancellation
          busy={task.busy}
          onCancel={() => {
            cancel.current = true;
          }}
        />
        <button className="button button-ghost" disabled={task.busy} onClick={() => change([])}>
          清空
        </button>
      </div>
      {task.busy && <Progress value={task.progress} label="正在生成 PDF" />}
      <ErrorNotice error={task.error} />
      {result && (
        <ResultBox>
          <p>
            已生成 {files.length} 页 PDF · {formatBytes(result.size)}
          </p>
          <DownloadButton blob={result} name="轻匣-图片合成.pdf" />
        </ResultBox>
      )}
    </div>
  );
}

export function PdfCompressTool() {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState('preserve');
  const [strength, setStrength] = useState('balanced');
  const [consent, setConsent] = useState(false);
  const [result, setResult] = useState<{
    blob: Blob;
    original: number;
    keptOriginal: boolean;
    pages: number;
  } | null>(null);
  const task = useToolTask('pdf-compress');
  const cancel = useRef(false);
  const reset = (next: File | null) => {
    setFile(next);
    setResult(null);
    task.setError('');
  };
  return (
    <div className="tool-form">
      <SinglePdf file={file} setFile={reset} busy={task.busy} />
      <div className="controls-grid">
        <Field label="压缩方式">
          <select
            disabled={task.busy}
            value={mode}
            onChange={(e) => {
              setMode(e.target.value);
              setConsent(false);
              setResult(null);
            }}
          >
            <option value="preserve">结构优化 · 保留页面文字</option>
            <option value="raster">图片化压缩 · 有损</option>
          </select>
        </Field>
        {mode === 'raster' && (
          <Field label="压缩强度">
            <select
              disabled={task.busy}
              value={strength}
              onChange={(e) => {
                setStrength(e.target.value);
                setResult(null);
              }}
            >
              <option value="clear">轻度 · 150 DPI / 高画质</option>
              <option value="balanced">均衡 · 110 DPI / 标准画质</option>
              <option value="small">强力 · 72 DPI / 较小体积</option>
            </select>
          </Field>
        )}
      </div>
      {mode === 'preserve' ? (
        <Notice>
          默认优化 PDF 对象结构，保留页面中的文字和矢量内容，不会主动把页面变成图片。已优化过的 PDF
          可能无法继续缩小；若结果更大，会保留原文件。
        </Notice>
      ) : (
        <>
          <Notice tone="warning">
            图片化压缩会把每页转成
            JPG：文字将无法复制或搜索，链接、表单、书签及矢量清晰度可能丢失。此模式仅适合你接受这些损失的副本，最多{' '}
            {mobileDevice() ? 40 : 100} 页。
          </Notice>
          <label className="checkbox-row">
            <input
              type="checkbox"
              disabled={task.busy}
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            我已了解图片化的损失，并保留原文件
          </label>
        </>
      )}
      <PdfCaution />
      <div className="button-row">
        <ActionButton
          busy={task.busy}
          disabled={!file || (mode === 'raster' && !consent)}
          onClick={() =>
            task.run(async () => {
              if (!file) return;
              cancel.current = false;
              setResult(null);
              let blob: Blob;
              let pageCount: number;
              if (mode === 'preserve') {
                const doc = await readPdf(file);
                pageCount = doc.getPageCount();
                task.setProgress(50);
                await nextFrame();
                ensureActive(cancel);
                blob = await savePdf(doc);
              } else {
                if (!consent) throw new Error('请先确认你已了解图片化压缩的损失。');
                const doc = await renderDocument(file);
                try {
                  pageCount = doc.numPages;
                  const limit = mobileDevice() ? 40 : 100;
                  if (pageCount > limit)
                    throw new Error(`图片化压缩一次最多 ${limit} 页，请先拆分文档。`);
                  const output = await PDFDocument.create();
                  const dpi = strength === 'clear' ? 150 : strength === 'small' ? 72 : 110;
                  const quality = strength === 'clear' ? 0.85 : strength === 'small' ? 0.5 : 0.68;
                  let total = 0;
                  for (let i = 0; i < pageCount; i++) {
                    ensureActive(cancel);
                    const sourcePage = await doc.getPage(i + 1);
                    const viewport = sourcePage.getViewport({ scale: 1 });
                    const rendered = await renderPage(doc, i, dpi, 'image/jpeg', quality);
                    total += rendered.size;
                    if (total > MAX_BATCH_BYTES)
                      throw new Error('处理结果已超过 100 MB，请降低清晰度或拆分文档。');
                    const image = await output.embedJpg(await rendered.arrayBuffer());
                    const page = output.addPage([viewport.width, viewport.height]);
                    page.drawImage(image, {
                      x: 0,
                      y: 0,
                      width: viewport.width,
                      height: viewport.height,
                    });
                    task.setProgress(((i + 1) / pageCount) * 90);
                    await nextFrame();
                  }
                  ensureActive(cancel);
                  blob = await savePdf(output);
                } finally {
                  await doc.destroy();
                }
              }
              ensureActive(cancel);
              const keptOriginal = blob.size >= file.size;
              setResult({
                blob: keptOriginal ? file : blob,
                original: file.size,
                keptOriginal,
                pages: pageCount,
              });
            })
          }
        >
          压缩 PDF
        </ActionButton>
        <Cancellation
          busy={task.busy}
          onCancel={() => {
            cancel.current = true;
          }}
        />
        <button className="button button-ghost" disabled={task.busy} onClick={() => reset(null)}>
          清空
        </button>
      </div>
      {task.busy && <Progress value={task.progress} label="正在优化 PDF" />}
      <ErrorNotice error={task.error} />
      {result && (
        <ResultBox>
          <div className="stat-pair">
            <div>
              <small>原始大小</small>
              <strong>{formatBytes(result.original)}</strong>
            </div>
            <div>
              <small>结果大小</small>
              <strong>{formatBytes(result.blob.size)}</strong>
            </div>
            <div>
              <small>减少体积</small>
              <strong>
                {Math.max(0, (1 - result.blob.size / result.original) * 100).toFixed(1)}%
              </strong>
            </div>
          </div>
          <p>
            {result.pages} 页 ·{' '}
            {result.keptOriginal
              ? '没有得到更小的文件，已保留原件，不做无效压缩。'
              : mode === 'raster'
                ? '已完成图片化有损压缩，请检查页面清晰度。'
                : '已完成结构优化，页面文字未被图片化。'}
          </p>
          <DownloadButton
            blob={result.blob}
            name={`${baseName(file!.name)}-${result.keptOriginal ? '保留原件' : '已压缩'}.pdf`}
          />
        </ResultBox>
      )}
    </div>
  );
}
