import { prepareAvifEncoder, transformImage, type ImageProgressStage } from './image-process';
import type { ImageWorkerReply, ImageWorkerRequest } from './image-client';
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<ImageWorkerRequest>) => void) | null;
  postMessage: (data: ImageWorkerReply) => void;
};
scope.onmessage = async (event) => {
  const request = event.data;
  const started = performance.now();
  const progress = (stage: ImageProgressStage) =>
    scope.postMessage({ id: request.id, stage, elapsedMs: performance.now() - started });
  try {
    if (request.type === 'prepare-avif') {
      progress('loading-codec');
      await prepareAvifEncoder();
      scope.postMessage({ id: request.id, ready: true, elapsedMs: performance.now() - started });
    } else {
      const result = await transformImage(request.file, request.options, progress);
      scope.postMessage({ id: request.id, result, elapsedMs: performance.now() - started });
    }
  } catch (error) {
    scope.postMessage({
      id: request.id,
      error: error instanceof Error ? error.message : '图像处理失败。',
    });
  }
};
