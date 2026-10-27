import { describe, expect, it } from 'vitest';
import { getPageSeo, PUBLIC_PATHS, serializeStructuredData, SITE_ORIGIN } from '../src/lib/seo';
import { tools } from '../src/lib/registry';

describe('public search metadata', () => {
  it('lists every public tool once and excludes private/API/personal state', () => {
    expect(PUBLIC_PATHS).toHaveLength(tools.length + 3);
    expect(new Set(PUBLIC_PATHS).size).toBe(PUBLIC_PATHS.length);
    expect(PUBLIC_PATHS.some((path) => /admin|api|\?|#/.test(path))).toBe(false);
    for (const path of PUBLIC_PATHS) {
      const seo = getPageSeo(path);
      expect(seo.canonical).toBe(SITE_ORIGIN + path);
      expect(seo.robots).toBe('index, follow');
      expect(seo.title).toContain('轻匣');
      expect(seo.description.length).toBeGreaterThan(20);
    }
  });
  it('identifies the Chinese brand at the subdomain root with consistent alternatives', () => {
    const seo = getPageSeo('/');
    expect(seo.title).toContain('免费无广告');
    expect(seo.structuredData).toMatchObject({
      '@type': 'WebSite',
      name: '轻匣',
      alternateName: ['轻匣工具箱', 'QINGXIA'],
      url: SITE_ORIGIN + '/',
    });
    expect(getPageSeo('/about').structuredData?.['@type']).toBe('WebPage');
  });
  it('keeps local privacy and experimental platform claims distinct for each tool', () => {
    expect(getPageSeo('/tool/image-compress').description).toContain('文件与输入正文不上传');
    expect(getPageSeo('/tool/douyin').description).toContain('实验性功能');
    expect(getPageSeo('/tool/douyin').description).toContain('受平台访问策略限制');
    expect(getPageSeo('/tool/douyin/').canonical).toBe(SITE_ORIGIN + '/tool/douyin');
  });
  it('does not index admin, unknown routes or local favorites and recent history', () => {
    for (const path of ['/admin', '/admin/private']) {
      const seo = getPageSeo(path);
      expect(seo.robots).toBe('noindex, nofollow');
      expect(seo.structuredData).toBeNull();
    }
    for (const query of ['?view=favorites', '?view=recent']) {
      expect(getPageSeo('/', query).robots).toBe('noindex, follow');
      expect(getPageSeo('/', query).canonical).toBe(SITE_ORIGIN + '/');
    }
    expect(getPageSeo('/tool/unknown').robots).toBe('noindex, follow');
  });
  it('serializes JSON-LD as inert JSON even if future metadata contains HTML delimiters', () => {
    const data = { name: '</script><script>alert(1)</script>&' };
    const encoded = serializeStructuredData(data);
    expect(encoded).not.toContain('<');
    expect(JSON.parse(encoded)).toEqual(data);
  });
});
