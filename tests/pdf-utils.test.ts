import { describe, expect, it } from 'vitest';
import { fitImageOnPage, jpegOrientation, parsePageRanges } from '../src/lib/pdf-utils';

describe('PDF 页码范围', () => {
  it('支持全部页、中文分隔符和重复页码去重', () => {
    expect(parsePageRanges('', 4)).toEqual([0, 1, 2, 3]);
    expect(parsePageRanges('全部', 2)).toEqual([0, 1]);
    expect(parsePageRanges('1-3，3,5–6', 6)).toEqual([0, 1, 2, 4, 5]);
  });
  it.each(['0', '5', '3-2', '1-9', '1,,2', 'abc', '1.5', '-1'])(
    '拒绝错误范围 %s，避免悄悄漏页',
    (value) => {
      expect(() => parsePageRanges(value, 4)).toThrow();
    },
  );
  it('拒绝无页面的文档', () => {
    expect(() => parsePageRanges('', 0)).toThrow('没有可处理');
  });
});

describe('图片放入 PDF 页面', () => {
  it('完整保留宽高比并居中，不裁剪图片', () => {
    const position = fitImageOnPage(1600, 900, 600, 800, 20);
    expect(position.width / position.height).toBeCloseTo(1600 / 900);
    expect(position.x).toBe(20);
    expect(position.y + position.height / 2).toBeCloseTo(400);
    expect(position.width).toBeLessThanOrEqual(560);
    expect(position.height).toBeLessThanOrEqual(760);
  });
  it('拒绝占满页面的页边距', () => {
    expect(() => fitImageOnPage(100, 100, 100, 200, 50)).toThrow('页边距过大');
  });
});

describe('手机 JPEG 方向', () => {
  it('读取 EXIF 旋转信息，损坏或缺失信息时安全回退', () => {
    const buffer = new ArrayBuffer(38);
    const view = new DataView(buffer);
    view.setUint16(0, 0xffd8);
    view.setUint16(2, 0xffe1);
    view.setUint16(4, 34);
    view.setUint32(6, 0x45786966);
    view.setUint16(12, 0x4949);
    view.setUint16(14, 42, true);
    view.setUint32(16, 8, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 0x0112, true);
    view.setUint16(24, 3, true);
    view.setUint32(26, 1, true);
    view.setUint16(30, 6, true);
    expect(jpegOrientation(buffer)).toBe(6);
    expect(jpegOrientation(buffer.slice(0, 35))).toBe(1);
    expect(jpegOrientation(new ArrayBuffer(0))).toBe(1);
  });
});
