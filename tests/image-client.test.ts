import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createImageProcessor, type ImageWorkerReply } from '../src/lib/image-client';
import type { ImageOptions } from '../src/lib/image-process';

const fallback = vi.hoisted(() => ({ prepareAvifEncoder: vi.fn(), transformImage: vi.fn() }));
vi.mock('../src/lib/image-process', () => fallback);
class WorkerStub {
  static instances: WorkerStub[] = [];
  onmessage: ((event: MessageEvent<ImageWorkerReply>) => void) | null = null;
  onerror: (() => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() {
    WorkerStub.instances.push(this);
  }
  reply(reply: ImageWorkerReply) {
    this.onmessage?.({ data: reply } as MessageEvent<ImageWorkerReply>);
  }
}
const options: ImageOptions = {
  format: 'avif',
  quality: 0.8,
  maxWidth: 0,
  maxHeight: 0,
  maxPixels: 32e6,
  keepSmaller: false,
  background: '#ffffff',
};
const result = {
  blob: new Blob(['test']),
  width: 1,
  height: 1,
  format: 'avif' as const,
  keptOriginal: false,
};
beforeEach(() => {
  WorkerStub.instances = [];
  vi.stubGlobal('Worker', WorkerStub);
  vi.stubGlobal('OffscreenCanvas', class {});
  vi.stubGlobal('createImageBitmap', vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('image worker lifetime', () => {
  it('shares one worker between preparation and repeated conversions', async () => {
    const processor = createImageProcessor();
    const prepared = processor.prepareAvif();
    const worker = WorkerStub.instances[0];
    const firstMessage = worker.postMessage.mock.calls[0][0];
    expect(firstMessage).toEqual({ id: 1, type: 'prepare-avif' });
    expect(Object.keys(firstMessage)).toEqual(['type', 'id']);
    worker.reply({ id: 1, ready: true });
    await prepared;
    for (const id of [2, 3]) {
      const converted = processor.process(new File(['input'], 'private.png'), options);
      worker.reply({ id, result });
      await expect(converted).resolves.toEqual(result);
    }
    expect(WorkerStub.instances).toHaveLength(1);
    expect(worker.terminate).not.toHaveBeenCalled();
    processor.dispose();
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
  it('progress messages do not prematurely finish a conversion', async () => {
    const processor = createImageProcessor();
    const progress = vi.fn();
    const converted = processor.process(new File(['input'], 'private.png'), options, progress);
    const worker = WorkerStub.instances[0];
    worker.reply({ id: 1, stage: 'loading-codec', elapsedMs: 10 });
    worker.reply({ id: 1, stage: 'encoding', elapsedMs: 20 });
    expect(progress.mock.calls.map(([stage]) => stage)).toEqual(['loading-codec', 'encoding']);
    worker.reply({ id: 1, result });
    await expect(converted).resolves.toEqual(result);
    processor.dispose();
  });
  it('cancel rejects pending preparation and processing and releases the worker', async () => {
    const processor = createImageProcessor();
    const prepared = processor.prepareAvif();
    const converted = processor.process(new File(['input'], 'private.png'), options);
    const expectedPrepare = expect(prepared).rejects.toThrow('已取消');
    const expectedProcess = expect(converted).rejects.toThrow('已取消');
    processor.cancel();
    await Promise.all([expectedPrepare, expectedProcess]);
    expect(WorkerStub.instances[0].terminate).toHaveBeenCalledOnce();
    await expect(processor.prepareAvif()).rejects.toThrow('已取消');
  });
  it('a failed preparation can be retried without refreshing the page', async () => {
    const processor = createImageProcessor();
    const first = processor.prepareAvif();
    WorkerStub.instances[0].reply({ id: 1, error: 'AVIF 加载失败' });
    await expect(first).rejects.toThrow('加载失败');
    const second = processor.prepareAvif();
    WorkerStub.instances[0].reply({ id: 2, ready: true });
    await expect(second).resolves.toBeUndefined();
    expect(WorkerStub.instances).toHaveLength(1);
    processor.dispose();
  });
  it('uses the same optional preparation in browsers without worker canvas support', async () => {
    vi.stubGlobal('OffscreenCanvas', undefined);
    fallback.prepareAvifEncoder.mockResolvedValue({});
    fallback.transformImage.mockResolvedValue(result);
    const processor = createImageProcessor();
    await processor.prepareAvif();
    await expect(processor.process(new File(['input'], 'private.png'), options)).resolves.toEqual(
      result,
    );
    expect(WorkerStub.instances).toHaveLength(0);
    expect(fallback.prepareAvifEncoder).toHaveBeenCalledOnce();
    processor.dispose();
  });
});
