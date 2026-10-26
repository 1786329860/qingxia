import type { Plugin } from 'vite';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import events from '../api/events';
import admin from '../api/admin';
import resolve from '../api/resolve';
const handlers: Record<string, typeof admin> = {
  '/api/events': events,
  '/api/admin': admin,
  '/api/resolve': resolve,
};
export function localApi(): Plugin {
  return {
    name: 'qingxia-local-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || '/', `http://${req.headers.host}`);
        const handler = handlers[url.pathname];
        if (!handler) return next();
        let raw = '';
        try {
          for await (const chunk of req) {
            raw += chunk;
            if (Buffer.byteLength(raw) > 16384) {
              res.statusCode = 413;
              res.end('请求过大');
              return;
            }
          }
          const request = req as VercelRequest;
          request.query = Object.fromEntries(url.searchParams.entries());
          request.body = raw;
          const response = res as VercelResponse;
          response.status = (code: number) => {
            res.statusCode = code;
            return response;
          };
          response.json = (value: unknown) => {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify(value));
            return response;
          };
          await handler(request, response);
        } catch {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: '服务暂不可用，请检查服务端环境配置。' }));
        }
      });
    },
  };
}
