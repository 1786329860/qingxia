export type RgbColor = { r: number; g: number; b: number; a: number };
export type ParsedColor = RgbColor & {
  hex: string;
  rgb: string;
  hsl: string;
  hue: number;
  saturation: number;
  lightness: number;
};

const channel = (value: number) => Math.round(Math.max(0, Math.min(255, value)));
const decimal = (value: number, precision = 2) => Number(value.toFixed(precision));

export function parseColor(input: string): ParsedColor {
  const value = input.trim().toLowerCase();
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 1;
  const hex = /^#?([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value);
  const rgb =
    /^rgba?\(\s*([+-]?(?:\d+\.?\d*|\.\d+)%?)\s*[, ]\s*([+-]?(?:\d+\.?\d*|\.\d+)%?)\s*[, ]\s*([+-]?(?:\d+\.?\d*|\.\d+)%?)(?:\s*[,/]\s*([+-]?(?:\d+\.?\d*|\.\d+)%?))?\s*\)$/.exec(
      value,
    );
  const hsl =
    /^hsla?\(\s*([+-]?(?:\d+\.?\d*|\.\d+))(?:deg)?\s*[, ]\s*([+-]?(?:\d+\.?\d*|\.\d+))%\s*[, ]\s*([+-]?(?:\d+\.?\d*|\.\d+))%(?:\s*[,/]\s*([+-]?(?:\d+\.?\d*|\.\d+)%?))?\s*\)$/.exec(
      value,
    );
  function alpha(raw: string | undefined) {
    const n = raw === undefined ? 1 : raw.endsWith('%') ? parseFloat(raw) / 100 : Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > 1)
      throw new Error('透明度应在 0～1 或 0%～100% 之间。');
    return n;
  }
  if (hex) {
    let code = hex[1];
    if (code.length <= 4) code = [...code].map((c) => c + c).join('');
    r = parseInt(code.slice(0, 2), 16);
    g = parseInt(code.slice(2, 4), 16);
    b = parseInt(code.slice(4, 6), 16);
    if (code.length === 8) a = parseInt(code.slice(6, 8), 16) / 255;
  } else if (rgb) {
    const values = rgb.slice(1, 4).map((part) => {
      const n = parseFloat(part);
      const limit = part.endsWith('%') ? 100 : 255;
      if (n < 0 || n > limit) throw new Error('RGB 每个通道应在 0～255 或 0%～100% 之间。');
      return channel((n / limit) * 255);
    });
    [r, g, b] = values;
    a = alpha(rgb[4]);
  } else if (hsl) {
    const rawHue = Number(hsl[1]);
    if (!Number.isFinite(rawHue)) throw new Error('HSL 色相必须是有效数字。');
    const h = ((rawHue % 360) + 360) % 360;
    const s = Number(hsl[2]) / 100;
    const l = Number(hsl[3]) / 100;
    if (s < 0 || s > 1 || l < 0 || l > 1) throw new Error('HSL 饱和度和亮度应在 0%～100% 之间。');
    const chroma = (1 - Math.abs(2 * l - 1)) * s;
    const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - chroma / 2;
    const parts =
      h < 60
        ? [chroma, x, 0]
        : h < 120
          ? [x, chroma, 0]
          : h < 180
            ? [0, chroma, x]
            : h < 240
              ? [0, x, chroma]
              : h < 300
                ? [x, 0, chroma]
                : [chroma, 0, x];
    [r, g, b] = parts.map((n) => channel((n + m) * 255));
    a = alpha(hsl[4]);
  } else {
    throw new Error('请输入 HEX（如 #B9F97D）、RGB 或 HSL 颜色，不支持颜色名称。');
  }
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;
  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  if (delta)
    hue =
      ((max === red
        ? ((green - blue) / delta) % 6
        : max === green
          ? (blue - red) / delta + 2
          : (red - green) / delta + 4) *
        60 +
        360) %
      360;
  const suffix =
    a < 1
      ? channel(a * 255)
          .toString(16)
          .padStart(2, '0')
      : '';
  const outputHex =
    `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}${suffix}`.toUpperCase();
  const alphaText = decimal(a, 3);
  return {
    r,
    g,
    b,
    a,
    hex: outputHex,
    rgb: a < 1 ? `rgba(${r}, ${g}, ${b}, ${alphaText})` : `rgb(${r}, ${g}, ${b})`,
    hsl:
      a < 1
        ? `hsla(${decimal(hue)}, ${decimal(saturation * 100)}%, ${decimal(lightness * 100)}%, ${alphaText})`
        : `hsl(${decimal(hue)}, ${decimal(saturation * 100)}%, ${decimal(lightness * 100)}%)`,
    hue,
    saturation: saturation * 100,
    lightness: lightness * 100,
  };
}

type RandomFill = (array: Uint8Array) => Uint8Array;
const cryptoFill: RandomFill = (array) => crypto.getRandomValues(array);
export function secureRandomString(
  length: number,
  charset: string,
  fill: RandomFill = cryptoFill,
): string {
  const chars = [...new Set([...charset])];
  if (!Number.isInteger(length) || length < 1 || length > 1024)
    throw new Error('长度应为 1～1024 之间的整数。');
  if (!chars.length) throw new Error('请至少选择一种字符，或填写自定义字符集。');
  if (chars.length > 256) throw new Error('字符集最多支持 256 种不同字符。');
  const limit = 256 - (256 % chars.length);
  const result: string[] = [];
  while (result.length < length) {
    const bytes = fill(
      new Uint8Array(Math.min(4096, Math.max(32, Math.ceil((length - result.length) * 1.5)))),
    );
    for (const byte of bytes) {
      if (byte >= limit) continue;
      result.push(chars[byte % chars.length]);
      if (result.length === length) break;
    }
  }
  return result.join('');
}

export function secureUuid(fill: RandomFill = cryptoFill): string {
  const bytes = fill(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function colorContrast(first: string, second: string): number {
  const luminance = (input: string) => {
    const { r, g, b } = parseColor(input);
    const [red, green, blue] = [r, g, b].map((n) => {
      const v = n / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return red * 0.2126 + green * 0.7152 + blue * 0.0722;
  };
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
