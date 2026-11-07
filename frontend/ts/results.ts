import {renderMenuResults} from './menu-results.js';
import { ensureAuthenticated } from './auth.js';
const id=new URLSearchParams(location.search).get('id');
let timer:ReturnType<typeof setTimeout>;
let stopPending=false;
const stopButton=document.querySelector<HTMLButtonElement>('#stop-audit')!;
const platformNames:Record<string,string>={google_maps:'Google Maps',yelp:'Yelp',tripadvisor:'Tripadvisor',opentable:'OpenTable',doordash:'DoorDash',uber_eats:'Uber Eats',grubhub:'Grubhub',facebook:'Facebook',resy:'Resy',instagram:'Instagram'};
const labels:Record<string,string>={found:'Listing found',matched:'Identity matched',url:'Source page',name:'Restaurant name',address:'Address',phone:'Phone',hours:'Hours (as returned)',rating_raw:'rating_raw',rating:'Rating',review_count:'Review count',followers:'Followers',posts:'Posts',price_level:'Price level',fetched_at:'Collected at',error:'Collection notes'};
function shortReason(value:unknown):string{
 const text=typeof value==='string'?value.replace(/\s+/g,' ').trim():'No failure reason was recorded.';
 if(/^No public listing|^No verified listing/i.test(text))return 'No matching public listing was found.';
 if(/street.number conflict|conflicting street number/i.test(text))return 'matched:false; the candidate has a conflicting street number.';
 if(/Ambiguous branch|Multiple candidate listings/i.test(text))return 'matched:false; multiple listings match the target.';
 if(/Candidate listing found/i.test(text)){
  const matched=text.match(/fields match \(([^)]+)\)/)?.[1],missing=text.match(/Unavailable identity fields: ([^.]+)/)?.[1];
  return `Candidate found but matched:false${matched?`; only ${matched} matches`:''}${missing?` (missing: ${missing})`:''}.`;
 }
 const sentence=text.split(/(?<=[.!?])\s+(?=[A-Z])/)[0];
 return sentence.length<=180?sentence:'Collection failed; check the saved provider diagnostics.';
}
function renderRaw(parent:HTMLElement,value:unknown,depth=0){
 if(value===null||value===undefined){parent.textContent='Not available';parent.classList.add('missing');return;}
 if(Array.isArray(value)){
  if(!value.length){parent.textContent='No entries returned';return;}
  let container=parent;
  if(value.length>5&&value.some(v=>Array.isArray(v))){const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent=`View ${value.length} returned entries`;details.append(summary);parent.append(details);container=details;}
  for(const entry of value){const line=document.createElement('div');line.className='provider-entry';renderRaw(line,entry,depth+1);container.append(line);}return;
 }
 if(typeof value==='object'){
  if('dayOfWeekShort' in value&&'hours' in value){
   const line=document.createElement('div');line.className='hours-line';const day=document.createElement('strong'),hours=document.createElement('span');renderRaw(day,(value as any).dayOfWeekShort);renderRaw(hours,(value as any).hours);line.append(day,hours);parent.append(line);
   const extra=Object.fromEntries(Object.entries(value).filter(([key])=>!['dayOfWeekShort','hours'].includes(key)));
   if(Object.keys(extra).length){const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='More source fields';details.append(summary);renderRaw(details,extra,depth+1);parent.append(details);}return;
  }
  if('day' in value&&'hours' in value&&Object.keys(value).length===2){const line=document.createElement('div');line.className='hours-line';const day=document.createElement('strong'),hours=document.createElement('span');renderRaw(day,(value as any).day);renderRaw(hours,(value as any).hours);line.append(day,hours);parent.append(line);return;}
  const list=document.createElement('dl');list.className='provider-fields';
  for(const [key,entry] of Object.entries(value)){
   const label=document.createElement('dt');label.textContent=key.replace(/_/g,' ').replace(/([a-z])([A-Z])/g,'$1 $2');
   const detail=document.createElement('dd');renderRaw(detail,entry);list.append(label,detail);
  }parent.append(list);return;
 }
 parent.textContent=String(value);
}
function renderValue(td:HTMLTableCellElement,key:string,value:unknown,record?:any){
 if(value===null||value===undefined){td.textContent=key==='error'?'No errors':'Not available';td.className='missing';return;}
 if(key==='found'||key==='matched'){
  td.textContent=key==='matched'?(value?'Matched':'Not matched (matched: false)'):(value?'Found':'Not found');td.className=value?'listing-found':'listing-missing';
  if(key==='found'&&!value){const reason=document.createElement('small');reason.textContent=shortReason(record?.error);td.append(reason);}
  return;
 }
 if(key==='url'&&typeof value==='string'){
  try{const u=new URL(value);if(u.protocol==='https:'){const a=document.createElement('a');a.href=u.href;a.textContent='Open listing';a.target='_blank';a.rel='noopener noreferrer';td.append(a);return;}}catch{}
 }
 renderRaw(td,key==='error'?shortReason(value):value);
}
function renderGroup(selector:string,records:any[],fields:string[]){
 const table=document.querySelector(selector)!;
 const caption=table.querySelector('caption');table.replaceChildren();if(caption)table.append(caption);
 (table.parentElement as HTMLElement).hidden=!records.length;
 const thead=document.createElement('thead'),head=document.createElement('tr');
 for(const key of ['Field',...records.map(r=>platformNames[r.platform]||r.platform)]){const th=document.createElement('th');th.textContent=key;head.append(th);}thead.append(head);table.append(thead);
 const tbody=document.createElement('tbody');
 for(const key of fields){
  const row=document.createElement('tr'),label=document.createElement('th');label.textContent=labels[key]||key;row.append(label);
  for(const r of records){const td=document.createElement('td');renderValue(td,key,r[key],r);row.append(td);}tbody.append(row);
 }table.append(tbody);
}
async function load(){
 try{
  await ensureAuthenticated();const response=await fetch(`/api/audits/${id}`);if(!response.ok)throw Error('Audit unavailable');
  const job=await response.json();
  const isBatch=Array.isArray(job.input?.stores);
  document.querySelector('#audit-title')!.textContent=isBatch?`Restaurant list · ${job.input.stores.length} restaurants`:job.merchant?.name||job.records?.find((r:any)=>r.found&&r.name)?.name||job.input?.name||job.input?.place_id;
  document.querySelector('#audit-status')!.textContent=(job.status==='running'?(job.menu_status==='running'?'Collecting menus from selected platforms':'Collecting with Apify'):job.status==='partial'?'Collection finished with unavailable data':job.status==='completed'?'Collection complete':job.status)+(job.error?`: ${shortReason(job.error)}`:'');
  const running=['running','cancelling'].includes(job.status);(document.querySelector('#audit-loader') as HTMLElement).hidden=!running;
  document.querySelector('#loading-stage')!.textContent=job.status==='cancelling'?'Stopping active Apify runs…':job.menu_status==='running'?'Collecting menus…':'Collecting restaurant information…';
  const started=Date.parse(job.created_at);
  document.querySelector('#loading-time')!.textContent=Number.isFinite(started)?`Elapsed: ${Math.max(0,Math.floor((Date.now()-started)/1000))} seconds`:'Waiting for the next platform result';
  stopButton.hidden=!running;stopButton.disabled=stopPending||job.status==='cancelling';
  stopButton.textContent=stopButton.disabled?'Stopping…':'Stop collection';
  if(!running&&job.status==='cancelled')document.querySelector('#stop-status')!.textContent='Collection stopped.';
  document.querySelector('#audit-detail')!.textContent=job.batch?.directory||job.output_file||'';
  document.querySelector<HTMLElement>('#batch-progress')!.hidden=!isBatch;
  let records=job.records||[];
  if(isBatch){
   const batch=job.batch;
   document.querySelector('#batch-summary')!.textContent=batch?`${batch.completed} of ${batch.total} restaurants processed${batch.current_store_id?` · Current: ${batch.current_store_id}`:''}`:'Preparing restaurant list…';
   const select=document.querySelector<HTMLSelectElement>('#batch-store')!,previous=select.value;
   select.replaceChildren();
   for(const store of batch?.stores||[]){const option=document.createElement('option');option.value=store.id;option.textContent=`${store.input.name||store.input.place_id}${store.input.address?' · '+store.input.address:''} — ${store.status}`;select.append(option);}
   if(previous&&Array.from(select.options).some(o=>o.value===previous))select.value=previous;
   const store=batch?.stores.find((s:any)=>s.id===select.value);
   records=store?.records||[];
   document.querySelector('#batch-store-status')!.textContent=store?`${store.status}${store.error?': '+shortReason(store.error):''}`:'';
  }
  const profile=(r:any)=>['resy','instagram'].includes(r.platform);
  renderGroup('#comparison',records.filter((r:any)=>!profile(r)),['found','matched','url','name','address','phone','hours','rating_raw','rating','review_count','price_level','fetched_at','error']);
  renderGroup('#profiles',records.filter(profile),['found','matched','url','name','address','phone','hours','followers','posts','price_level','fetched_at','error']);
  const list=document.querySelector('#evidence-list')!;list.replaceChildren();
  if(job.output_file){const a=document.createElement('a');a.textContent=`Download ${job.filename}`;a.href=`/api/audits/${id}/output.json`;list.append(a);}
  if(!running&&!job.batch){const report=document.createElement('a');report.textContent='Download complete report (listings + menus + hours)';report.href=`/api/audits/${id}/report.json`;report.className='complete-report-link';list.append(report);}
  for(const store of job.batch?.stores||[]){
   if(!store.output_file||!store.filename)continue;
   const line=document.createElement('p'),a=document.createElement('a');a.textContent=`Download ${store.filename}`;a.href=`/api/audits/${id}/stores/${store.id}.json`;line.append(a);list.append(line);
  }
  renderMenuResults(job,id);
  clearTimeout(timer);if(running)timer=setTimeout(()=>void load(),2000);
 }catch(e){document.querySelector('#audit-status')!.textContent=e instanceof Error?e.message:'Load failed';}
}
stopButton.addEventListener('click',async()=>{
 if(stopPending||stopButton.disabled)return;
 stopPending=true;stopButton.disabled=true;stopButton.textContent='Stopping…';
 const status=document.querySelector('#stop-status')!;status.textContent='Stopping this collection and its active Apify runs…';
 try{
  await ensureAuthenticated();
  const response=await fetch(`/api/audits/${id}/cancel`,{method:'POST',signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('Stop request failed. Please retry.');
  status.textContent='Stop requested. Waiting for active Apify runs to abort.';
 }catch(e){status.textContent=e instanceof Error?e.message:'Stop request failed. Please retry.';}
 finally{stopPending=false;await load();}
});
document.querySelector('#batch-store')!.addEventListener('change',()=>void load());
document.querySelector('#refresh')!.addEventListener('click',()=>void load());void load();

for(const [button,open] of [['#expand-sections',true],['#collapse-sections',false]] as const){
 document.querySelector(button)?.addEventListener('click',()=>{
  for(const section of Array.from(document.querySelectorAll<HTMLDetailsElement>('.result-section:not([hidden])')))section.open=open;
 });
}
