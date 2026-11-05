import type {ApifyResult} from '../apify.js';
import {mapApify,type Listing} from '../public.js';
import {createHash} from 'node:crypto';
export function structuredMenu(platform:string,raw:ApifyResult,record:Listing,full:boolean){
 if(!record.matched||!record.found||!record.name||!record.address)return null;
 const accepted=raw.items.filter(item=>mapApify(platform,{...raw,items:[item]},{name:record.name!,address:record.address,phone:record.phone}).matched);
 const text=(value:unknown)=>typeof value==='string'&&value.trim()?value:null;
 const entries:any[]=[];
 for(const item of accepted as any[]){
  if(['uber_eats','grubhub'].includes(platform)&&Array.isArray(item.menuItems))entries.push(...item.menuItems.filter((v:any)=>v&&typeof v==='object').map((v:any)=>({...v,category:text(v.category)||text(v.section),currency:text(v.currency)||text(v.price?.currency)||text(item.currencyCode)})));
  if(platform==='doordash')for(const [key,value] of Object.entries(item))if(key.startsWith('item_list')&&value&&typeof value==='object'&&Array.isArray((value as any).items))entries.push(...(value as any).items.filter((v:any)=>v&&typeof v==='object').map((v:any)=>({...v,category:text(v.category)||text(v.section)||text((value as any).name)})));
 }
 const unique=[...new Map(entries.filter(v=>v&&typeof v.name==='string').map(v=>[String(v.id??JSON.stringify([v.name,v.section,v.price])),v])).values()];
 if(!unique.length||!record.url)return null;
 const items=full?unique.map(v=>({name:v.name,category:v.category??null,variant:text(v.variant),price:v.price??null,currency:v.currency??v.price?.currency??null,url:record.url,fetched_at:raw.collected_at})):[];
 const prices=full?unique.filter(v=>v.price!==null&&v.price!==undefined).map(v=>({name:v.name,category:v.category??null,variant:text(v.variant),price:v.price,currency:v.currency??v.price?.currency??null,evidence:JSON.stringify(v)})):[];
 return {menu:{channel:'delivery_menu',platform,url:record.url,format:'html',menu_date:null,date_source:'unknown',fetched_at:raw.collected_at,menu_id:`${platform}:main`,date_text:null,freshness:'unknown_date',year:null,extraction:'apify-structured',actor:raw.actor,actor_run_id:raw.run_id,item_count:unique.length,items_collected:full,items,sha256:createHash('sha256').update(JSON.stringify(unique)).digest('hex')},prices};
}
