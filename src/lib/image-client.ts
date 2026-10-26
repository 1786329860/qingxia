import { transformImage, type ImageOptions, type ProcessedImage } from './image-process';

export function createImageProcessor() {
  let worker: Worker | null = null;
  let nextId = 0;
  let activeReject: ((reason: Error) => void) | null = null;
  let disposed = false;
  let activeTimeout: ReturnType<typeof setTimeout> | null = null;
  const clearActiveTimeout = () => {
    if (activeTimeout) clearTimeout(activeTimeout);
    activeTimeout = null;
  };
  const canWorker =
    typeof Worker !== 'undefined' &&
    typeof OffscreenCanvas !== 'undefined' &&
    typeof createImageBitmap === 'function';
  return {
    async process(file: File, options: ImageOptions): Promise<ProcessedImage> {
      if (disposed) throw new Error('已取消处理。');
      if (!canWorker) return transformImage(file, options);
      if (!worker)
        worker = new Worker(new URL('./image-worker.ts', import.meta.url), { type: 'module' });
      const id = ++nextId;
      return new Promise((resolve, reject) => {
        activeReject = reject;
        const timeout = (activeTimeout = setTimeout(() => {
          worker?.terminate();
          worker = null;
          activeReject = null;
          reject(new Error('图片处理超过两分钟，请降低尺寸后重试。'));
        }, 120000));
        worker!.onmessage = (
          event: MessageEvent<{ id: number; result?: ProcessedImage; error?: string }>,
        ) => {
          if (event.data.id !== id) return;
          clearTimeout(timeout);
          activeReject = null;
          if (event.data.result) resolve(event.data.result);
          else reject(new Error(event.data.error || '图片处理失败。'));
        };
        worker!.onerror = () => {
          clearTimeout(timeout);
          worker?.terminate();
          worker = null;
          activeReject = null;
          reject(new Error('图像处理线程启动失败，请刷新页面或使用较新的浏览器。'));
        };
        worker!.postMessage({ id, file, options });
      });
    },
    cancel() {
      disposed = true;
      clearActiveTimeout();
      worker?.terminate();
      worker = null;
      activeReject?.(new Error('已取消，已完成的结果仍可下载。'));
      activeReject = null;
    },
    dispose() {
      disposed = true;
      clearActiveTimeout();
      worker?.terminate();
      worker = null;
      activeReject?.(new Error('处理已结束。'));
      activeReject = null;
    },
  };
}
