import { getTool, tools } from './registry';

export const SITE_ORIGIN = 'https://qingxia.aixiaolv.icu';
export const SITE_NAME = '轻匣';
export const HOME_TITLE = '轻匣 - 免费无广告在线工具箱';
export const SITE_DESCRIPTION =
  '轻匣是免费、无广告、无需登录的中文在线工具箱，提供抖音公开链接解析、图片压缩、PDF、视频与文本等常用工具。本地工具在浏览器处理，文件与输入正文不上传。';
export const PUBLIC_PATHS = ['/', '/about', '/privacy', ...tools.map((tool) => `/tool/${tool.id}`)];

export interface PageSeo {
  title: string;
  description: string;
  canonical: string;
  robots: string;
  structuredData: Record<string, unknown> | null;
}

export function getPageSeo(pathname: string, search = ''): PageSeo {
  const path = pathname.replace(/\/+$/, '') || '/';
  const tool = path.startsWith('/tool/') ? getTool(path.slice(6)) : undefined;
  const known = PUBLIC_PATHS.includes(path);
  const privatePage = path === '/admin' || path.startsWith('/admin/');
  const personalView =
    path === '/' && ['favorites', 'recent'].includes(new URLSearchParams(search).get('view') || '');
  const title = tool
    ? `${tool.name} - 轻匣免费在线工具箱`
    : path === '/about'
      ? '关于轻匣 - 免费、无广告、隐私优先的在线工具箱'
      : path === '/privacy'
        ? '隐私说明 - 轻匣在线工具箱'
        : privatePage
          ? '站长工作台 · 轻匣'
          : known
            ? HOME_TITLE
            : '页面不存在 · 轻匣';
  const description = tool
    ? `${tool.name}：${tool.description}${tool.mode === 'local' ? '免费、无需登录，在浏览器内处理，文件与输入正文不上传。' : '实验性功能，仅处理有权保存的公开内容，解析与下载受平台访问策略限制。'}`
    : path === '/about'
      ? '了解轻匣：免费、无广告、普通用户无需登录的中文在线工具箱，提供本地文件处理与常用实用工具，并欢迎通过邮箱提出优化与功能建议。'
      : path === '/privacy'
        ? '轻匣隐私说明：本地工具不上传文件内容、文件名或输入正文；公开链接解析与匿名统计的处理边界公开透明。'
        : privatePage
          ? '轻匣站长独立密码保护的统计后台。'
          : SITE_DESCRIPTION;
  const canonical = `${SITE_ORIGIN}${known || privatePage ? path : '/'}`;
  const robots = privatePage
    ? 'noindex, nofollow'
    : !known || personalView
      ? 'noindex, follow'
      : 'index, follow';
  const structuredData =
    !known || personalView
      ? null
      : path === '/'
        ? {
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            '@id': `${SITE_ORIGIN}/#website`,
            name: SITE_NAME,
            alternateName: ['轻匣工具箱', 'QINGXIA'],
            url: `${SITE_ORIGIN}/`,
            inLanguage: 'zh-CN',
            description: SITE_DESCRIPTION,
          }
        : {
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            name: title,
            description,
            url: canonical,
            inLanguage: 'zh-CN',
            isPartOf: { '@id': `${SITE_ORIGIN}/#website` },
          };
  return { title, description, canonical, robots, structuredData };
}

export function serializeStructuredData(data: Record<string, unknown>): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

export function updateDocumentSeo(seo: PageSeo) {
  document.title = seo.title;
  const meta = (selector: string, key: 'name' | 'property', name: string, content: string) => {
    let element = document.head.querySelector<HTMLMetaElement>(selector);
    if (!element) {
      element = document.createElement('meta');
      element.setAttribute(key, name);
      document.head.append(element);
    }
    element.content = content;
  };
  meta('meta[name="description"]', 'name', 'description', seo.description);
  meta('meta[name="robots"]', 'name', 'robots', seo.robots);
  for (const [name, content] of Object.entries({
    'og:title': seo.title,
    'og:description': seo.description,
    'og:url': seo.canonical,
    'og:site_name': SITE_NAME,
    'og:type': 'website',
    'og:locale': 'zh_CN',
  }))
    meta(`meta[property="${name}"]`, 'property', name, content);
  let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.rel = 'canonical';
    document.head.append(canonical);
  }
  canonical.href = seo.canonical;
  document.getElementById('qingxia-structured-data')?.remove();
  if (seo.structuredData) {
    const script = document.createElement('script');
    script.id = 'qingxia-structured-data';
    script.type = 'application/ld+json';
    script.textContent = serializeStructuredData(seo.structuredData);
    document.head.append(script);
  }
}
