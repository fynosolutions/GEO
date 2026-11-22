import {createServer} from 'node:http';import {randomBytes} from 'node:crypto';import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';import {existsSync} from 'node:fs';import {dirname,join,resolve} from 'node:path';import {fileURLToPath} from 'node:url';
export function redditAuthorizationURL(clientId,redirect,state){
 const u=new URL('https://www.reddit.com/api/v1/authorize');u.search=new URLSearchParams({client_id:clientId,response_type:'code',state,redirect_uri:redirect,duration:'permanent',scope:'read'}).toString();return u.href;
}
export async function saveRefreshToken(token,path=resolve('.env')){
 if(typeof token!=='string'||!token||/[\r\n\0]/.test(token))throw Error('Invalid OAuth refresh token.');
 let current='';try{current=await readFile(path,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
 const line='REDDIT_REFRESH_TOKEN='+JSON.stringify(token),next=/^REDDIT_REFRESH_TOKEN=.*$/m.test(current)?current.replace(/^REDDIT_REFRESH_TOKEN=.*$/gm,()=>line):current+(current&&!current.endsWith('\n')?'\n':'')+line+'\n';
 const privateDir=join(dirname(path),'.local/issue20/auth');await mkdir(privateDir,{recursive:true});const temp=join(privateDir,randomBytes(12).toString('hex')+'.tmp');await writeFile(temp,next,{mode:0o600});await rename(temp,path);
}
async function start(){
 if(existsSync('.env'))process.loadEnvFile('.env');
 const env=process.env;if(!env.REDDIT_CLIENT_ID||!env.REDDIT_CLIENT_SECRET||!env.REDDIT_USER_AGENT)throw Error('Configure approved REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET and REDDIT_USER_AGENT in .env first.');
 const redirect=new URL(env.REDDIT_REDIRECT_URI??'http://127.0.0.1:8765/callback');
 if(redirect.protocol!=='http:'||redirect.hostname!=='127.0.0.1'||redirect.pathname!=='/callback'||redirect.search||redirect.hash||!redirect.port||Number(redirect.port)<1024)throw Error('Use a registered loopback redirect http://127.0.0.1:PORT/callback (PORT >= 1024).');
 const state=randomBytes(32).toString('hex');let busy=false,finished=false;
 const server=createServer(async(req,res)=>{
  const reply=(status,text)=>{res.writeHead(status,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});res.end(text);};
  if(req.method!=='GET'||req.headers.host!==redirect.host)return reply(403,'Local authorization request rejected.');
  const u=new URL(req.url,redirect.origin);
  if(u.pathname==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end('<!doctype html><title>Reddit read authorization</title><p>Use this only after Reddit approves your GEO Data API use.</p><p><a href="/start">Authorize read-only access on Reddit</a></p>');return;}
  if(u.pathname==='/start'){res.writeHead(302,{Location:redditAuthorizationURL(env.REDDIT_CLIENT_ID,redirect.href,state),'Cache-Control':'no-store'});res.end();return;}
  if(u.pathname!=='/callback')return reply(404,'Not found.');
  if(finished||busy||u.searchParams.get('state')!==state)return reply(400,'Invalid or already-used OAuth state.');
  const code=u.searchParams.get('code');if(!code||u.searchParams.has('error'))return reply(400,'Authorization was not granted; no credentials were saved.');
  busy=true;
  try{
   const r=await fetch('https://www.reddit.com/api/v1/access_token',{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:'Basic '+Buffer.from(env.REDDIT_CLIENT_ID+':'+env.REDDIT_CLIENT_SECRET).toString('base64'),'User-Agent':env.REDDIT_USER_AGENT,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:redirect.href})});
   if(!r.ok)throw Error('OAuth exchange failed.');const data=await r.json();if(typeof data.scope!=='string'||!data.scope.split(/[ ,]+/).some(s=>s==='read'||s==='*'))throw Error('Read scope missing.');
   await saveRefreshToken(data.refresh_token);finished=true;reply(200,'Read authorization saved locally in .env. No token was printed. You may close this page.');clearTimeout(timer);server.close();
  }catch{reply(502,'OAuth exchange failed. No token was printed; check the approved application and registered redirect URI.');}finally{busy=false;}
 });
 const timer=setTimeout(()=>server.close(),10*60*1000);timer.unref();server.on('error',()=>{clearTimeout(timer);console.error('Local OAuth callback could not listen on the configured loopback port.');process.exitCode=1;});
 server.listen(Number(redirect.port),'127.0.0.1',()=>console.log('Open '+redirect.origin+'/ in your browser. A read-only grant is requested; credentials are saved only in local .env.'));
 process.once('SIGINT',()=>{clearTimeout(timer);server.close();});
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 if(process.argv.slice(2).join(' ')==='--start')await start().catch(()=>{console.error('Reddit local authorization setup failed. Check the approved client configuration; no credentials were printed.');process.exitCode=1;});
 else console.log('After Reddit grants API access, configure client ID/secret/User-Agent and the registered loopback redirect, then run: npm run reddit:auth -- --start');
}
