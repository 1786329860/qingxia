import {
  prepareAvifEncoder,
  transformImage,
  type ImageOptions,
  type ImageProgressStage,
  type ProcessedImage,
} from './image-process';

export type ImageWorkerRequest =
  | { id: number; type: 'prepare-avif' }
  | { id: number; type: 'process'; file: File; options: ImageOptions };
export interface ImageWorkerReply {
  id: number;
  result?: ProcessedImage;
  ready?: boolean;
  error?: string;
  stage?: ImageProgressStage;
  elapsedMs?: number;
}

type Work = { type: 'prepare-avif' } | { type: 'process'; file: File; options: ImageOptions };
export function createImageProcessor() {
  let worker: Worker | null = null;
  let nextId = 0;
  let disposed = false;
  const pending = new Map<
    number,
    {
      resolve: (reply: ImageWorkerReply) => void;
      reject: (reason: Error) => void;
      timer: ReturnType<typeof setTimeout>;
      onProgress?: (stage: ImageProgressStage) => void;
    }
  >();
  const canWorker =
    typeof Worker !== 'undefined' &&
    typeof OffscreenCanvas !== 'undefined' &&
    typeof createImageBitmap === 'function';

  const stopWorker = (reason: Error) => {
    worker?.terminate();
    worker = null;
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(reason);
    }
    pending.clear();
  };
  const request = (
    message: Work,
    onProgress?: (stage: ImageProgressStage) => void,
  ): Promise<ImageWorkerReply> => {
    if (disposed) return Promise.reject(new Error('已取消处理。'));
    if (!worker) {
      worker = new Worker(new URL('./image-worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (event: MessageEvent<ImageWorkerReply>) => {
        const reply = event.data;
        const active = pending.get(reply.id);
        if (!active) return;
        if (reply.stage) {
          active.onProgress?.(reply.stage);
          return;
        }
        clearTimeout(active.timer);
        pending.delete(reply.id);
        if (reply.error) active.reject(new Error(reply.error));
        else active.resolve(reply);
      };
      worker.onerror = () =>
        stopWorker(new Error('图像处理线程启动失败，请重试或使用较新的浏览器。'));
    }
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        stopWorker(new Error('图片处理超过两分钟，请降低尺寸后重试。'));
      }, 120000);
      pending.set(id, { resolve, reject, timer, onProgress });
      try {
        worker!.postMessage({ ...message, id });
      } catch {
        stopWorker(new Error('图片无法传入处理线程，请重新选择文件后重试。'));
      }
    });
  };
  return {
    async prepareAvif(): Promise<void> {
      if (disposed) throw new Error('已取消处理。');
      if (!canWorker) {
        await prepareAvifEncoder();
        return;
      }
      const reply = await request({ type: 'prepare-avif' });
      if (!reply.ready) throw new Error('AVIF 准备失败，请重试。');
    },
    async process(
      file: File,
      options: ImageOptions,
      onProgress?: (stage: ImageProgressStage) => void,
    ): Promise<ProcessedImage> {
      if (disposed) throw new Error('已取消处理。');
      if (!canWorker) return transformImage(file, options, onProgress);
      const reply = await request({ type: 'process', file, options }, onProgress);
      if (!reply.result) throw new Error('图片处理失败。');
      return reply.result;
    },
    cancel() {
      disposed = true;
      stopWorker(new Error('已取消，已完成的结果仍可下载。'));
    },
    dispose() {
      disposed = true;
      stopWorker(new Error('处理已结束。'));
    },
  };
}
