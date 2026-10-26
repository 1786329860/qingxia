import { describe, expect, it } from 'vitest';
import {
  colorContrast,
  parseColor,
  secureRandomString,
  secureUuid,
} from '../src/lib/developer-utils';

describe('颜色转换', () => {
  it('HEX 与 RGB/HSL 正确转换', () => {
    const color = parseColor('#ff0000');
    expect(color.rgb).toBe('rgb(255, 0, 0)');
    expect(color.hsl).toBe('hsl(0, 100%, 50%)');
    expect(parseColor('hsl(120, 100%, 50%)').hex).toBe('#00FF00');
    expect(parseColor('rgb(0, 0, 255)').hex).toBe('#0000FF');
  });
  it('支持透明度、短 HEX、现代 CSS 语法和负色相', () => {
    expect(parseColor('#abcd').hex).toBe('#AABBCCDD');
    expect(parseColor('rgb(100% 0% 0% / 50%)').hex).toBe('#FF000080');
    expect(parseColor('hsl(-120 100% 50%)').hex).toBe('#0000FF');
    expect(parseColor('rgba(255, 0, 0, 0)').hex).toBe('#FF000000');
  });
  it('拒绝不合法值，不默默截断', () => {
    for (const invalid of [
      '',
      '#zzzzzz',
      '#12',
      'rgb(256, 0, 0)',
      'rgb(0, -1, 0)',
      'hsl(0, 101%, 50%)',
      'rgba(0, 0, 0, 2)',
      'red',
    ])
      expect(() => parseColor(invalid)).toThrow();
  });
  it('计算颜色对比度', () => {
    expect(colorContrast('#000000', '#ffffff')).toBeCloseTo(21);
    expect(colorContrast('#ff0000', '#ff0000')).toBeCloseTo(1);
  });
});

describe('安全随机生成', () => {
  it('使用 rejection sampling 丢弃取模偏差区域', () => {
    let calls = 0;
    const value = secureRandomString(3, 'ABC', (array) => {
      calls++;
      array.fill(255);
      array[0] = 255;
      array[1] = 0;
      array[2] = 1;
      array[3] = 2;
      return array;
    });
    expect(value).toBe('ABC');
    expect(calls).toBe(1);
  });
  it('按 Unicode 字符而非 UTF-16 半字符生成，并去重字符集', () => {
    expect(
      secureRandomString(2, '猫猫🐱', (array) => {
        array.fill(0);
        array[1] = 1;
        return array;
      }),
    ).toBe('猫🐱');
  });
  it('验证空字符集和长度边界', () => {
    expect(() => secureRandomString(10, '')).toThrow();
    expect(() => secureRandomString(0, 'abc')).toThrow();
    expect(() => secureRandomString(1.2, 'abc')).toThrow();
    expect(() => secureRandomString(1025, 'abc')).toThrow();
  });
  it('UUID 包含 v4 和 RFC variant 位', () => {
    expect(secureUuid((array) => array.fill(0))).toBe('00000000-0000-4000-8000-000000000000');
    expect(secureUuid((array) => array.fill(255))).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
  });
});
