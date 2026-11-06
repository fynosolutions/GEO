import '../config.js';
import {readFile} from 'node:fs/promises';
import {collectRestaurant,readVerifiedMenuProviders} from '../public.js';
import {storesFrom,collectionInputForStore} from '../weekly/public.js';
import {collectMenuAudit} from './public.js';
try{
 const args=process.argv.slice(2),opts:Record<string,string>={};
 for(let i=0;i<args.length;i+=2){if(!['--stores','--store','--records','--sources'].includes(args[i])||!args[i+1]||opts[args[i]])throw Error('Usage: collect:details --stores stores.json --store ID [--records snapshot.json] [--sources sources.json]');opts[args[i]]=args[i+1];}
 const stores=storesFrom(JSON.parse(await readFile(opts['--stores']??'stores.json','utf8'))),store=stores.find(s=>s.id===opts['--store']);if(!store)throw Error('Select a configured store ID.');
 const collected=opts['--records']?null:await collectRestaurant(collectionInputForStore(store));
 const records=collected?collected.records:JSON.parse(await readFile(opts['--records'],'utf8'));
 const provider_results=collected?await readVerifiedMenuProviders(collected.directory,collected.records):undefined;
 const sources=opts['--sources']?JSON.parse(await readFile(opts['--sources'],'utf8')):undefined;
 const result=await collectMenuAudit({store_id:store.id,name:store.name,address:store.address,website:store.website||collected?.website,website_verified:!!collected?.website&&store.website===collected.website,websites:[...(store.website?[{url:store.website,verified:store.website===collected?.website}]:[]),...(collected?.website?[{url:collected.website,verified:true}]:[])],records,sources,provider_results},{discover:true});console.log(result.directory);
 if(!result.summary.coverage_complete)process.exitCode=2;
}catch(e){console.error(e instanceof Error?e.message:'Menu audit failed.');process.exitCode=1;}
