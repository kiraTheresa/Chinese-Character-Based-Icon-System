import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const publicDirectory = fileURLToPath(new URL('./public/', import.meta.url));
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8',
};
let port = Number(process.env.HANZI_ICON_PORT || 4173);
let retries = 0;

const server = http.createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end();
    return;
  }

  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = path.resolve(publicDirectory, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!file.startsWith(publicDirectory)) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }
    const info = await stat(file);
    if (!info.isFile()) throw new Error('Not a file');
    response.writeHead(200, {
      'Content-Type': mimeTypes[path.extname(file)] || 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=3600' : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    if (request.method === 'HEAD') response.end();
    else createReadStream(file).on('error', () => response.destroy()).pipe(response);
  } catch (error) {
    response.writeHead(error instanceof URIError ? 400 : 404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(error instanceof URIError ? 'Bad request' : 'Not found');
  }
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE' && retries < 10) {
    retries += 1;
    port += 1;
    server.listen(port, '127.0.0.1');
    return;
  }
  console.error(`无法启动本地服务：${error.message}`);
  process.exitCode = 1;
});
server.on('listening', () => console.log(`字成图 · Local: http://127.0.0.1:${port}`));
server.listen(port, '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
