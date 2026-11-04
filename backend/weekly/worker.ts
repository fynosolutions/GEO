import {writeFile} from 'node:fs/promises';
import {collectRestaurant} from '../public.js';
import {collectMenuAudit} from '../menu-audit/public.js';
import {collectionInputForStore} from './public.js';
const controller=new AbortController();
process.on('SIGTERM',()=>controller.abort());
const [raw,path]=process.argv.slice(2);
try{
 const store=JSON.parse(raw);
 const result=await collectRestaurant(collectionInputForStore(store),controller.signal);
 if(process.env.MENU_AUDIT_ENABLED==='true'){
  try{
   const details=await collectMenuAudit({store_id:store.id,name:store.name,address:store.address,website:store.website,records:result.records},{signal:controller.signal,discover:true,root:process.env.MENU_OUTPUT_DIR||'out/details'});
   await writeFile(path,JSON.stringify({records:result.records,menus:details.menus.map(m=>({store_id:store.id,channel:m.channel,source_url:m.url,menu_date:m.menu_date,date_source:m.date_source,menu_id:m.menu_id}))}));
  }catch{await writeFile(path,JSON.stringify({records:result.records,menu_error:'Menu audit failed; basic listing records retained.'}));}
 }else await writeFile(path,JSON.stringify(result.records));
}catch{process.exitCode=1;}
