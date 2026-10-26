import { transformImage, type ImageOptions } from './image-process';
const scope = self as unknown as {
  onmessage:
    ((event: MessageEvent<{ id: number; file: File; options: ImageOptions }>) => void) | null;
  postMessage: (data: unknown) => void;
};
scope.onmessage = async (event) => {
  try {
    scope.postMessage({
      id: event.data.id,
      result: await transformImage(event.data.file, event.data.options),
    });
  } catch (error) {
    scope.postMessage({
      id: event.data.id,
      error: error instanceof Error ? error.message : '图像处理失败。',
    });
  }
};
