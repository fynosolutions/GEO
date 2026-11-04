import {dateRange} from '../menu-audit/dates.js';
// Issue #5 interchange format. An issue #4 adapter must map its final output here.
export type MenuObservation={store_id:string;channel:string;source_url:string;menu_date:string|null;menu_id?:string;date_source:'on_page'|'metadata'|'upload_date'|'unknown'};
export function menuObservations(value:unknown):MenuObservation[]{
 if(!Array.isArray(value))throw Error('Menu observations must be an array.');
 const keys=new Set<string>();
 return value.map(v=>{
  if(!v||typeof v.store_id!=='string'||typeof v.channel!=='string'||!v.channel.trim()||typeof v.source_url!=='string')throw Error('Invalid menu observation.');
  const url=new URL(v.source_url);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw Error('Menu source must be a public HTTP URL.');
  if(!['on_page','metadata','upload_date','unknown'].includes(v.date_source))throw Error('Invalid menu date provenance.');
  if(v.menu_date!==null&&(typeof v.menu_date!=='string'||!dateRange(v.menu_date)))throw Error('Menu date must preserve supported year/month/day/season precision or be null.');
  if(v.menu_id!==undefined&&(typeof v.menu_id!=='string'||!v.menu_id.trim()))throw Error('Invalid menu ID.');
  if((v.menu_date===null)!==(v.date_source==='unknown'))throw Error('Unknown date must have unknown provenance.');
  const key=JSON.stringify([v.store_id,v.channel,v.menu_id??v.source_url]);if(keys.has(key))throw Error('Duplicate menu observation.');keys.add(key);
  return {store_id:v.store_id,channel:v.channel,source_url:v.source_url,menu_date:v.menu_date,date_source:v.date_source,...(v.menu_id?{menu_id:v.menu_id}:{})};
 });
}
export function comparableMenuUrl(value:string):string{
 const u=new URL(value);u.hash='';
 for(const key of [...u.searchParams.keys()])if(/^utm_/i.test(key)||['srsltid','gclid','fbclid','msclkid'].includes(key.toLowerCase()))u.searchParams.delete(key);
 u.searchParams.sort();return u.href;
}
export function menuChanges(current:MenuObservation[],previous:MenuObservation[]){
 return current.flatMap(v=>{
  const old=previous.find(p=>p.store_id===v.store_id&&p.channel===v.channel&&(v.menu_id?p.menu_id===v.menu_id:comparableMenuUrl(p.source_url)===comparableMenuUrl(v.source_url)));
  if(!old||old.menu_date===v.menu_date&&comparableMenuUrl(old.source_url)===comparableMenuUrl(v.source_url))return [];
  return [{...v,old_date:old.menu_date,old_url:old.source_url,note:comparableMenuUrl(old.source_url)!==comparableMenuUrl(v.source_url)?'IMPORTANT: menu source replaced':old.menu_date&&v.menu_date?'IMPORTANT: menu date changed':'Menu date availability changed'}];
 });
}
