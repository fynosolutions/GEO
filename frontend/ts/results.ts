import {renderMenuResults} from './menu-results.js';
import { ensureAuthenticated } from './auth.js';
const id=new URLSearchParams(location.search).get('id');
let timer:ReturnType<typeof setTimeout>;
const platformNames:Record<string,string>={google_maps:'Google Maps',yelp:'Yelp',tripadvisor:'Tripadvisor',opentable:'OpenTable',doordash:'DoorDash',uber_eats:'Uber Eats',grubhub:'Grubhub',facebook:'Facebook'};
const labels:Record<string,string>={found:'Listing found',matched:'Identity matched',url:'Source page',name:'Restaurant name',address:'Address',phone:'Phone',hours:'Hours (as returned)',rating:'Rating',review_count:'Review count',price_level:'Price level',fetched_at:'Collected at',error:'Collection notes'};
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
function renderValue(td:HTMLTableCellElement,key:string,value:unknown){
 if(value===null||value===undefined){td.textContent=key==='error'?'No errors':'Not available';td.className='missing';return;}
 if(key==='found'||key==='matched'){td.textContent=key==='matched'?(value?'Matched':'Not matched'):(value?'Found':'Not found');td.className=value?'listing-found':'listing-missing';return;}
 if(key==='url'&&typeof value==='string'){
  try{const u=new URL(value);if(u.protocol==='https:'){const a=document.createElement('a');a.href=u.href;a.textContent='Open listing';a.target='_blank';a.rel='noopener noreferrer';td.append(a);return;}}catch{}
 }
 renderRaw(td,value);
}
async function load(){
 try{
  await ensureAuthenticated();const response=await fetch(`/api/audits/${id}`);if(!response.ok)throw Error('Audit unavailable');
  const job=await response.json();document.querySelector('#audit-title')!.textContent=job.merchant?.name||job.records?.find((r:any)=>r.found&&r.name)?.name||job.input?.name||job.input?.place_id;
  document.querySelector('#audit-status')!.textContent=(job.status==='running'?(job.menu_status==='running'?'Collecting menus from selected platforms':'Collecting with Apify'):job.status==='partial'?'Collection finished with unavailable data':job.status==='completed'?'Collection complete':job.status)+(job.error?`: ${job.error}`:'');
  const running=['running','cancelling'].includes(job.status);(document.querySelector('#audit-loader') as HTMLElement).hidden=!running;
  document.querySelector('#audit-detail')!.textContent=job.output_file||'';
  const table=document.querySelector('#comparison')!;table.replaceChildren();
  const records=job.records||[];
  const head=document.createElement('tr');for(const key of ['Field',...records.map((r:any)=>platformNames[r.platform]||r.platform)]){const th=document.createElement('th');th.textContent=key;head.append(th);}table.append(head);
  for(const key of ['found','matched','url','name','address','phone','hours','rating','review_count','price_level','fetched_at','error']){
   const row=document.createElement('tr');const label=document.createElement('th');label.textContent=labels[key]||key;row.append(label);
   for(const r of records){const td=document.createElement('td');renderValue(td,key,r[key]);row.append(td);}table.append(row);
  }
  const list=document.querySelector('#evidence-list')!;list.replaceChildren();
  if(job.output_file){const a=document.createElement('a');a.textContent=`Download ${job.filename}`;a.href=`/api/audits/${id}/output.json`;list.append(a);}
  if(!running){const report=document.createElement('a');report.textContent='Download complete report (listings + menus + hours)';report.href=`/api/audits/${id}/report.json`;report.className='complete-report-link';list.append(report);}
  renderMenuResults(job,id);
  clearTimeout(timer);if(running)timer=setTimeout(()=>void load(),2000);
 }catch(e){document.querySelector('#audit-status')!.textContent=e instanceof Error?e.message:'Load failed';}
}
document.querySelector('#refresh')!.addEventListener('click',()=>void load());void load();

for(const [button,open] of [['#expand-sections',true],['#collapse-sections',false]] as const){
 document.querySelector(button)?.addEventListener('click',()=>{
  for(const section of Array.from(document.querySelectorAll<HTMLDetailsElement>('.result-section:not([hidden])')))section.open=open;
 });
}
