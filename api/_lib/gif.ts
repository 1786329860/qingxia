export const gifByteLimit = 2 * 1024 * 1024;

export function decodeGif(encoded: unknown) {
  if (
    typeof encoded !== 'string' ||
    encoded.length > Math.ceil(gifByteLimit / 3) * 4 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)
  )
    return null;
  const bytes = Buffer.from(encoded, 'base64');
  if (
    bytes.length < 20 ||
    bytes.length > gifByteLimit ||
    !/^GIF8[79]a$/.test(bytes.toString('ascii', 0, 6))
  )
    return null;
  const width = bytes.readUInt16LE(6);
  const height = bytes.readUInt16LE(8);
  if (!width || !height || width > 1920 || height > 1920) return null;

  let cursor = 13;
  let frames = 0;
  if (bytes[10] & 128) cursor += 3 << ((bytes[10] & 7) + 1);
  while (cursor < bytes.length) {
    const marker = bytes[cursor++];
    if (marker === 0x3b) return frames > 0 && cursor === bytes.length ? bytes : null;
    if (marker === 0x2c) {
      if (cursor + 9 >= bytes.length) return null;
      const frameWidth = bytes.readUInt16LE(cursor + 4);
      const frameHeight = bytes.readUInt16LE(cursor + 6);
      if (
        !frameWidth ||
        !frameHeight ||
        frameWidth > width ||
        frameHeight > height ||
        bytes.readUInt16LE(cursor) + frameWidth > width ||
        bytes.readUInt16LE(cursor + 2) + frameHeight > height ||
        ++frames * width * height > 100_000_000
      )
        return null;
      const flags = bytes[cursor + 8];
      cursor += 9;
      if (flags & 128) cursor += 3 << ((flags & 7) + 1);
      if (bytes[cursor] < 2 || bytes[cursor] > 8) return null;
      cursor++;
    } else if (marker === 0x21) {
      cursor++;
    } else {
      return null;
    }
    while (cursor < bytes.length) {
      const size = bytes[cursor++];
      if (size === 0) break;
      cursor += size;
    }
  }
  return null;
}
