import { checkFileSize } from './files';

export type ImageFormat = 'jpeg' | 'png' | 'webp' | 'avif';
export type ImageOutput = ImageFormat | 'original';
export interface ImageOptions {
  format: ImageOutput;
  quality: number;
  maxWidth: number;
  maxHeight: number;
  maxPixels: number;
  keepSmaller: boolean;
  background: string;
}
export interface ProcessedImage {
  blob: Blob;
  width: number;
  height: number;
  format: ImageFormat;
  keptOriginal: boolean;
  warning?: string;
}

export const IMAGE_EXTENSIONS = { jpeg: 'jpg', png: 'png', webp: 'webp', avif: 'avif' } as const;
export const IMAGE_MIMES = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
} as const;

export function detectImageFormat(file: File): ImageFormat | null {
  const mime = file.type.toLowerCase();
  if (mime === 'image/jpeg' || /\.jpe?g$/i.test(file.name)) return 'jpeg';
  if (mime === 'image/png' || /\.png$/i.test(file.name)) return 'png';
  if (mime === 'image/webp' || /\.webp$/i.test(file.name)) return 'webp';
  if (mime === 'image/avif' || /\.avif$/i.test(file.name)) return 'avif';
  return null;
}

export function imageDimensions(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
) {
  const scale = Math.min(
    1,
    maxWidth > 0 ? maxWidth / width : 1,
    maxHeight > 0 ? maxHeight / height : 1,
  );
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function detectSignature(file: File): Promise<ImageFormat | null> {
  const bytes = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
    return 'png';
  const ascii = new TextDecoder('ascii').decode(bytes);
  if (ascii.slice(0, 4) === 'RIFF' && ascii.slice(8, 12) === 'WEBP') return 'webp';
  if (ascii.slice(4, 8) === 'ftyp' && /avif|avis/.test(ascii.slice(8))) return 'avif';
  return null;
}

/** Reject common oversized images from their headers before allocating decoded pixels. */
async function headerDimensions(
  file: File,
  format: ImageFormat,
): Promise<{ width: number; height: number } | null> {
  const bytes = new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer());
  const view = new DataView(bytes.buffer);
  if (format === 'png' && bytes.length >= 24)
    return { width: view.getUint32(16), height: view.getUint32(20) };
  if (format === 'jpeg') {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset++] !== 0xff) continue;
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) break;
      const size = view.getUint16(offset);
      if (size < 2) break;
      if (
        [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
          marker,
        ) &&
        offset + 7 <= bytes.length
      )
        return { width: view.getUint16(offset + 5), height: view.getUint16(offset + 3) };
      offset += size;
    }
  }
  if (format === 'webp' && bytes.length >= 30) {
    const kind = new TextDecoder('ascii').decode(bytes.slice(12, 16));
    if (kind === 'VP8X')
      return {
        width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16),
        height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16),
      };
    if (kind === 'VP8 ')
      return {
        width: view.getUint16(26, true) & 0x3fff,
        height: view.getUint16(28, true) & 0x3fff,
      };
    if (kind === 'VP8L' && bytes[20] === 0x2f)
      return {
        width: 1 + ((bytes[21] | (bytes[22] << 8)) & 0x3fff),
        height: 1 + (((bytes[22] >> 6) | (bytes[23] << 2) | (bytes[24] << 10)) & 0x3fff),
      };
  }
  if (format === 'avif') {
    let largest: { width: number; height: number } | null = null;
    const boxes = (start: number, end: number, depth: number) => {
      if (depth > 8) return;
      for (let offset = start; offset + 8 <= end;) {
        const size = view.getUint32(offset);
        if (size < 8 || offset + size > end) break;
        const kind = new TextDecoder('ascii').decode(bytes.slice(offset + 4, offset + 8));
        if (kind === 'ispe' && size >= 20) {
          const candidate = {
            width: view.getUint32(offset + 12),
            height: view.getUint32(offset + 16),
          };
          if (!largest || candidate.width * candidate.height > largest.width * largest.height)
            largest = candidate;
        } else if (kind === 'meta') boxes(offset + 12, offset + size, depth + 1);
        else if (kind === 'iprp' || kind === 'ipco') boxes(offset + 8, offset + size, depth + 1);
        offset += size;
      }
    };
    boxes(0, bytes.length, 0);
    return largest;
  }
  return null;
}

function checkPixels(width: number, height: number, limit: number) {
  if (!width || !height) throw new Error('图片尺寸无效。');
  if (width * height > limit)
    throw new Error(
      `图片为 ${((width * height) / 1e6).toFixed(1)} 百万像素，超过此设备 ${Math.round(limit / 1e6)} 百万像素的处理限制，请选择较小图片。`,
    );
}

async function loadAvifDecoder() {
  const [{ default: factory }, { default: wasmUrl }] = await Promise.all([
    import('@jsquash/avif/codec/dec/avif_dec.js'),
    import('@jsquash/avif/codec/dec/avif_dec.wasm?url'),
  ]);
  return factory({ locateFile: () => wasmUrl, noInitialRun: true });
}
let avifDecoder: ReturnType<typeof loadAvifDecoder> | undefined;
async function decodeAvif(file: File): Promise<ImageData> {
  const module = await (avifDecoder ??= loadAvifDecoder());
  const image = module.decode(await file.arrayBuffer(), 8);
  if (!image) throw new Error('AVIF 图片无法解码，文件可能已损坏或使用了不支持的编码。');
  return image;
}

async function decodeImage(
  file: File,
  format: ImageFormat,
): Promise<ImageBitmap | ImageData | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      /* A local AVIF decoder or DOM image decoder can still work. */
    }
  }
  if (format === 'avif') return decodeAvif(file);
  if (typeof document !== 'undefined') {
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      return image;
    } catch {
      throw new Error('图片无法读取，请确认文件未损坏，且为 JPG、PNG 或 WebP。');
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  throw new Error('浏览器无法解码此图片，请确认文件格式，或使用较新的桌面浏览器。');
}

async function canvasBlob(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type, quality });
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error('图片导出失败，可能超过浏览器的内存限制。')),
      type,
      quality,
    ),
  );
}

async function loadAvifEncoder() {
  const [{ default: factory }, { default: wasmUrl }, { defaultOptions }] = await Promise.all([
    import('@jsquash/avif/codec/enc/avif_enc.js'),
    import('@jsquash/avif/codec/enc/avif_enc.wasm?url'),
    import('@jsquash/avif/meta.js'),
  ]);
  return {
    module: await factory({ locateFile: () => wasmUrl, noInitialRun: true }),
    defaultOptions,
  };
}
let avifEncoder: ReturnType<typeof loadAvifEncoder> | undefined;
async function encodeAvif(data: ImageData, quality: number): Promise<Blob> {
  const { module, defaultOptions } = await (avifEncoder ??= loadAvifEncoder());
  const result = module.encode(new Uint8Array(data.data.buffer), data.width, data.height, {
    ...defaultOptions,
    quality: Math.round(quality * 100),
    qualityAlpha: -1,
    speed: 8,
  });
  if (!result) throw new Error('AVIF 导出失败，请降低图片尺寸后重试。');
  return new Blob([result.slice()], { type: 'image/avif' });
}

/** Called in a dedicated worker when possible; never sends image data over the network. */
export async function transformImage(file: File, options: ImageOptions): Promise<ProcessedImage> {
  checkFileSize(file, 40);
  const sourceFormat = await detectSignature(file);
  if (!sourceFormat) throw new Error('格式不支持，请选择 JPG、PNG、WebP 或 AVIF 图片。');
  const headerSize = await headerDimensions(file, sourceFormat);
  if (headerSize) checkPixels(headerSize.width, headerSize.height, options.maxPixels);
  const format = options.format === 'original' ? sourceFormat : options.format;
  const decoded = await decodeImage(file, sourceFormat);
  try {
    const sourceWidth = decoded.width;
    const sourceHeight = decoded.height;
    checkPixels(sourceWidth, sourceHeight, options.maxPixels);
    const { width, height } = imageDimensions(
      sourceWidth,
      sourceHeight,
      options.maxWidth,
      options.maxHeight,
    );
    let canvas: OffscreenCanvas | HTMLCanvasElement;
    if (typeof OffscreenCanvas !== 'undefined') canvas = new OffscreenCanvas(width, height);
    else {
      canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
    }
    const ctx = canvas.getContext('2d') as
      OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
    if (!ctx) throw new Error('浏览器无法创建图像画布，请尝试更新浏览器。');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (format === 'jpeg') {
      ctx.fillStyle = options.background;
      ctx.fillRect(0, 0, width, height);
    }
    if ('data' in decoded) {
      let sourceCanvas: OffscreenCanvas | HTMLCanvasElement;
      if (typeof OffscreenCanvas !== 'undefined')
        sourceCanvas = new OffscreenCanvas(sourceWidth, sourceHeight);
      else {
        sourceCanvas = document.createElement('canvas');
        sourceCanvas.width = sourceWidth;
        sourceCanvas.height = sourceHeight;
      }
      const sourceCtx = sourceCanvas.getContext('2d') as
        OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
      if (!sourceCtx) throw new Error('无法读取 AVIF 像素。');
      sourceCtx.putImageData(decoded, 0, 0);
      ctx.drawImage(sourceCanvas, 0, 0, width, height);
      sourceCanvas.width = 1;
      sourceCanvas.height = 1;
    } else ctx.drawImage(decoded, 0, 0, width, height);
    let blob = await canvasBlob(canvas, IMAGE_MIMES[format], options.quality);
    if (blob.type !== IMAGE_MIMES[format]) {
      if (format === 'avif')
        blob = await encodeAvif(ctx.getImageData(0, 0, width, height), options.quality);
      else
        throw new Error(
          `当前浏览器不支持导出 ${format.toUpperCase()}，请换用较新的 Chrome、Edge 或 Safari。`,
        );
    }
    canvas.width = 1;
    canvas.height = 1;
    const keptOriginal =
      options.keepSmaller &&
      format === sourceFormat &&
      sourceWidth === width &&
      sourceHeight === height &&
      blob.size >= file.size;
    const warnings = [
      keptOriginal
        ? '这张图片已经较紧凑，保留原文件及原有元数据，避免压缩后变大。'
        : blob.size >= file.size
          ? '所选格式或参数产生了更大的文件；可降低画质、缩小尺寸或改用其他格式。'
          : '',
      sourceFormat === 'avif' || sourceFormat === 'webp'
        ? '按静态图片处理；动态图片仅导出解码器返回的首帧。'
        : '',
    ].filter(Boolean);
    return {
      blob: keptOriginal ? file : blob,
      width,
      height,
      format,
      keptOriginal,
      warning: warnings.join(' ') || undefined,
    };
  } finally {
    if ('close' in decoded) decoded.close();
  }
}
