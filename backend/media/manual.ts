import {readFile,realpath} from 'node:fs/promises';import {resolve,relative,isAbsolute} from 'node:path';import {createHash} from 'node:crypto';import {load} from 'cheerio';
import type {MediaSource} from './public.js';
export async function readManualMedia(root:string,source:MediaSource){
 const manifest=JSON.parse(await readFile(resolve(root,'manifest.json'),'utf8'));
 if(!Array.isArray(manifest.entries))throw Error('Manual manifest requires entries.');
 const rows=manifest.entries.filter((e:any)=>e.url===source.url&&e.status==='provided');if(!rows.length)return null;if(rows.length!==1)throw Error('Duplicate manual source.');const row=rows[0];
 if(typeof row.file!=='string'||isAbsolute(row.file)||!/^pages\/[a-f0-9]{20}\.html$/.test(row.file)||!Number.isFinite(Date.parse(row.saved_at))||Date.parse(row.saved_at)>Date.now()+60000)throw Error('Invalid manual file or save time.');
 const base=await realpath(root),path=await realpath(resolve(base,row.file)),rel=relative(base,path);if(rel.startsWith('..')||isAbsolute(rel))throw Error('Manual file escapes archive directory.');
 const html=await readFile(path,'utf8');if(Buffer.byteLength(html)>8*1024*1024)throw Error('Manual HTML exceeds limit.');const sha=createHash('sha256').update(html).digest('hex');if(sha!==row.sha256)throw Error('Manual HTML hash mismatch.');
 const $=load(html),identity=$('link[rel="canonical"]').attr('href')??$('meta[property="og:url"]').attr('content');
 const normalize=(u:string)=>{const v=new URL(u);v.hash='';return v.href.replace(/\/$/,'');};
 if(!identity||normalize(new URL(identity,source.url).href)!==normalize(source.url))throw Error('Manual HTML has no matching canonical or og:url identity.');
 if(/awswaf|<title[^>]*>\s*(?:just a moment|access denied|verify you are human|security check)/i.test(html)||!$('h1').text().trim())throw Error('Manual file is a challenge page or has no article heading.');
 return {html,sha256:sha,fetched_at:row.saved_at};
}
