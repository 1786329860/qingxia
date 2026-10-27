import { PassThrough } from 'node:stream';
import { renderToPipeableStream, renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import App from './App';

export {
  PUBLIC_PATHS,
  getPageSeo,
  serializeStructuredData,
  SITE_ORIGIN,
  SITE_NAME,
} from './lib/seo';

// Build-time public markup only. Effects do not run and tool engines are not loaded.
export function renderPublicPage(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const page = (
      <StaticRouter location={path}>
        <App />
      </StaticRouter>
    );
    const output = new PassThrough();
    const timeout = setTimeout(() => {
      stream.abort();
      reject(new Error('Public prerender timed out'));
    }, 10000);
    output.on('data', () => {});
    output.on('end', () => {
      clearTimeout(timeout);
      // Resolve lazy public components first, then emit plain HTML without streamed
      // hidden suspense segments or inline reveal scripts. This also works with JS off.
      try {
        resolve(renderToStaticMarkup(page));
      } catch (error) {
        reject(error);
      }
    });
    output.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    const stream = renderToPipeableStream(page, {
      onAllReady() {
        stream.pipe(output);
      },
      onError(error) {
        clearTimeout(timeout);
        reject(error);
      },
    });
  });
}
