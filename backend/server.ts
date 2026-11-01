import { createServer, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fields, platforms, getJob, getScreenshot, isBusy, startJob, cancelJob } from './audit.js';

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '127.0.0.1';
const publicRoot = new URL('../public/', import.meta.url);
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/results', ['results.html', 'text/html; charset=utf-8']],
  ['/css/style.css', ['css/style.css', 'text/css; charset=utf-8']],
  ['/js/main.js', ['js/main.js', 'text/javascript; charset=utf-8']],
  ['/js/results.js', ['js/results.js', 'text/javascript; charset=utf-8']],
  ['/js/comparison.js', ['js/comparison.js', 'text/javascript; charset=utf-8']],
]);

function json(response: ServerResponse, status: number, data: object): void {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(data));
}

const server = createServer(async (request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;

  try {
    if (pathname === '/api/health' && request.method === 'GET') {
      json(response, 200, { status: 'ok', detectionEnabled: Boolean(process.env.OPENAI_API_KEY), apifyEnabled:Boolean(process.env.APIFY_TOKEN)&&process.env.APIFY_ENABLED!=='false', fields, platforms });
      return;
    }

    const cancel = pathname.match(/^\/api\/audits\/([a-f0-9-]{36})\/cancel$/);
    if(cancel && request.method==='POST') {
      const origin=request.headers.origin;
      if(origin && origin!==`http://${request.headers.host}` && origin!==`https://${request.headers.host}`) {json(response,403,{message:'Cross-origin request rejected.'});return;}
      try {json(response,202,await cancelJob(cancel[1]));}catch{json(response,404,{message:'Audit not found.'});} return;
    }
    const screenshot = pathname.match(/^\/api\/audits\/([a-f0-9-]{36})\/screenshots\/([^/]+)$/);
    if (screenshot && request.method === 'GET') {
      try { const image = await getScreenshot(screenshot[1],screenshot[2]); response.writeHead(200,{'Content-Type':'image/png','Cache-Control':'no-store'}); response.end(image); }
      catch { json(response,404,{message:'Screenshot not found.'}); } return;
    }
    const match = pathname.match(/^\/api\/audits\/([a-f0-9-]{36})(?:\/(official|google_maps|yelp|tripadvisor|opentable|uber_eats|doordash|toast|grubhub)\.json)?$/);
    if (match && request.method === 'GET') {
      try {
        const job = await getJob(match[1]);
        if (match[2]) {
          response.setHeader('Content-Disposition', `attachment; filename="${match[2]}.json"`);
          json(response, 200, job.platforms[match[2] as keyof typeof platforms]);
        } else json(response, 200, job);
      } catch { json(response, 404, { message: 'Audit not found.' }); }
      return;
    }

    if (pathname === '/api/check') {
      if (request.method !== 'POST') {
        response.setHeader('Allow', 'POST');
        json(response, 405, { message: 'Please use POST to submit a URL.' });
        return;
      }
      const origin = request.headers.origin;
      if (origin && origin !== `http://${request.headers.host}` && origin !== `https://${request.headers.host}`) {
        json(response, 403, { message: 'Cross-origin submissions are not allowed.' }); return;
      }
      if (!process.env.OPENAI_API_KEY) {
        json(response, 503, { message: 'Configure OPENAI_API_KEY in the server .env file and restart.' }); return;
      }
      if (isBusy()) { json(response, 429, { message: 'An audit is running. Please wait for it to finish.' }); return; }
      if (!request.headers['content-type']?.startsWith('application/json')) {
        json(response, 415, { message: 'Please submit data in JSON format.' });
        return;
      }
      let body = '';
      for await (const chunk of request) {
        body += chunk.toString();
        if (Buffer.byteLength(body) > 8192) {
          json(response, 413, { message: 'The request body is too large.' });
          return;
        }
      }
      let url: URL;
      let address: string | null = null;
      try {
        const input: unknown = JSON.parse(body);
        if (typeof input !== 'object' || input === null || !('url' in input) || typeof input.url !== 'string') throw new Error();
        url = new URL(input.url);
        if ('target_address' in input && typeof input.target_address === 'string') address = input.target_address.trim().slice(0, 500) || null;
        if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) throw new Error();
        if (url.href.length > 2048 || url.hostname === 'localhost' || !url.hostname.includes('.') || /^[\d.]+$/.test(url.hostname) || url.hostname.includes(':') || /\.(local|internal|localhost)$/.test(url.hostname)) throw new Error();
      } catch {
        json(response, 400, { message: 'Please enter a valid HTTP or HTTPS URL.' });
        return;
      }
      // Re-check after reading the body, so simultaneous submissions cannot bypass the job cap.
      if (isBusy()) { json(response, 429, { message: 'An audit is running.' }); return; }
      const job = await startJob(url.href, address);
      json(response, 202, { id: job.id, result_url: `/results?id=${job.id}` });
      return;
    }

    const asset = assets.get(pathname);
    if (!asset) {
      json(response, 404, { message: 'Page not found.' });
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.setHeader('Allow', 'GET, HEAD');
      json(response, 405, { message: 'Method not allowed.' });
      return;
    }
    const content = await readFile(new URL(asset[0], publicRoot));
    response.writeHead(200, { 'Content-Type': asset[1], 'Cache-Control': 'no-cache' });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch (error) {
    console.error('Request failed.');
    if (!response.headersSent) json(response, 500, { message: 'The service is temporarily unavailable. Please try again later.' });
    else response.end();
  }
});

server.on('error', (error) => {
  console.error('Server failed:', error.message);
  process.exitCode = 1;
});
server.listen(port, host, () => { const address = server.address(); console.log(`GEO Check: http://${host}:${typeof address === 'object' && address ? address.port : port}`); });
