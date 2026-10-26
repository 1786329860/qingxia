/** Parse human page numbers into zero-based page indices; reject typos instead of silently omitting pages. */
export function parsePageRanges(input: string, pageCount: number): number[] {
  if (!Number.isSafeInteger(pageCount) || pageCount < 1)
    throw new Error('PDF 中没有可处理的页面。');
  const value = input.trim();
  if (!value || value === '全部') return Array.from({ length: pageCount }, (_, i) => i);
  const indices = new Set<number>();
  for (const raw of value.replace(/，/g, ',').split(',')) {
    const part = raw.trim();
    const match = /^(\d+)\s*(?:[-–—]\s*(\d+))?$/.exec(part);
    if (!match) throw new Error(`页码「${part || '空项'}」格式不正确，请使用 1-3,5,8-10。`);
    const from = Number(match[1]);
    const to = Number(match[2] || match[1]);
    if (from < 1 || to < from || to > pageCount)
      throw new Error(`页码范围「${part}」无效，这份 PDF 共 ${pageCount} 页。`);
    for (let page = from; page <= to; page++) indices.add(page - 1);
  }
  return [...indices].sort((a, b) => a - b);
}

export function fitImageOnPage(
  imageWidth: number,
  imageHeight: number,
  pageWidth: number,
  pageHeight: number,
  margin: number,
) {
  const availableWidth = pageWidth - margin * 2;
  const availableHeight = pageHeight - margin * 2;
  if (availableWidth <= 0 || availableHeight <= 0) throw new Error('页边距过大，请减小页边距。');
  const scale = Math.min(availableWidth / imageWidth, availableHeight / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return { x: (pageWidth - width) / 2, y: (pageHeight - height) / 2, width, height };
}

/** JPEG EXIF orientation matters when embedding phone photos without re-encoding. */
export function jpegOrientation(buffer: ArrayBuffer): number {
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return 1;
  let offset = 2;
  while (offset + 4 <= view.byteLength && view.getUint8(offset) === 0xff) {
    const marker = view.getUint8(offset + 1);
    if (marker === 0xda || marker === 0xd9) break;
    const length = view.getUint16(offset + 2);
    const end = offset + 2 + length;
    if (length < 2 || end > view.byteLength) break;
    if (
      marker === 0xe1 &&
      length >= 16 &&
      view.getUint32(offset + 4) === 0x45786966 &&
      view.getUint16(offset + 8) === 0
    ) {
      const tiff = offset + 10;
      const little = view.getUint16(tiff) === 0x4949;
      if ((!little && view.getUint16(tiff) !== 0x4d4d) || view.getUint16(tiff + 2, little) !== 42)
        return 1;
      const directory = tiff + view.getUint32(tiff + 4, little);
      if (directory + 2 > end || directory < tiff) return 1;
      const entries = view.getUint16(directory, little);
      for (let i = 0; i < entries; i++) {
        const entry = directory + 2 + i * 12;
        if (entry + 12 > end) return 1;
        if (
          view.getUint16(entry, little) === 0x0112 &&
          view.getUint16(entry + 2, little) === 3 &&
          view.getUint32(entry + 4, little) === 1
        ) {
          const value = view.getUint16(entry + 8, little);
          return value >= 1 && value <= 8 ? value : 1;
        }
      }
    }
    offset = end;
  }
  return 1;
}
