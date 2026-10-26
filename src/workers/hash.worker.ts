import { createMD5, createSHA1, createSHA256 } from 'hash-wasm';

type Algorithm = 'md5' | 'sha1' | 'sha256';
self.onmessage = async (event: MessageEvent<{ file: File; algorithm: Algorithm }>) => {
  try {
    const { file, algorithm } = event.data;
    const hasher = await (algorithm === 'md5'
      ? createMD5()
      : algorithm === 'sha1'
        ? createSHA1()
        : createSHA256());
    hasher.init();
    const chunkSize = 2 * 1024 * 1024;
    for (let offset = 0; offset < file.size; offset += chunkSize) {
      const chunk = new Uint8Array(await file.slice(offset, offset + chunkSize).arrayBuffer());
      hasher.update(chunk);
      self.postMessage({
        type: 'progress',
        value: Math.min(100, ((offset + chunk.byteLength) / file.size) * 100),
      });
    }
    self.postMessage({ type: 'result', digest: hasher.digest('hex') });
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : '文件读取或哈希计算失败。',
    });
  }
};
