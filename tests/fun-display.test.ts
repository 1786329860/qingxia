import { describe, it, expect } from 'vitest';
import {
  kaomoji,
  kaomojiCategories,
  parseKaomojiFavorites,
  searchKaomoji,
} from '../src/lib/fun-display';
describe('本地颜文字数据与收藏边界', () => {
  it('分类完整且ID唯一，复制内容非空', () => {
    expect(kaomoji.length).toBeGreaterThanOrEqual(64);
    expect(new Set(kaomoji.map((x) => x.id)).size).toBe(kaomoji.length);
    for (const category of kaomojiCategories)
      expect(kaomoji.filter((x) => x.category === category).length).toBeGreaterThanOrEqual(8);
    expect(kaomoji.every((x) => x.value.trim().length > 0)).toBe(true);
  });
  it('支持关键词与分类组合而不修改复制内容', () => {
    const found = searchKaomoji('抱抱', '爱意');
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((x) => x.category === '爱意')).toBe(true);
    expect(searchKaomoji('HELLO').length).toBeGreaterThan(0);
    expect(searchKaomoji('不存在的颜文字')).toEqual([]);
  });
  it('坏存储、未知ID和重复值不会冒充收藏', () => {
    expect(parseKaomojiFavorites('{bad}')).toEqual([]);
    expect(parseKaomojiFavorites('{"face-1":true}')).toEqual([]);
    expect(
      parseKaomojiFavorites(JSON.stringify(['face-1', 'face-1', 'bad', null, 2, 'face-2'])),
    ).toEqual(['face-1', 'face-2']);
    expect(parseKaomojiFavorites('x'.repeat(40000))).toEqual([]);
    expect(searchKaomoji('', '全部', ['face-2']).map((x) => x.id)).toEqual(['face-2']);
  });
});
