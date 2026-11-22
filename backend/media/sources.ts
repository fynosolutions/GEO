import {createHash} from 'node:crypto';import {isIP} from 'node:net';
import type {MediaSource} from './public.js';
export type MediaPageType='list'|'review'|'directory'|'article'|'place'|'community'|'unknown';
const sites:Record<string,string>={'theinfatuation.com':'The Infatuation','ny.eater.com':'Eater NY','timeout.com':'Time Out','guide.michelin.com':'MICHELIN Guide','corner.inc':'Corner','happy-hour.nyc':'Happy Hour NYC','welcometochinatown.com':'Welcome to Chinatown','allyoucaneatguide.com':'All You Can Eat Guide','reddit.com':'Reddit'};
export function publicMediaURL(value:unknown):string{
 if(typeof value!=='string'||value!==value.trim()||value.length>3000)throw Error('Media URL must be a non-empty HTTPS URL.');
 const u=new URL(value),host=u.hostname.toLowerCase();
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash||isIP(host)||host.includes(':')||!host.includes('.')||host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal'))throw Error('Media URLs must use public HTTPS domain names without credentials, ports or fragments.');
 return value;
}
export function mediaPageType(url:string):MediaPageType{
 const u=new URL(url),host=u.hostname.replace(/^www\./,''),p=u.pathname;
 if(host==='reddit.com')return 'community';
 if(host==='theinfatuation.com')return p.includes('/reviews/')?'review':p.includes('/cuisines/')?'directory':p.includes('/guides/')?'list':'unknown';
 if(host==='ny.eater.com')return p.startsWith('/maps/')?'list':'article';
 if(host==='guide.michelin.com')return p.includes('/restaurant/')?'review':'list';
 if(host==='corner.inc')return p.startsWith('/place/')?'place':p.startsWith('/list/')||p.startsWith('/guides/')?'list':'unknown';
 if(host==='timeout.com')return /\/best-|\/best\//.test(p)?'list':'review';
 if(host==='allyoucaneatguide.com')return p.split('/').filter(Boolean).length===1?'directory':'review';
 if(host==='happy-hour.nyc'||host==='welcometochinatown.com')return 'list';return 'unknown';
}
export function configuredMediaSources(value:unknown):MediaSource[]{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==1||!Array.isArray((value as any).urls)||(value as any).urls.length<1||(value as any).urls.length>500)throw Error('Expected {"urls":[...]} with 1–500 URLs.');
 const seen=new Set<string>();return (value as {urls:unknown[]}).urls.map(value=>{
  const url=publicMediaURL(value),u=new URL(url),key=u.href;if(seen.has(key))throw Error('Duplicate media URL.');seen.add(key);
  return {id:createHash('sha256').update(url).digest('hex').slice(0,20),url,site:sites[u.hostname.replace(/^www\./,'')]??u.hostname,priority:0,page_type:mediaPageType(url)};
 });
}
