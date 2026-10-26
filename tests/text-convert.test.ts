import { describe, expect, it } from 'vitest';
import {
  base64ToBytes,
  bytesToBase64,
  csvToJson,
  jsonToCsv,
  parseRadix,
  parseShanghaiDate,
  processLines,
  timestampToMilliseconds,
} from '../src/lib/text-convert';

describe('browser-local Base64 operations', () => {
  it('round-trips Chinese and emoji as UTF-8 rather than Latin-1', () => {
    const original = '你好，轻匣 👋\n一行新的文本';
    const encoded = bytesToBase64(new TextEncoder().encode(original));
    expect(new TextDecoder().decode(base64ToBytes(encoded).bytes)).toBe(original);
  });
  it('accepts wrapped data URIs and missing optional padding', () => {
    const decoded = base64ToBytes('data:text/plain;charset=utf-8;base64,aGVs\nbG8=');
    expect(new TextDecoder().decode(decoded.bytes)).toBe('hello');
    expect(decoded.mime).toBe('text/plain');
    expect(new TextDecoder().decode(base64ToBytes('aGVsbG8').bytes)).toBe('hello');
  });
  it('rejects broken characters and oversized decoded output', () => {
    expect(() => base64ToBytes('aGV$sbG8=')).toThrow('有效的 Base64');
    expect(() => base64ToBytes('a')).toThrow('有效的 Base64');
    expect(() => base64ToBytes('aGVsbG8=', 2)).toThrow('限制');
  });
});

describe('CSV and JSON interoperability', () => {
  it('preserves quoted separators, quotes and embedded newlines', () => {
    const csv = 'name,note\r\n小匣,"逗号,双引号""与\n换行"';
    const result = JSON.parse(csvToJson(csv, { header: true, delimiter: ',', skipEmpty: true }));
    expect(result).toEqual([{ name: '小匣', note: '逗号,双引号"与\n换行' }]);
    const roundtrip = jsonToCsv(JSON.stringify(result), {
      delimiter: ',',
      header: true,
      safe: true,
    });
    expect(
      JSON.parse(csvToJson(roundtrip, { header: true, delimiter: ',', skipEmpty: true })),
    ).toEqual(result);
  });
  it('prevents formulas in text cells while preserving numeric negatives', () => {
    const output = jsonToCsv('[{"formula":" =1+1","negative":-5}]', {
      delimiter: ',',
      header: true,
      safe: true,
    });
    const rows = JSON.parse(csvToJson(output, { header: true, delimiter: ',', skipEmpty: true }));
    expect(rows[0].formula).toBe("' =1+1");
    expect(rows[0].negative).toBe('-5');
  });
  it('rejects extra columns instead of silently discarding data', () => {
    expect(() =>
      csvToJson('a,b\n1,2,3', { header: true, delimiter: ',', skipEmpty: true }),
    ).toThrow('列数多于表头');
  });
  it('uses the union of object keys, and rejects unrepresentable nested cells', () => {
    const csv = jsonToCsv('[{"a":1},{"b":2}]', { delimiter: ',', header: true, safe: true });
    expect(csv.split('\r\n')[0]).toBe('a,b');
    expect(() =>
      jsonToCsv('[{"a":{"nested":1}}]', { delimiter: ',', header: true, safe: true }),
    ).toThrow('嵌套');
  });
});

describe('text line processing', () => {
  it('deduplicates after trimming while retaining original order', () => {
    expect(
      processLines(' 苹果 \r\n香蕉\r\n苹果\n  \n葡萄', {
        trim: true,
        empty: true,
        dedupe: true,
        sort: 'none',
      }),
    ).toBe('苹果\n香蕉\n葡萄');
  });
  it('sorts numeric portions naturally', () => {
    expect(
      processLines('item10\nitem2\nitem1', {
        trim: false,
        empty: false,
        dedupe: false,
        sort: 'asc',
      }),
    ).toBe('item1\nitem2\nitem10');
  });
});

describe('arbitrary precision radix conversion', () => {
  it('retains integers beyond floating point precision', () => {
    expect(parseRadix('9007199254740993', 10).toString(16)).toBe('20000000000001');
    expect(parseRadix('-0xFFFFFFFFFFFFFFFF', 16)).toBe(-18446744073709551615n);
  });
  it('rejects partial parses, mismatched prefixes and fractions', () => {
    expect(() => parseRadix('102', 2)).toThrow('有效');
    expect(() => parseRadix('0x10', 10)).toThrow('有效');
    expect(() => parseRadix('12.5', 10)).toThrow('有效');
  });
});

describe('fixed UTC+8 timestamp conversion', () => {
  it('converts a known date and respects seconds / milliseconds', () => {
    expect(parseShanghaiDate('2025-01-01T08:00:00')).toBe(1735689600000);
    expect(timestampToMilliseconds('1735689600', 'seconds')).toBe(1735689600000);
    expect(timestampToMilliseconds('1735689600123', 'milliseconds')).toBe(1735689600123);
  });
  it('validates actual dates, including leap days', () => {
    expect(() => parseShanghaiDate('2025-02-29T12:00:00')).toThrow('不存在');
    expect(parseShanghaiDate('2024-02-29T12:00:00')).toBe(Date.UTC(2024, 1, 29, 4));
    expect(() => parseShanghaiDate('2024-13-01T00:00:00')).toThrow('无效');
  });
  it('does not reinterpret years below 100 as 1900s', () => {
    const milliseconds = parseShanghaiDate('0099-01-01T08:00:00');
    expect(new Date(milliseconds).getUTCFullYear()).toBe(99);
  });
});
