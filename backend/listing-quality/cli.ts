import '../config.js';
import {readFile,mkdir,writeFile,readdir,copyFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {collectRestaurant,emptyListing,safeName,domains,matchesIdentity} from '../collection.js';
import {collectApify,type ApifyResult} from '../apify.js';
import {checkWeeklyCredentials} from '../weekly/preflight.js';
import {qualityListing,retryProvider} from './public.js';
import {ReceiptBudget,recoverRemoteResult} from './remote.js';
const args=process.argv.slice(2);
let ownedLock:string|undefined;
try{
 const resumeIndex=args.indexOf('--resume'),resumeSource=resumeIndex>=0?args[resumeIndex+1]:null;
 if(resumeIndex>=0&&(!resumeSource||resumeSource.startsWith('--')))throw Error('Missing resume source');
 if(args.filter((_,i)=>i!==resumeIndex+1||resumeIndex<0).some(x=>!['--live','--help','--resume'].includes(x)))throw Error('Usage: collect:listing-quality [--live] [--resume SOURCE]');
 if(args.includes('--help')){console.log('collect:listing-quality: preflight/estimate by default; --live runs three consecutive captures per store across six stores, capped at $10 total.');process.exit(0);}
 const stores=JSON.parse(await readFile('samples/step1-listing/stores.json','utf8')) as {id:string;name:string;address:string}[];
 if(stores.length!==6||new Set(stores.map(s=>s.address)).size!==6)throw Error('Expected six distinct configured stores');
 const platforms=Object.keys(domains).filter(p=>!['opentable','resy'].includes(p));
 const limit=10,perActor=.05;
 const actorCap=(platform:string)=>['google_maps','_discovery'].includes(platform)?.5:perActor;
 if(!args.includes('--live')){console.log(JSON.stringify({stores:6,rounds:3,platforms,minimum_provider_calls:6*3*(platforms.length+1),per_actor_cap_usd:{default:perActor,google_maps:.5,_discovery:.5},total_cap_usd:limit,warning:'Retries and supplementary discovery add calls; reservation cap may stop acceptance early. No paid calls made.'},null,2));process.exit(0);}
 await checkWeeklyCredentials();
 const prior=JSON.parse(await readFile('.local/issue18/prior-cost-private.json','utf8'));
 if(typeof prior.total_usd!=='number'||prior.total_usd<0||prior.total_usd>=limit)throw Error('Reconciled prior spending is required before live collection.');
 const root=resolve('.local/issue18',new Date().toISOString().replace(/[:.]/g,'-'));await mkdir(root,{recursive:true});
 const lock=resolve('.local/issue18/live.lock');await mkdir(lock);ownedLock=lock;await writeFile(join(lock,'owner.json'),JSON.stringify({pid:process.pid,root,started_at:new Date().toISOString()}));
 const budget=new ReceiptBudget(limit,perActor),attempts:unknown[]=[],rounds:any[][]=[];
 budget.actual=prior.total_usd;budget.reserved=prior.total_usd;
 const controller=new AbortController();process.on('SIGTERM',()=>controller.abort());process.on('SIGINT',()=>controller.abort());
 let exhausted=false,halted=false;
 const checkpoint=async()=>writeFile(join(root,'cost-private.json'),JSON.stringify({reserved_usd:budget.reserved,known_actual_usd:budget.actual,prior_spend_usd:prior.total_usd,attempts,pending:budget.pending,settled:budget.settled},null,2));
 const resume=resumeSource?resolve(resumeSource):null;
 if(resume){const state=JSON.parse(await readFile(join(resume,'acceptance.json'),'utf8'));if(state.complete||!state.halted)throw Error('Only a halted partial capture can be resumed');}
 const samples=[];for(const name of await readdir('samples/step1-listing'))if(name.endsWith('.json')&&name!=='stores.json'){const rows=JSON.parse(await readFile(join('samples/step1-listing',name),'utf8'));if(Array.isArray(rows))samples.push(...rows);}
 const verified=JSON.parse(await readFile('backend/listing-quality/verified-urls.json','utf8'));
 if(!Array.isArray(verified))throw Error('Invalid verified URL configuration');
 samples.push(...verified);
 rounds.push([],[],[]);
 for(const [index,store] of stores.entries()){
  if(exhausted||halted||controller.signal.aborted)break;
  for(let round=1;round<=3&&!exhausted&&!halted&&!controller.signal.aborted;round++){
   const entries=rounds[round-1];
   if(resume){try{const source=join(resume,`run-${round}`,safeName(store.name)+'.json'),rows=JSON.parse(await readFile(source,'utf8'));
    if(rows.length===platforms.length&&rows.every((r:any)=>r.store===(index===0?'020':store.name))&&!rows.some((r:any)=>/Acceptance collection stopped|Uncertain remote Actor state|Store collection did not complete/.test(r.error||''))){
     const dir=join(root,`run-${round}`);await mkdir(dir,{recursive:true});await copyFile(source,join(dir,safeName(store.name)+'.json'));entries.push({store:index===0?'020':store.name,input:store,records:rows});console.log(`Round ${round}, ${store.name}: preserved verified checkpoint`);continue;
    }
   }catch(error:any){if(error.code!=='ENOENT')throw error;}}

   const knownListingUrls:Record<string,string[]>={};
   for(const row of samples)if(row.found&&row.matched&&row.url&&platforms.includes(row.platform)&&matchesIdentity(row,{name:store.name,address:store.address}))(knownListingUrls[row.platform]??=[]).push(row.url);

   const provider:typeof collectApify=async(platform,target,signal)=>{
    if(halted||exhausted||controller.signal.aborted)throw Error('Acceptance collection stopped.');
    if(platform==='doordash'&&!target.listing_url)return {status:'skipped',actor:null,run_id:null,dataset_id:null,collected_at:new Date().toISOString(),note:'DoorDash search mode returned unrelated countries during validation; a verified branch listing URL is required.',items:[],truncated:false,target};
    let outcome;try{outcome=await retryProvider(async()=>{
     const cap=actorCap(platform);
     await budget.refresh();
     try{budget.reserve(cap);}catch(error){exhausted=true;throw error;}
     const raw=await collectApify(platform,target,signal,fetch,{maxChargeUsd:cap});budget.capture(raw,cap);await checkpoint();return raw;
    },{signal,reconcile:async r=>{console.log(`Round ${round}, ${store.name}/${platform}: verifying remote termination before any retry`);return recoverRemoteResult(r,{signal});},onAttempt:async(r,attempt)=>{attempts.push({round,store:store.name,platform,attempt:attempt+1,status:r.status,run_id:r.run_id,item_errors:r.items.filter((v:any)=>v?.error).length,items:r.items.length,observed_at:new Date().toISOString()});await checkpoint();}});}catch(error){halted=true;throw error;}
    return outcome.result;
   };
   let records;
   try{const result=await collectRestaurant({...store,platforms},controller.signal,undefined,{knownListingUrls,apify:provider,outputDirectory:join(root,`raw-${round}-${index}`)});
    const providers=JSON.parse(await readFile(join(result.directory,'providers.json'),'utf8'));
    records=result.records.map(r=>qualityListing(r,providers[r.platform] as ApifyResult));
   }catch{records=platforms.map(p=>qualityListing(emptyListing(p,'Store collection did not complete; inspect private acceptance diagnostics.')));}
   const id=index===0?'020':store.name;
   entries.push({store:id,input:store,records});
   const dir=join(root,`run-${round}`);await mkdir(dir,{recursive:true});await writeFile(join(dir,safeName(store.name)+'.json'),JSON.stringify(records.map(r=>({...r,store:id})),null,2)+'\n');
   await budget.refresh();await checkpoint();
   console.log(`Round ${round}, ${store.name}: ${records.filter(r=>r.found).length}/${records.length} present; reserved $${budget.reserved.toFixed(2)}`);
   if(halted||controller.signal.aborted||exhausted)break;
   if(budget.reserved+perActor>limit){exhausted=true;break;}
  }
 }
 const complete=rounds.length===3&&rounds.every(r=>r.length===6&&r.every(s=>s.records.some((v:any)=>v.found)))&&!exhausted&&!halted&&!controller.signal.aborted;
 const differences:unknown[]=[];
 for(let round=1;round<rounds.length;round++)for(let index=0;index<rounds[round].length;index++){
  const current=rounds[round][index],prior=rounds[round-1][index];if(!prior)continue;
  for(const row of current.records){const old=prior.records.find((r:any)=>r.platform===row.platform);for(const field of ['absence','found','matched','url','rating','review_count','price_level','recommend_text','followers','posts','name','address','phone','hours','error'])if(JSON.stringify(old?.[field])!==JSON.stringify(row[field]))differences.push({store:current.store,platform:row.platform,from_round:round,to_round:round+1,field,old:old?.[field]??null,new:row[field]??null,reason:'Requires source/attempt evidence review; no stability cause inferred.'});}
 }
 await writeFile(join(root,'stability.json'),JSON.stringify({differences,identical:complete&&differences.length===0},null,2));
 await writeFile(join(root,'acceptance.json'),JSON.stringify({complete,rounds:rounds.map(r=>r.length),budget_exhausted:exhausted,halted,stop_reason:exhausted?'budget_reservation':halted?'remote_state_unknown':controller.signal.aborted?'cancelled':complete?'completed':'incomplete_store_results',resumed_from:resume,prior_spend_usd:prior.total_usd,note:'Live results staged privately; verify identities, retries and stability before publishing run-3.'},null,2));
 console.log(root);if(!complete)process.exitCode=2;
}catch(error){console.error(error instanceof Error?error.message:'Listing quality failed');process.exitCode=1;}finally{if(ownedLock)await rm(ownedLock,{recursive:true,force:true});}
