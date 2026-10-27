import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const server = await createServer({
  configFile: false,
  plugins: [react()],
  mode: 'production',
  logLevel: 'error',
  appType: 'custom',
  ssr: {
    noExternal: ['react-router', 'react-router-dom'],
    resolve: { conditions: ['module', 'import', 'production'] },
  },
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, watch: null },
});
const escape = (text) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
try {
  const { PUBLIC_PATHS, getPageSeo, renderPublicPage, serializeStructuredData, SITE_NAME } =
    await server.ssrLoadModule('/src/entry-server.tsx');
  const template = await readFile('dist/index.html', 'utf8');
  for (const path of [...PUBLIC_PATHS, '/admin']) {
    const seo = getPageSeo(path);
    const meta = [
      `<link rel="canonical" href="${escape(seo.canonical)}" />`,
      `<meta name="robots" content="${escape(seo.robots)}" />`,
      ...Object.entries({
        'og:title': seo.title,
        'og:description': seo.description,
        'og:site_name': SITE_NAME,
        'og:url': seo.canonical,
        'og:type': 'website',
        'og:locale': 'zh_CN',
      }).map(([name, content]) => `<meta property="${name}" content="${escape(content)}" />`),
      seo.structuredData
        ? `<script id="qingxia-structured-data" type="application/ld+json">${serializeStructuredData(seo.structuredData)}</script>`
        : '',
    ].join('\n');
    const markup = path === '/admin' ? '' : await renderPublicPage(path);
    const html = template
      .replace(/<title>[\s\S]*?<\/title>/, () => `<title>${escape(seo.title)}</title>`)
      .replace(
        /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/,
        () => `<meta name="description" content="${escape(seo.description)}" />`,
      )
      .replace('</head>', `${meta}\n</head>`)
      .replace('<div id="root"></div>', () => `<div id="root">${markup}</div>`);
    const target = resolve('dist', path === '/' ? 'index.html' : `${path.slice(1)}.html`);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, html);
  }
  await writeFile(
    'dist/sitemap.xml',
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${PUBLIC_PATHS.map((path) => `  <url><loc>${escape(getPageSeo(path).canonical)}</loc></url>`).join('\n')}\n</urlset>\n`,
  );
  console.log(
    `Prerendered ${PUBLIC_PATHS.length} public pages; admin is metadata-only/noindex. Sitemap generated.`,
  );
} finally {
  await server.close();
}
