import {comparisonFields,versionCandidates,hasCoreData} from './comparison.js';
type Platform = { platform: string; status: string; collection_method?: string; browser_attempts?: {status:string;url:string;note:string|null;screenshot:string|null}[]; source_url: string | null; collected_at: string | null; status_note: string | null;
 apify?:{status:string;actor:string|null;note:string;items:unknown[];truncated:boolean;run_id:string|null;review_themes?:{value:string|null;sample_size:number;quotes:string[]}};
 conflicts?:{field:string;retained:string;alternative:string}[];
 values: Record<string, string | null>; evidence: { field: string; excerpt: string; url: string;scope?:string;screenshot?:string;needs_review?:boolean }[];
 review_metadata: { source_type: string | null; sample_size: number | null; sampling_method: string | null; newest_sort_verified: boolean } };
type Audit = { id: string; website_url: string; status: string; error: string | null; merchant: { name: string | null; address: string | null; note: string | null } | null; platforms: Record<string, Platform> };
const id = new URLSearchParams(location.search).get('id');
const statusEl = document.querySelector<HTMLElement>('#audit-status')!;
const refresh = document.querySelector<HTMLButtonElement>('#refresh')!;
let showUnavailable=false;
const platformToggle=document.createElement('button');platformToggle.type='button';platformToggle.textContent='Show unavailable platforms';platformToggle.setAttribute('aria-pressed','false');
const fieldSummary=document.createElement('p');fieldSummary.className='form-note';
document.querySelector('.comparison-scroll')!.before(platformToggle,fieldSummary);
platformToggle.addEventListener('click',()=>{showUnavailable=!showUnavailable;platformToggle.setAttribute('aria-pressed',String(showUnavailable));platformToggle.textContent=showUnavailable?'Hide unavailable platforms':'Show unavailable platforms';void load();});
const stop = document.createElement('button');stop.id='stop-audit';stop.textContent='Stop search';stop.type='button';stop.hidden=true;document.querySelector('#audit-loader')!.after(stop);
stop.addEventListener('click',async()=>{
 stop.disabled=true;
 try {const response=await fetch(`/api/audits/${id}/cancel`,{method:'POST'});if(!response.ok)throw new Error('Could not stop audit.');await load();}
 catch(e){statusEl.textContent=e instanceof Error?e.message:'Stop failed.';stop.disabled=false;}
});
const loader = document.querySelector<HTMLElement>('#audit-loader')!;
const stage = document.querySelector<HTMLElement>('#loading-stage')!;
const elapsed = document.querySelector<HTMLElement>('#loading-time')!;
let startedAt = Date.now();
setInterval(() => { if (!loader.hidden) elapsed.textContent = `Elapsed ${Math.max(0, Math.floor((Date.now() - startedAt) / 1000))}s · Queries may take several minutes. You can keep this page open.`; }, 1000);
function element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) {
 const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node;
}
function link(label: string, url: string): HTMLElement {
 try { const destination=/^(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/|$)/i.test(url)?`https://${url}`:url; const target = new URL(destination, location.origin); if (!['http:', 'https:'].includes(target.protocol)) return element('span', label);
 const a = element('a', label); a.href = target.href; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a;
 } catch { return element('span', label); }
}
function providerValue(value:unknown,depth=0):HTMLElement {
 if(value===null||value===undefined)return element('code','null');
 if(typeof value==='string')return /^https?:\/\//i.test(value)?link(value,value):element('span',value);
 if(typeof value!=='object')return element('span',String(value));
 if(!Array.isArray(value)&&Object.keys(value).length===2&&'day' in value&&'hours' in value&&typeof value.day==='string'&&typeof value.hours==='string')return element('span',`${value.day}: ${value.hours}`);
 if(depth>=4){const detail=element('details');detail.append(element('summary','View nested data'),element('pre',JSON.stringify(value,null,2)));return detail;}
 if(Array.isArray(value)){
  if(!value.length)return element('code','[]');
  const list=element('ul');list.className='provider-list';
  const append=(items:unknown[],target:HTMLElement)=>{for(const item of items){const li=element('li');li.append(providerValue(item,depth+1));target.append(li);}};
  append(value.slice(0,5),list);
  if(value.length<=5)return list;
  const container=element('div'),more=element('details');more.append(element('summary',`Show ${value.length-5} more`));
  // Defer large review/menu lists until opened; preserve every value in the raw download.
  more.addEventListener('toggle',()=>{if(more.open&&more.childElementCount===1){const rest=element('ul');rest.className='provider-list';append(value.slice(5),rest);more.append(rest);}});
  container.append(list,more);return container;
 }
 const entries=Object.entries(value);if(!entries.length)return element('code','{}');
 const dl=element('dl');dl.className='provider-object';
 for(const [key,item]of entries){const label=element('dt',key),data=element('dd');data.append(providerValue(item,depth+1));dl.append(label,data);}return dl;
}
function providerHours(value:unknown):HTMLElement{
 const object=value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;
 if(object&&Array.isArray(object.weekRanges)){
  const dl=element('dl');dl.className='provider-object';
  for(const [index,ranges]of object.weekRanges.entries()){
   const dd=element('dd');
   if(Array.isArray(ranges)&&ranges.every(r=>r&&typeof r.openHours==='string'&&typeof r.closeHours==='string'))dd.textContent=ranges.map(r=>`${r.openHours} – ${r.closeHours}`).join('; ')||'[]';else dd.append(providerValue(ranges));
   dl.append(element('dt',`weekRanges[${index}]`),dd);
  }return dl;
 }
 if(Array.isArray(value)&&value.every(v=>v&&typeof v==='object'&&'dayOfWeek' in v&&Array.isArray(v.timeRanges))){const list=element('ul');list.className='provider-list';for(const v of value)list.append(element('li',`dayOfWeek ${v.dayOfWeek}: ${v.timeRanges.join('; ')}`));return list;}
 return providerValue(value);
}
let pending = false;
let timer: ReturnType<typeof setTimeout> | undefined;
async function load() {
 if (pending) return; clearTimeout(timer); pending = true; refresh.disabled = true;
 try {
  if (!id || !/^[a-f0-9-]{36}$/.test(id)) throw new Error('Missing or invalid audit ID. Start a new audit.');
  const [response, configResponse] = await Promise.all([fetch(`/api/audits/${id}`, { signal: AbortSignal.timeout(15000) }), fetch('/api/health')]);
  if (!response.ok || !configResponse.ok) throw new Error('Could not load audit. Check the server and refresh.');
  const job: Audit = await response.json(); const config = await configResponse.json() as { fields: Record<string, string> };
  document.querySelector('#audit-title')!.textContent = job.merchant?.name || 'Restaurant platform comparison';
  const list = Object.entries(job.platforms);
  const finished = list.filter(([, p]) => !['queued','running','browser_running','vision_running','apify_running'].includes(p.status)).length;
  startedAt = Date.parse((job as Audit & { created_at: string }).created_at) || startedAt;
  loader.hidden = !['running','cancelling'].includes(job.status);
  stop.hidden = !['running','cancelling'].includes(job.status);stop.disabled=job.status==='cancelling';
  stop.textContent=job.status==='cancelling'?'Stopping…':'Stop search';
  document.querySelector('#comparison')!.setAttribute('aria-busy', String(job.status === 'running'));
  const querying = list.filter(([,p]) => ['running','browser_running','vision_running','apify_running'].includes(p.status)).map(([,p]) => `${p.platform}${p.status==='vision_running'?' (reading screenshots)':p.status==='browser_running'?' (browser)':''}`);
  stage.textContent = !job.merchant ? 'Identifying the restaurant from its official website…' : querying.length ? `Querying ${querying.join(' and ')}…` : 'Preparing platform queries…';
  statusEl.textContent = `${job.status} · ${finished}/${list.length} sources processed`;
  document.querySelector('#audit-detail')!.textContent = [job.website_url, job.merchant?.address, job.merchant?.note, job.error].filter(Boolean).join(' · ');
  const visible=list.filter(([,p])=>showUnavailable||hasCoreData(p));
  const row = element('tr'); row.append(element('th','Field'));
  for (const [key,p] of visible) { const th = element('th'); th.scope = 'col'; th.append(element('div',p.platform), element('small',`${p.status} · ${p.collection_method || 'web_search'}`));
   if(p.apify)th.append(element('small',`Apify: ${p.apify.status}${p.apify.items.length?' · branch not verified':''}`));
   const a = link('Download JSON', `/api/audits/${id}/${key}.json`); th.append(a); row.append(th); }
  document.querySelector('#comparison thead')!.replaceChildren(row);
  const rows:HTMLTableRowElement[]=[];
  for(const [field,label]of Object.entries(comparisonFields))for(const version of ['multi','apify'] as const){
   const count=visible.filter(([,p])=>versionCandidates(p,field,version).length).length;
   const tr=element('tr'),heading=element('th',version==='apify'?'apify_'+field:field);heading.scope='row';heading.title=label;heading.append(element('small',count+'/'+visible.length+' sources'));tr.append(heading);
   for(const [,p]of visible){const td=element('td');td.className='provider-cell';const options=versionCandidates(p,field,version);
    if(!options.length){td.classList.add('missing');td.append(element('span','—'));td.title='Not collected; raw JSON retains null.';}
    else{
     const chosen=options[0];td.append(field==='opening_hours'&&version==='apify'?providerHours(chosen.value):providerValue(chosen.value),element('small',chosen.source==='Apify'?'Apify · '+chosen.key:(p.evidence.filter(e=>e.field===field).map(e=>e.scope||'web_search').filter((v,i,a)=>a.indexOf(v)===i).join(' · ')||'Website / search')));
     if(options.length>1){const extra=element('details');extra.append(element('summary','Other path value'));for(const alternative of options.slice(1)){extra.append(element('small',alternative.source+' · '+alternative.key),providerValue(alternative.value));}td.append(extra);}
     if(field==='review_themes')td.append(element('small',version==='apify'?`AI summary of ${p.apify?.review_themes?.sample_size??'unknown'} Apify review texts; sample only`:(p.review_metadata.source_type||'Review information')+' · '+(p.review_metadata.sample_size??'unknown')+' visible reviews; sample only'));
     if(field==='opening_hours'&&version==='apify'&&typeof chosen.value==='object')td.append(element('small','Provider time structure; numeric weekday/time values and timezone are not inferred.'));
    }tr.append(td);
   }rows.push(tr);
  }
  document.querySelector('#comparison tbody')!.replaceChildren(...rows);
  fieldSummary.textContent='Showing '+rows.length+' unified fields (multi-path + Apify) across '+visible.length+' sources. '+(list.length-visible.length)+' unavailable sources hidden; see platform status below. — means not collected. Raw JSON retains all fields and original values.';
  const evidenceNodes = list.map(([,p]) => { const details = element('details'); details.append(element('summary',`${p.platform} · ${p.status}${p.apify?` · Apify: ${p.apify.status} (${p.apify.items.length} records)`:''}`));
   if (p.source_url) details.append(link(p.source_url,p.source_url));
   details.append(element('p',`Collected: ${p.collected_at || 'not collected'}`));
   if (p.status_note) details.append(element('p',p.status_note));
   if(p.apify){const keys=new Set(p.apify.items.flatMap(item=>item&&typeof item==='object'&&!Array.isArray(item)?Object.keys(item):[]));const raw=element('details');raw.append(element('summary',`Apify · ${p.apify.status} · ${p.apify.items.length} records · ${keys.size} top-level fields`),element('p',`${p.apify.actor||''} · ${p.apify.note}${p.apify.truncated?' Record limit reached; dataset truncated.':''}`),element('pre',JSON.stringify(p.apify.items,null,2)));details.append(raw);}
   for (const attempt of p.browser_attempts || []) { details.append(element('p',`Browser: ${attempt.status==='readable'?'Page loaded (not proof of verified restaurant fields)':attempt.status} · ${attempt.note || ''}`)); if(attempt.screenshot) details.append(link('Browser screenshot',`/api/audits/${id}/screenshots/${attempt.screenshot}`)); }
   for (const e of p.evidence) { const quote=element('blockquote',`${config.fields[e.field] || e.field}: ${e.excerpt}`); quote.append(link(' Source',e.url));if(e.screenshot)quote.append(link(' Screenshot evidence',`/api/audits/${id}/screenshots/${e.screenshot}`)); details.append(quote); }
   for(const conflict of p.conflicts||[])details.append(element('p',`Conflicting ${config.fields[conflict.field]||conflict.field}: kept ${conflict.retained}; another path read ${conflict.alternative}. Please check the sources.`));
   return details; });
  document.querySelector('#evidence-list')!.replaceChildren(...evidenceNodes);
  if (['running','cancelling'].includes(job.status)) timer=setTimeout(load,1500);
 } catch (e) { loader.hidden = true; statusEl.textContent=e instanceof Error ? e.message : 'Failed to load results. Click Refresh to reconnect.'; }
 finally { pending=false; refresh.disabled=false; }
}
refresh.addEventListener('click',load);
void load();
