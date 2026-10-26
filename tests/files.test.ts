import { describe, it, expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { createZipBlob } from '../src/lib/files';
describe('批量下载不丢文件', () => {
  it('连续重复名和已有前缀文件都保留', async () => {
    const files = [
      { name: 'a.txt', blob: new Blob(['first']) },
      { name: '2-a.txt', blob: new Blob(['second']) },
      { name: 'a.txt', blob: new Blob(['third']) },
      { name: 'a.txt', blob: new Blob(['fourth']) },
    ];
    const zip = unzipSync(new Uint8Array(await (await createZipBlob(files)).arrayBuffer()));
    expect(Object.keys(zip)).toHaveLength(4);
    expect(
      Object.values(zip)
        .map((value) => strFromU8(value))
        .sort(),
    ).toEqual(['first', 'fourth', 'second', 'third']);
  });
  it('下载包不含路径穿越条目', async () => {
    const zip = unzipSync(
      new Uint8Array(
        await (
          await createZipBlob([{ name: '../../bad.txt', blob: new Blob(['safe']) }])
        ).arrayBuffer(),
      ),
    );
    expect(Object.keys(zip)[0]).not.toContain('/');
  });
});
