import { describe, expect, it } from 'vitest';
import { formatDuration, makeFrameTimes } from '../src/lib/media-utils';

describe('video extraction time planning', () => {
  it('uses an exclusive end so the decoder is never asked for a frame beyond the video', () => {
    expect(makeFrameTimes(0, 10, 5, 10)).toEqual([0, 5]);
    expect(makeFrameTimes(1, 3.5, 1, 10)).toEqual([1, 2, 3]);
    expect(makeFrameTimes(0, 0.02, 0.1, 0.02)).toEqual([0]);
  });
  it('rejects non-finite, reversed, out-of-range and excessive extraction requests', () => {
    expect(() => makeFrameTimes(NaN, 1, 1, 10)).toThrow('无效');
    expect(() => makeFrameTimes(5, 4, 1, 10)).toThrow('起止');
    expect(() => makeFrameTimes(0, 11, 1, 10)).toThrow('起止');
    expect(() => makeFrameTimes(0, 1, 0.01, 10)).toThrow('至少');
    expect(() => makeFrameTimes(0, 10, 0.1, 10, 80)).toThrow('100 帧');
  });
  it('handles decimal intervals without accidentally adding a frame', () => {
    expect(makeFrameTimes(0, 0.3, 0.1, 10)).toHaveLength(3);
    expect(makeFrameTimes(0, 0.31, 0.1, 10)).toHaveLength(4);
    expect(formatDuration(125.9)).toBe('2:05');
    expect(formatDuration(Infinity)).toBe('--:--');
  });
});
