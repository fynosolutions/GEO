import {createHash} from 'node:crypto';import {mkdir,readFile,writeFile} from 'node:fs/promises';import {join} from 'node:path';
import type {MediaSource} from './public.js';import {publicMediaURL} from './sources.js';
export type MediaCapture={url:string;fetched_at:string;status:number|null;final_url:string;content_type:string|null;bytes:number;sha256:string|null;error:string|null};
export async function fetchMediaPage(source:MediaSource,transport:typeof fetch=fetch,timeoutMs=30000){
 const meta:MediaCapture={url:source.url,fetched_at:new Date().toISOString(),status:null,final_url:source.url,content_type:null,bytes:0,sha256:null,error:null};let html='';
 try{
  let url=publicMediaURL(source.url);const signal=AbortSignal.timeout(timeoutMs);
  for(let hop=0;hop<=5;hop++){
   meta.final_url=url;const r=await transport(url,{redirect:'manual',signal,headers:{'User-Agent':'GEO-Research/1.0','Accept':'text/html,application/xhtml+xml'}});meta.status=r.status;
   if([301,302,303,307,308].includes(r.status)){
    const location=r.headers.get('location');await r.body?.cancel();if(!location)throw Error('Redirect without Location.');if(hop===5)throw Error('Redirect limit exceeded.');url=publicMediaURL(new URL(location,url).href);continue;
   }
   meta.content_type=r.headers.get('content-type');const limit=8*1024*1024,reader=r.body?.getReader(),chunks:Uint8Array[]=[];let bytes=0;
   if(reader)while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>limit){await reader.cancel();throw Error('Page exceeds 8 MiB capture limit.');}chunks.push(value);}
   const buffer=Buffer.concat(chunks);meta.bytes=buffer.length;meta.sha256=createHash('sha256').update(buffer).digest('hex');html=buffer.toString('utf8');break;
  }
 }catch(e){meta.error=e instanceof Error?e.message:'Media request failed.';}
 return {html,meta};
}
export async function saveMediaCapture(root:string,source:MediaSource,capture:Awaited<ReturnType<typeof fetchMediaPage>>){
 await mkdir(root,{recursive:true});await writeFile(join(root,source.id+'.html'),capture.html);await writeFile(join(root,source.id+'.json'),JSON.stringify(capture.meta,null,2)+'\n');
}
export async function readMediaCapture(root:string,source:MediaSource){
 const html=await readFile(join(root,source.id+'.html'),'utf8'),meta:MediaCapture=JSON.parse(await readFile(join(root,source.id+'.json'),'utf8'));
 if(meta.url!==source.url||!Number.isFinite(Date.parse(meta.fetched_at))||meta.sha256!==createHash('sha256').update(html).digest('hex'))throw Error('Cached media identity, timestamp or content hash is invalid.');return {html,meta};
}
