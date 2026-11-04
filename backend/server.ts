import { createServer, type ServerResponse } from 'node:http';
import { authenticated, sessionCookie } from './auth.js';
import { readFile } from 'node:fs/promises';
import { outputFields as fields, platforms, getJob, isBusy, selectedPlatforms, startJob, cancelJob } from './public.js';

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '127.0.0.1';
const publicRoot = new URL('../public/', import.meta.url);
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/results', ['results.html', 'text/html; charset=utf-8']],
  ['/css/style.css', ['css/style.css', 'text/css; charset=utf-8']],
  ['/js/auth.js', ['js/auth.js', 'text/javascript; charset=utf-8']],
  ['/js/main.js', ['js/main.js', 'text/javascript; charset=utf-8']],
  ['/js/results.js', ['js/results.js', 'text/javascript; charset=utf-8']],
]);

function json(response: ServerResponse, status: number, data: object): void {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(data));
}

const server = createServer(async (request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;

  try {
    if (pathname.startsWith('/api/')) {
      const token = process.env.GEO_API_TOKEN?.trim();
      if(!token&&!['127.0.0.1','::1','localhost'].includes(host)){json(response,503,{message:'Bind the local test UI to loopback or configure GEO_API_TOKEN for remote access.'});return;}
      if(!token){
        let localHost=false;
        try{localHost=['127.0.0.1','[::1]','localhost'].includes(new URL(`http://${request.headers.host}`).hostname);}catch{}
        if(!localHost){json(response,403,{message:'Local test access requires a loopback host.'});return;}
      }
      if (token && !authenticated(request, token)) { response.setHeader('WWW-Authenticate', 'Bearer'); json(response,401,{message:'Authentication required. Enter the access token.'}); return; }
      if (!['GET','HEAD'].includes(request.method || '')) {
        const origin = request.headers.origin;
        if (origin && origin !== `http://${request.headers.host}` && origin !== `https://${request.headers.host}`) { json(response,403,{message:'Cross-origin request rejected.'}); return; }
      }
      if (pathname === '/api/session' && ['GET','POST'].includes(request.method || '')) {
        if (token && request.method === 'POST') response.setHeader('Set-Cookie', sessionCookie(token, process.env.COOKIE_SECURE === 'true'));
        json(response,200,{authenticated:true}); return;
      }
    }
    if (pathname === '/api/health' && request.method === 'GET') {
      json(response, 200, { status: 'ok', apifyEnabled:Boolean(process.env.APIFY_TOKEN)&&process.env.APIFY_ENABLED!=='false', fields, platforms });
      return;
    }

    const cancel = pathname.match(/^\/api\/audits\/([a-f0-9-]{36})\/cancel$/);
    if(cancel && request.method==='POST') {
      const origin=request.headers.origin;
      if(origin && origin!==`http://${request.headers.host}` && origin!==`https://${request.headers.host}`) {json(response,403,{message:'Cross-origin request rejected.'});return;}
      try {json(response,202,await cancelJob(cancel[1]));}catch{json(response,404,{message:'Audit not found.'});} return;
    }
    const match=pathname.match(/^\/api\/audits\/([a-f0-9-]{36})(\/output\.json)?$/);
    if(match&&request.method==='GET'){
     try{
      const job=await getJob(match[1]);
      if(match[2]){
       if(!job.output_file){json(response,409,{message:'Output file is not ready.'});return;}
       const content=await readFile(job.output_file);
       const encoded=encodeURIComponent(job.filename!).replace(/[!'()*]/g,c=>`%${c.charCodeAt(0).toString(16).toUpperCase()}`);
       response.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Content-Disposition':`attachment; filename="restaurant.json"; filename*=UTF-8''${encoded}`});response.end(content);
      }else json(response,200,job);
     }catch{json(response,404,{message:'Audit not found.'});}return;
    }

    if (pathname === '/api/check') {
      if (request.method !== 'POST') {
        response.setHeader('Allow', 'POST');
        json(response, 405, { message: 'Please use POST to start collection.' });
        return;
      }
      const origin = request.headers.origin;
      if (origin && origin !== `http://${request.headers.host}` && origin !== `https://${request.headers.host}`) {
        json(response, 403, { message: 'Cross-origin submissions are not allowed.' }); return;
      }
      if (!process.env.APIFY_TOKEN) {
        json(response, 503, { message: 'Configure APIFY_TOKEN in the server .env file and restart.' }); return;
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
      let collectionInput: import('./public.js').CollectionInput = {};
      let address: string | null = null;
      try {
        const input: unknown = JSON.parse(body);
        if (!input || typeof input!=='object')throw new Error();
        const data=input as Record<string,unknown>;
        address=typeof data.target_address==='string'?data.target_address.trim().slice(0,500)||null:null;
        collectionInput={name:typeof data.name==='string'?data.name.trim().slice(0,500):undefined,place_id:typeof data.place_id==='string'?data.place_id.trim().slice(0,500):undefined,address:address||undefined,platforms:selectedPlatforms(data.platforms)};
        if((!!collectionInput.name)===(!!collectionInput.place_id)||'url' in data)throw new Error();
      } catch {
        json(response, 400, { message: 'Provide either a restaurant name or Google place ID, with an optional branch address and at least one valid selected platform.' });
        return;
      }
      // Re-check after reading the body, so simultaneous submissions cannot bypass the job cap.
      if (isBusy()) { json(response, 429, { message: 'An audit is running.' }); return; }
      const job = await startJob(collectionInput);
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
