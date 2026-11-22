import '../../../dist/backend/config.js';
import {readFile,writeFile,mkdir,open} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as sleep} from 'node:timers/promises';
import {configuredMediaSources} from '../../../dist/backend/media/sources.js';
import {mediaMentionCatalog,redditMentions} from '../../../dist/backend/media/reddit-mentions.js';
const root=fileURLToPath(new URL('../../../',import.meta.url));
export const actor='trudax~reddit-scraper-lite';
export function inputFor(url){return {startUrls:[{url}],skipComments:false,skipCommunity:true,skipUserPosts:true,searchPosts:false,searchComments:false,searchCommunities:false,searchUsers:false,includeMediaLinks:true,maxItems:150,maxComments:149,maxPostCount:1,maxConcurrency:1,maxRequestRetries:0,proxy:{useApifyProxy:false}};}
export function normalize(rows,url,fetchedAt){
 const target=new URL(url),match=target.pathname.match(/^\/r\/([^/]+)\/comments\/([a-z0-9]+)\//);if(!match)throw Error('Invalid thread URL.');
 const [,subreddit,id]=match,comments=new Map();let post=null,rejected=0;
 for(const r of rows){
  let u;try{u=new URL(r.url);}catch{rejected++;continue;}
  const m=u.pathname.match(/^\/r\/([^/]+)\/comments\/([a-z0-9]+)\/[^/]+(?:\/([a-z0-9]+))?\/?$/);
  if(u.protocol!=='https:'||!['www.reddit.com','reddit.com'].includes(u.hostname)||!m||m[1].toLowerCase()!==subreddit.toLowerCase()||m[2]!==id){rejected++;continue;}
  if(r.dataType==='post'&&r.id==='t3_'+id){post=r;continue;}
  if(r.dataType!=='comment'||!m[3]||r.id!=='t1_'+m[3]||r.parentId!=null&&!/^t[13]_[a-z0-9]+$/.test(r.parentId)||r.parentId?.startsWith('t3_')&&r.parentId!=='t3_'+id){rejected++;continue;}
  const deleted=r.body==='[deleted]'||r.body==='[removed]',body=deleted?null:typeof r.body==='string'?r.body:null;
  const old=comments.get(m[3]);if(old){if(old.body!==body||old.parent_id!==r.parentId)rejected++;if(!deleted)continue;}
  const time=Date.parse(r.createdAt);comments.set(m[3],{id:m[3],parent_id:r.parentId??'',body,permalink:'https://www.reddit.com'+u.pathname,created_utc:Number.isFinite(time)?time/1000:null,deleted});
 }
 if(post&&['[deleted]','[removed]'].includes(post.body))comments.clear();
 const date=v=>Number.isFinite(Date.parse(v))?new Date(v).toISOString():null;
 const sorted=[...comments.values()].sort((a,b)=>(a.created_utc??0)-(b.created_utc??0)||a.id.localeCompare(b.id));
 return {snapshot:{url,post_id:id,fetched_at:fetchedAt,title:typeof post?.title==='string'?post.title:null,published:date(post?.createdAt),updated:null,declared_comments:Number.isInteger(post?.numberOfComments)?post.numberOfComments:null,http_status:null,content_type:'application/json',comments:sorted,unavailable_ids:[],api_calls:0,tree_complete:false,error:'Apify HTML candidate; full folded-reply coverage is not verified.'},rejected};
}
async function request(path,method='GET',body){
 const token=process.env.APIFY_TOKEN;if(!token)throw Error('APIFY_TOKEN is missing.');
 let r;try{r=await fetch('https://api.apify.com/v2/'+path,{method,redirect:'error',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});}catch{throw Error('Apify request could not connect; paid launch is never retried.');}
 if(!r.ok)throw Error('Apify HTTP '+r.status+'; request was not retried.');try{return await r.json();}catch{throw Error('Apify returned invalid JSON.');}
}
async function main(){
 process.chdir(root);const args=process.argv.slice(2);if(args.some(x=>!['--live','--resume'].includes(x))||args.includes('--live')&&args.includes('--resume'))throw Error('Use --live OR --resume, or no flags for a free plan.');
 const sources=configuredMediaSources(JSON.parse(await readFile('samples/step1-media/urls.json','utf8'))).filter(s=>s.page_type==='community');
 const privateDir=resolve('.local/issue20/apify-candidate'),out=resolve('samples/step1-media/candidate-apify');await mkdir(privateDir,{recursive:true});
 const stateFile=join(privateDir,'state.json'),lockFile=join(privateDir,'lock');let state;try{state=JSON.parse(await readFile(stateFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;state={actor,budget_usd:2,reserved_usd:0,runs:[]};}
 if(!args.length){console.log(JSON.stringify({mode:'plan',actor,threads:sources.map(s=>s.url),cap_per_launch_usd:0.25,max_new_reservation_usd:sources.length*.25,already_reserved_usd:state.reserved_usd,output:out,official_api_requirement_met:false}));return;}
 const lock=await open(lockFile,'wx');try{
 const save=()=>writeFile(stateFile,JSON.stringify(state,null,2)+'\n',{mode:0o600});
 if(args.includes('--live')){
  if(state.runs.length)throw Error('Existing paid candidate attempts found. Use --resume; no automatic paid retry.');
  if(state.reserved_usd+sources.length*.25>2)throw Error('Issue #20 budget reservation exceeded.');
  for(const s of sources){
   const entry={url:s.url,cap_usd:.25,status:'launch_pending',run_id:null};state.runs.push(entry);state.reserved_usd+=.25;await save();
   // A failed/ambiguous POST leaves the reservation in place and is never retried.
   const r=await request('acts/'+actor+'/runs?maxTotalChargeUsd=0.25&timeout=180&memory=1024','POST',inputFor(s.url));
   if(!r.data?.id)throw Error('Launch identity unavailable; do not relaunch automatically.');entry.run_id=r.data.id;entry.status=r.data.status;await save();
  }
 }
 for(const e of state.runs){
  if(!e.run_id)throw Error('Uncertain launch requires read-only account reconciliation before any further launch.');
  for(let i=0;i<40;i++){
   const r=(await request('actor-runs/'+encodeURIComponent(e.run_id))).data;e.status=r.status;e.cost_usd=r.usageTotalUsd??null;e.dataset=r.defaultDatasetId;e.finished_at=r.finishedAt??null;await save();
   if(['SUCCEEDED','FAILED','ABORTED','TIMED-OUT'].includes(e.status))break;
   if(i===39)throw Error('Run still active. Use --resume to observe this same run; do not relaunch.');await sleep(5000);
  }
  if(e.dataset){const rows=await request('datasets/'+encodeURIComponent(e.dataset)+'/items?format=json&clean=true&limit=151');await writeFile(join(privateDir,e.run_id+'.json'),JSON.stringify(rows,null,2)+'\n',{mode:0o600});}
 }
 let articles=[];try{articles=JSON.parse(await readFile('.local/issue20/current/articles.json','utf8'));}catch{}
 let reviews=[];try{reviews=JSON.parse(await readFile(join(privateDir,'mentions-reviewed.json'),'utf8')).threads;}catch(e){if(e.code!=='ENOENT')throw e;}
 const targets=JSON.parse(await readFile('backend/media/targets.json','utf8')),catalog=mediaMentionCatalog(articles,targets),candidate=[],evidence=[],templates=[];
 for(const s of sources){const e=state.runs.find(r=>r.url===s.url);let rows=[];if(e?.dataset)rows=JSON.parse(await readFile(join(privateDir,e.run_id+'.json'),'utf8'));const n=normalize(rows,s.url,e?.finished_at??new Date().toISOString()),r=redditMentions(n.snapshot,s,catalog,reviews.find(r=>r.url===s.url));
  r.evidence.source_kind='apify_candidate';r.evidence.count_verified=false;r.evidence.issues.unshift('Alternative Apify HTML collection; does not satisfy the official Reddit API requirement.');
  for(const d of r.evidence.descriptions??[])d.selector=d.selector.replace('official comment body','Apify candidate comment body');
  candidate.push(r.article);evidence.push({...r.evidence,actor_status:e?.status??'not_started',rejected_rows:n.rejected,comments_saved:n.snapshot.comments.length,unknown_parent_comments:n.snapshot.comments.filter(c=>!c.parent_id).length});templates.push(r.template);
 }
 await mkdir(out,{recursive:true});for(const [name,value]of Object.entries({'articles.json':candidate,'evidence.json':evidence,'reddit-review-template.json':{threads:templates},'acceptance.json':{candidate_only:true,official_api_requirement_met:false,ready_for_delivery:false,sources:sources.length,entries:candidate.reduce((n,a)=>n+a.restaurants.length,0),status:state.runs.map(e=>({url:e.url,status:e.status})),comment_tree_verified:false}}))await writeFile(join(out,name),JSON.stringify(value,null,2)+'\n');
 console.log(JSON.stringify({output:out,status:state.runs.map(e=>e.status),comments:evidence.map(e=>e.comments_saved),entries:candidate.reduce((n,a)=>n+a.restaurants.length,0),official_api_requirement_met:false}));
 }finally{await lock.close();const{unlink}=await import('node:fs/promises');await unlink(lockFile);}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{console.error('Candidate operation stopped. Inspect local state and configuration; no secrets or API response bodies are printed. Do not repeat --live after an uncertain launch.');process.exitCode=1;});
