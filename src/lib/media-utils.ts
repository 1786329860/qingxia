export function makeFrameTimes(
  start: number,
  end: number,
  interval: number,
  duration: number,
  maxFrames = 300,
): number[] {
  if (![start, end, interval, duration].every(Number.isFinite) || duration <= 0)
    throw new Error('视频时长或时间参数无效。');
  if (start < 0 || end <= start || end > duration + 0.05)
    throw new Error('请设置有效起止时间：开始需小于结束，结束不能超过视频时长。');
  if (interval < 0.1) throw new Error('抽帧间隔至少为 0.1 秒。');
  const count = Math.ceil((end - start) / interval - 1e-9);
  if (count > maxFrames)
    throw new Error(`本次预计生成 ${count} 帧，超过 ${maxFrames} 帧限制，请缩短时间或增大间隔。`);
  return Array.from({ length: count }, (_, i) =>
    Math.min(start + i * interval, Math.max(0, duration - 0.04)),
  );
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return '--:--';
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0')}`;
}

export function mediaAbortError() {
  return new Error('处理已取消，临时资源已释放。');
}
export function assertNotAborted(signal: AbortSignal) {
  if (signal.aborted) throw mediaAbortError();
}

export async function loadVideo(
  file: File,
  signal: AbortSignal,
): Promise<{ video: HTMLVideoElement; close: () => void }> {
  assertNotAborted(signal);
  const video = document.createElement('video');
  const url = URL.createObjectURL(file);
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  const close = () => {
    video.pause();
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  };
  try {
    await new Promise<void>((resolve, reject) => {
      const clean = () => {
        clearTimeout(timer);
        video.removeEventListener('loadedmetadata', ready);
        video.removeEventListener('error', failed);
        signal.removeEventListener('abort', aborted);
      };
      const ready = () => {
        clean();
        resolve();
      };
      const failed = () => {
        clean();
        reject(new Error('浏览器无法读取此视频。请尝试 H.264 编码的 MP4 或受支持的 WebM。'));
      };
      const aborted = () => {
        clean();
        reject(mediaAbortError());
      };
      const timer = setTimeout(() => {
        clean();
        reject(new Error('读取视频超时，请换用较小文件或桌面浏览器。'));
      }, 20000);
      video.addEventListener('loadedmetadata', ready, { once: true });
      video.addEventListener('error', failed, { once: true });
      signal.addEventListener('abort', aborted, { once: true });
      video.src = url;
      video.load();
    });
    if (
      !Number.isFinite(video.duration) ||
      video.duration <= 0 ||
      !video.videoWidth ||
      !video.videoHeight
    )
      throw new Error('无法确定视频时长或画面尺寸，当前文件可能不含可解码的视频。');
    return { video, close };
  } catch (error) {
    close();
    throw error;
  }
}

export async function seekVideo(
  video: HTMLVideoElement,
  time: number,
  signal: AbortSignal,
): Promise<void> {
  assertNotAborted(signal);
  const target = Math.min(Math.max(0, time), Math.max(0, video.duration - 0.04));
  if (
    Math.abs(video.currentTime - target) < 0.001 &&
    video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
  )
    return;
  await new Promise<void>((resolve, reject) => {
    const clean = () => {
      clearTimeout(timer);
      video.removeEventListener('seeked', ready);
      video.removeEventListener('loadeddata', firstFrame);
      video.removeEventListener('error', failed);
      signal.removeEventListener('abort', aborted);
    };
    const ready = () => {
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        clean();
        resolve();
      }
    };
    const firstFrame = () => {
      if (!video.seeking) ready();
    };
    const failed = () => {
      clean();
      reject(new Error(`无法读取 ${target.toFixed(2)} 秒处的画面，请尝试其他时间点。`));
    };
    const aborted = () => {
      clean();
      reject(mediaAbortError());
    };
    const timer = setTimeout(() => {
      clean();
      reject(new Error('视频定位超时，可能是浏览器不支持此编码。'));
    }, 20000);
    video.addEventListener('seeked', ready);
    video.addEventListener('loadeddata', firstFrame);
    video.addEventListener('error', failed, { once: true });
    signal.addEventListener('abort', aborted, { once: true });
    video.currentTime = target;
  });
}

export async function canvasBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  if (!blob) throw new Error('画面编码失败，设备可能内存不足。');
  if (blob.type !== type) throw new Error('当前浏览器不支持所选输出格式，请选择 PNG 或 JPG。');
  return blob;
}
