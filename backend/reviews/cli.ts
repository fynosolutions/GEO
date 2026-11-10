import '../config.js';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {reviewStores,reviewPlatforms,reviewFilename,normalizeReviews,type ReviewPlatform} from './public.js';
import {cachedReviews,lockCache,atomicJSON} from './provider.js';
const args=process.argv.slice(2),opts:Record<string,string>={},controller=new AbortController();
const stop=()=>controller.abort();process.once('SIGINT',stop);process.once('SIGTERM',stop);
let unlock:(()=>Promise<void>)|undefined;
try{
 for(let i=0;i<args.length;i+=2){if(!['--stores','--output','--cache','--limit','--budget','--run-cap','--only','--platforms','--cache-only'].includes(args[i])||!args[i+1]||args[i+1].startsWith('--')||opts[args[i]])throw Error('Usage: collect:reviews --stores FILE [--only STORE_ID] [--limit 200] [--cache-only true]');opts[args[i]]=args[i+1];}
 if(opts['--cache-only']&&!['true','false'].includes(opts['--cache-only']))throw Error('cache-only must be true or false.');
 const limit=Number(opts['--limit']??200),budget=Number(opts['--budget']??5),runCap=Number(opts['--run-cap']??0.5);
 if(!Number.isInteger(limit)||limit<1||limit>200)throw Error('Review limit must be 1–200.');
 const stores=reviewStores(JSON.parse(await readFile(opts['--stores']??'samples/step1-reviews/stores.json','utf8'))).filter(s=>!opts['--only']||s.id===opts['--only']);
 if(!stores.length)throw Error('Selected review store does not exist.');
 const platforms=(opts['--platforms']??reviewPlatforms.join(',')).split(',') as ReviewPlatform[];
 if(!platforms.length||new Set(platforms).size!==platforms.length||platforms.some(p=>!reviewPlatforms.includes(p)))throw Error('Select google_maps and/or yelp.');
 const root=resolve(opts['--cache']??'.local/issue14'),out=resolve(opts['--output']??'samples/step1-reviews');
 await mkdir(out,{recursive:true});unlock=await lockCache(root);let partial=false;
 for(const store of stores){
  const path=join(out,reviewFilename(store));let records:any[]=[];
  try{records=JSON.parse(await readFile(path,'utf8'));if(!Array.isArray(records))throw Error('Existing review output must be an array.');}catch(e:any){if(e.code!=='ENOENT')throw e;}
  for(const platform of platforms){
   if(controller.signal.aborted)break;
   console.log(new Date().toISOString()+' '+store.id+' '+platform+' reviews');
   try{
    const run=await cachedReviews(store,platform,limit,{root,budget,runCap,cacheOnly:opts['--cache-only']==='true',signal:controller.signal});
    const {result}=run;
    const value=normalizeReviews(platform,result.items,store,limit,result.collected_at,['unverified','success','empty'].includes(result.status)?(result.truncated?'Provider dataset was truncated.':null):result.note);
    records=records.filter(r=>r.platform!==platform);records.push(value.record);
    await atomicJSON(path,reviewPlatforms.flatMap(p=>records.filter(r=>r.platform===p)));
    await atomicJSON(join(root,store.id+'-'+platform+'-evidence.json'),{store_id:store.id,platform,cache_key:run.key,run_id:result.run_id,limit,cached:run.cached,...value.evidence});
    console.log(JSON.stringify({store:store.id,platform,reviews:value.record.reviews.length,total:value.record.total_reviews,complete:value.evidence.complete,cached:run.cached,charged_or_reserved_usd:run.cost,error:value.record.error}));
    if(!value.evidence.complete||value.record.error)partial=true;
   }catch(e){
    partial=true;const error=e instanceof Error?e.message:'Review collection failed.';
    const existing=records.find(r=>r.platform===platform);
    if(!existing?.reviews?.length){const {record}=normalizeReviews(platform,[],store,limit,undefined,error);records=records.filter(r=>r.platform!==platform);records.push(record);await atomicJSON(path,reviewPlatforms.flatMap(p=>records.filter(r=>r.platform===p)));}
    await atomicJSON(join(root,store.id+'-'+platform+'-last-error.json'),{platform,error,attempted_at:new Date().toISOString(),kept_existing_output:!!existing?.reviews?.length});
    console.error(store.id+' '+platform+': '+error);
   }
  }
  console.log(path);if(controller.signal.aborted)break;
 }
 process.exitCode=controller.signal.aborted?130:partial?2:0;
}catch(e){console.error(e instanceof Error?e.message:'Review collection failed.');process.exitCode=1;}
finally{await unlock?.();process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
