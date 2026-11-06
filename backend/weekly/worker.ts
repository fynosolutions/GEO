import {writeFile} from 'node:fs/promises';
import {collectRestaurant,readVerifiedMenuProviders} from '../public.js';
import {collectMenuAudit} from '../menu-audit/public.js';
import {collectionInputForStore} from './public.js';
const controller=new AbortController();
const progress=(stage:string)=>console.log(new Date().toISOString()+' '+stage);
const heartbeat=setInterval(()=>progress('Collection still running; awaiting bounded provider/document work.'),30000);
process.on('SIGTERM',()=>controller.abort());
const [raw,path]=process.argv.slice(2);
try{
 const store=JSON.parse(raw);
 progress(`Store ${store.id}: listing collection started`);
 const result=await collectRestaurant(collectionInputForStore(store),controller.signal,async record=>progress(`Store ${store.id} / ${record.platform}: ${record.found?'matched':'unavailable'}`));
 if(process.env.MENU_AUDIT_ENABLED==='true'){
  try{
   progress(`Store ${store.id}: menu collection started`);
   const details=await collectMenuAudit({store_id:store.id,name:result.name,address:result.address,website:store.website||result.website,website_verified:!!result.website&&store.website===result.website,websites:[...(store.website?[{url:store.website,verified:store.website===result.website}]:[]),...(result.website?[{url:result.website,verified:true}]:[])],records:result.records,sources:store.menu_sources,provider_results:await readVerifiedMenuProviders(result.directory,result.records)},{signal:controller.signal,discover:true,onProgress:message=>progress(`Store ${store.id}: ${message}`),root:process.env.MENU_OUTPUT_DIR||'out/details'});
   await writeFile(path,JSON.stringify({records:result.records,menu_error:details.summary.coverage_complete?undefined:'Menu channels incomplete; inspect stored menu details.',menu_details:details,menus:details.menus.map(m=>({store_id:store.id,channel:m.channel,source_url:m.url,menu_date:m.menu_date,date_source:m.date_source,menu_id:m.menu_id}))}));
  }catch{await writeFile(path,JSON.stringify({records:result.records,menu_error:'Menu audit failed; basic listing records retained.'}));}
 }else await writeFile(path,JSON.stringify(result.records));
}catch{console.error('Store worker failed; no verified full result was produced.');process.exitCode=1;}finally{clearInterval(heartbeat);}
