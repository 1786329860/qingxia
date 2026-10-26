import Papa from 'papaparse';

export const MAX_TEXT = 5 * 1024 * 1024;
export function validateText(value: string, allowEmpty = false) {
  if (!allowEmpty && !value.trim()) throw new Error('请先输入需要处理的内容。');
  if (value.length > MAX_TEXT) throw new Error('文本超过 5 MB 字符限制，请缩小内容后重试。');
}

export function jsonErrorMessage(input: string, error: unknown): string {
  const message = error instanceof Error ? error.message : 'JSON 语法错误';
  const position = message.match(/position\s+(\d+)/i);
  const lineColumn = message.match(/line\s+(\d+)\s+column\s+(\d+)/i);
  let line = lineColumn ? Number(lineColumn[1]) : 0;
  let column = lineColumn ? Number(lineColumn[2]) : 0;
  if (position) {
    const before = input.slice(0, Number(position[1])).split('\n');
    line = before.length;
    column = before[before.length - 1].length + 1;
  }
  const location = line ? `第 ${line} 行，第 ${column} 列：` : '';
  if (/end of|unterminated/i.test(message))
    return `${location}内容没有结束，请检查引号、括号是否配对。`;
  return `${location}JSON 语法错误。请检查双引号、逗号和括号；JSON 不支持注释或末尾多余的逗号。${location ? '' : `（${message}）`}`;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 24576) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 24576));
  }
  return btoa(binary);
}

export function base64ToBytes(
  input: string,
  maxBytes = 50 * 1024 * 1024,
): { bytes: Uint8Array; mime: string } {
  const text = input.trim();
  const dataUri = text.match(/^data:([\w.+/-]+)?(?:;[\w.+-]+=[^;,]+)*;base64,([\s\S]*)$/i);
  const value = (dataUri ? dataUri[2] : text).replace(/\s/g, '');
  if (!value) return { bytes: new Uint8Array(), mime: dataUri?.[1] || 'application/octet-stream' };
  if (value.length > Math.ceil(maxBytes / 3) * 4 + 4)
    throw new Error('解码结果超过 50 MB 限制，请缩小内容。');
  if (
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value) ||
    value.length % 4 === 1 ||
    (/=/.test(value) && value.length % 4 !== 0)
  ) {
    throw new Error(
      '不是有效的 Base64：请检查字符、长度和结尾的 = 填充。支持标准 Base64 及 data:…;base64 链接。',
    );
  }
  const normalized = value.padEnd(Math.ceil(value.length / 4) * 4, '=');
  let binary: string;
  try {
    binary = atob(normalized);
  } catch {
    throw new Error('Base64 解码失败，请检查输入是否完整。');
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  if (bytes.length > maxBytes) throw new Error('解码结果超过 50 MB 限制，请缩小内容。');
  return { bytes, mime: dataUri?.[1] || 'application/octet-stream' };
}

export function processLines(
  value: string,
  options: { trim: boolean; empty: boolean; dedupe: boolean; sort: 'none' | 'asc' | 'desc' },
) {
  validateText(value, true);
  let lines = value.split(/\r\n|\r|\n/);
  if (lines.length > 100000) throw new Error('最多处理 100,000 行，请分批处理。');
  if (options.trim) lines = lines.map((line) => line.trim());
  if (options.empty) lines = lines.filter((line) => line.trim().length > 0);
  if (options.dedupe) lines = [...new Set(lines)];
  if (options.sort !== 'none') {
    const direction = options.sort === 'asc' ? 1 : -1;
    lines.sort((a, b) => direction * a.localeCompare(b, 'zh-CN', { numeric: true }));
  }
  return lines.join('\n');
}

export function csvToJson(
  input: string,
  options: { header: boolean; delimiter: string; skipEmpty: boolean },
) {
  validateText(input);
  const parsed = Papa.parse(input, {
    header: options.header,
    delimiter: options.delimiter,
    skipEmptyLines: options.skipEmpty ? 'greedy' : false,
    transformHeader: (value) => value.replace(/^\uFEFF/, ''),
  });
  const errors = parsed.errors.filter((error) => error.code !== 'UndetectableDelimiter');
  if (errors.length) {
    const error = errors[0];
    const row =
      typeof error.row === 'number' ? `第 ${error.row + (options.header ? 2 : 1)} 行：` : '';
    const translations: Record<string, string> = {
      TooManyFields: '列数多于表头，请检查分隔符或为包含分隔符的内容加双引号。',
      TooFewFields: '列数少于表头，请补齐缺少的列。',
      MissingQuotes: '双引号未闭合，请检查带引号的字段。',
      InvalidQuotes: '字段引号无效，字段中的双引号应写成两个双引号。',
    };
    throw new Error(`${row}${translations[error.code] || error.message}`);
  }
  if (options.header && parsed.meta.fields?.some((field) => !field.trim()))
    throw new Error('CSV 表头中存在空列名，请为每一列填写名称。');
  const renamed = (parsed.meta as typeof parsed.meta & { renamedHeaders?: Record<string, string> })
    .renamedHeaders;
  if (renamed && Object.keys(renamed).length)
    throw new Error('CSV 表头存在重名，请修改为唯一列名，避免数据覆盖。');
  return JSON.stringify(parsed.data, null, 2);
}

export function jsonToCsv(
  input: string,
  options: { delimiter: string; safe: boolean; header: boolean },
) {
  validateText(input);
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (error) {
    throw new Error(jsonErrorMessage(input, error));
  }
  if (!Array.isArray(parsed) || !parsed.length)
    throw new Error('请输入非空 JSON 数组，例如 [{"姓名":"小匣","分数":95}]。');
  if (parsed.length > 100000) throw new Error('最多转换 100,000 行，请分批处理。');
  const isArray = Array.isArray(parsed[0]);
  for (const [index, row] of parsed.entries()) {
    if (isArray ? !Array.isArray(row) : !row || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error(`第 ${index + 1} 项格式不同：请使用对象数组或二维数组。`);
    }
    for (const cell of Object.values(row)) {
      if (cell !== null && typeof cell === 'object')
        throw new Error(`第 ${index + 1} 项包含嵌套对象或数组，请先将该字段转为文本。`);
    }
  }
  const fields = isArray ? undefined : [...new Set(parsed.flatMap((row) => Object.keys(row)))];
  return Papa.unparse(fields ? { fields, data: parsed } : parsed, {
    delimiter: options.delimiter || ',',
    header: !isArray && options.header,
    escapeFormulae: options.safe ? /^[\t\r\n ]*[=+\-@]|^[\t\r]/ : false,
    newline: '\r\n',
  });
}

export function parseRadix(value: string, radix: number): bigint {
  const trimmed = value.trim();
  if (!trimmed) throw new Error('请输入需要转换的整数。');
  if (![2, 8, 10, 16].includes(radix)) throw new Error('不支持的进制。');
  if (trimmed.length > 4096) throw new Error('整数最多 4,096 个字符，请缩短后重试。');
  const sign = trimmed.startsWith('-') ? -1n : 1n;
  let digits = trimmed.replace(/^[+-]/, '');
  const prefix = { 2: '0b', 8: '0o', 16: '0x' }[radix];
  if (prefix && digits.toLowerCase().startsWith(prefix)) digits = digits.slice(2);
  const patterns: Record<number, RegExp> = {
    2: /^[01]+$/,
    8: /^[0-7]+$/,
    10: /^\d+$/,
    16: /^[0-9a-f]+$/i,
  };
  if (!patterns[radix].test(digits))
    throw new Error(`输入不是有效的 ${radix} 进制整数；不支持小数、分隔符或其他进制的前缀。`);
  let result = 0n;
  for (const char of digits) result = result * BigInt(radix) + BigInt(parseInt(char, 16));
  return result * sign;
}

export function shanghaiDateInput(milliseconds: number): string {
  const date = new Date(milliseconds);
  if (Number.isNaN(date.getTime())) throw new Error('时间超出支持范围。');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: string) => parts.find((value) => value.type === type)?.value || '';
  const year = Number(part('year'));
  if (year < 1 || year > 9999) throw new Error('日期年份需在 0001～9999 之间。');
  return `${part('year').padStart(4, '0')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}:${part('second')}`;
}

export function parseShanghaiDate(value: string): number {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) throw new Error('请选择完整日期与时间，精确到秒。');
  const [, year, month, day, hour, minute, second = '0'] = match;
  if (
    Number(year) < 1 ||
    Number(month) < 1 ||
    Number(month) > 12 ||
    Number(day) < 1 ||
    Number(day) > 31 ||
    Number(hour) > 23 ||
    Number(minute) > 59 ||
    Number(second) > 59
  )
    throw new Error('日期或时间无效，请检查年月日与时分秒。');
  // Asia/Shanghai has historical daylight-saving offsets. This tool explicitly uses fixed UTC+8.
  const date = new Date(0);
  date.setUTCFullYear(Number(year), Number(month) - 1, Number(day));
  date.setUTCHours(Number(hour) - 8, Number(minute), Number(second), 0);
  const local = new Date(date.getTime() + 8 * 3600000);
  if (
    local.getUTCFullYear() !== Number(year) ||
    local.getUTCMonth() !== Number(month) - 1 ||
    local.getUTCDate() !== Number(day)
  )
    throw new Error('日期不存在，请检查月份天数或闰年。');
  return date.getTime();
}

export function timestampToMilliseconds(value: string, unit: 'seconds' | 'milliseconds'): number {
  if (!/^[+-]?\d+$/.test(value.trim())) throw new Error('时间戳必须是整数，支持秒或毫秒。');
  if (value.trim().replace(/^[+-]/, '').length > 18)
    throw new Error('时间戳过长，日期年份需在 0001～9999 之间。');
  const integer = BigInt(value.trim());
  const milliseconds = unit === 'seconds' ? integer * 1000n : integer;
  if (milliseconds > 253402271999999n || milliseconds < -62135625600000n)
    throw new Error('日期年份需在 0001～9999 之间。');
  return Number(milliseconds);
}
