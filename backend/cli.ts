import { collectRestaurant, collectBatch, parseStoreList } from './public.js';
import {readFile} from 'node:fs/promises';
const args=process.argv.slice(2);
const controller=new AbortController();
const stop=()=>controller.abort();process.once('SIGINT',stop);process.once('SIGTERM',stop);
try{
 const values:Record<string,string>={};
 for(let i=0;i<args.length;i+=2){if(!['--name','--place-id','--address','--platforms','--stores'].includes(args[i])||!args[i+1]||args[i+1].startsWith('--')||values[args[i]])throw Error('Usage: npm run collect -- --stores stores.json [--platforms yelp,instagram] | --name "Restaurant" [--address "Branch address"] | --place-id ID');values[args[i]]=args[i+1];}
 const platforms=values['--platforms']?.split(',').map(v=>v.trim());
 if(values['--stores']){
  if(values['--name']||values['--place-id']||values['--address'])throw Error('Use --stores without --name, --place-id or --address.');
  const stores=parseStoreList(await readFile(values['--stores'],'utf8'));
  const result=await collectBatch({stores,platforms},controller.signal);
  for(const file of Object.values(result.output_files))console.log(file);
  if(controller.signal.aborted)process.exitCode=130;
  else if(result.stores.some(s=>s.status==='failed'))process.exitCode=2;
 }else{
 const result=await collectRestaurant({name:values['--name'],place_id:values['--place-id'],address:values['--address'],platforms},controller.signal);
 console.log(result.output_file);
 if(result.records.every(r=>!r.found))process.exitCode=2;
 if(controller.signal.aborted)process.exitCode=130;
 }
}catch(e){console.error(e instanceof Error?e.message:'Collection failed.');process.exitCode=controller.signal.aborted?130:1;}
finally{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
