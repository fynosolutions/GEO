const names:Record<string,string>={google_maps:'Google Maps',yelp:'Yelp',tripadvisor:'Tripadvisor',opentable:'OpenTable',doordash:'DoorDash',uber_eats:'Uber Eats',grubhub:'Grubhub',facebook:'Facebook'};
const domains:Record<string,string>={'google.com':'google_maps','yelp.com':'yelp','opentable.com':'opentable','doordash.com':'doordash','ubereats.com':'uber_eats','grubhub.com':'grubhub','facebook.com':'facebook'};
const channelNames:Record<string,string>={official_html:'Website menu pages',official_file:'Website PDFs and images',google_menu:'Google menus',yelp_menu:'Yelp menus',delivery_menu:'Delivery menus',reservation_menu:'Reservation menus',social_menu:'Social menus'};
function element<K extends keyof HTMLElementTagNameMap>(tag:K,text?:string,className?:string){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}
function safeLink(url:unknown,label:string,className='menu-source-link'):HTMLAnchorElement|null{
 try{if(typeof url!=='string')return null;const parsed=new URL(url);if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password)return null;
 const a=element('a',label,className);a.href=parsed.href;a.target='_blank';a.rel='noopener noreferrer';return a;}catch{return null;}
}
function platform(value:string){return domains[value]||value;}
function reason(attempt:any){
 const text=String(attempt.error||'');
 if(/403|access restricted|captcha/i.test(text))return 'The source website denied this request. No menu content was confirmed.';
 if(/identity|branch/i.test(text)||attempt.status==='unverified')return 'A candidate page was found, but its connection to this branch is not verified.';
 if(/discovery/i.test(text))return 'Search did not return a usable menu candidate. This does not confirm that no menu exists.';
 if(attempt.status==='not_found')return 'No menu was extracted from this page. A dynamic or unsupported layout may need another adapter.';
 return text||'This source has not returned a verified menu.';
}
export function renderMenuResults(job:any,id:string|null){
 const panel=document.querySelector<HTMLElement>('#menu-panel');if(!panel)return;
 panel.replaceChildren();panel.hidden=!job.menu_mode;if(!job.menu_mode)return;
 const result=job.menu_result,menus:any[]=result?.menus||[],coverage:any[]=result?.coverage||[],attempts:any[]=coverage.flatMap(c=>c.attempts||[]);
 const selected:string[]=result?.summary?.selected_platforms||job.input?.platforms||job.records?.map((r:any)=>r.platform)||[];
 const unsupported:string[]=result?.summary?.unsupported_platforms||[];
 const unverified=attempts.filter(a=>a.status==='unverified'&&a.url),blocked=attempts.filter(a=>/403|access restricted|captcha/i.test(String(a.error||'')));
 const header=element('div',undefined,'menu-section-header'),title=element('div');title.append(element('p','MENU AVAILABILITY','eyebrow'),element('h2','Menus & source links'));
 const actions=element('div',undefined,'menu-actions');actions.append(element('span',job.menu_mode==='links'?'Links & dates':'Full details','menu-mode-badge'));
 if(result){const download=element('a','View JSON','menu-json-link');download.href=`/api/audits/${id}/menu.json`;actions.append(download);}header.append(title,actions);panel.append(header);
 const metrics=element('div',undefined,'menu-metrics');
 for(const [value,label] of [[menus.length,'Verified menus'],[unverified.length,'Unverified candidates'],[blocked.length,'Blocked requests'],[selected.length,'Selected platforms']] as const){const metric=element('div');metric.append(element('strong',String(value)),element('span',label));metrics.append(metric);}panel.append(metrics);
 const running=['pending','running'].includes(job.menu_status);
 const banner=element('div',undefined,`menu-notice ${menus.length?'has-menus':''}`);
 banner.append(element('strong',running?'Menu collection is in progress':menus.length?'Verified menu sources are available':'No verified menus retrieved'));
 banner.append(element('p',job.menu_error|| (running?'Basic listings and menus are collected in separate stages. Results appear here when ready.':menus.length?'Open each source to inspect the original menu and date evidence.':'This run found no confirmed menu content. Blocked pages and unverified candidates are shown separately below; they do not mean this restaurant has no menu.')));panel.append(banner);
 const grid=element('div',undefined,'menu-platform-grid');
 for(const p of selected){
  const observed=attempts.filter(a=>platform(a.platform)===p),verified=menus.filter(m=>platform(m.platform)===p),candidates=observed.filter(a=>a.status==='unverified'&&a.url),denied=observed.some(a=>/403|access restricted|captcha/i.test(String(a.error||'')));
  const label=unsupported.includes(p)?'Not supported':verified.length?'Verified':running?'Collecting':denied?'Access blocked':candidates.length?'Needs verification':observed.length?'No menu retrieved':'Not checked';
  const tone=verified.length?'success':unsupported.includes(p)||label==='Not checked'?'neutral':'warning';
  const card=element('article',undefined,'menu-platform-card'),top=element('div',undefined,'menu-card-heading');top.append(element('h3',names[p]||p),element('span',label,`menu-status menu-status-${tone}`));card.append(top);
  for(const menu of verified){
   const link=safeLink(menu.url,`Open ${String(menu.format||'').toUpperCase()} menu`);if(link)card.append(link);
   const date=element('p',menu.menu_date?`Menu date: ${menu.menu_date} · ${menu.date_source}`:'Menu date unknown','menu-meta');card.append(date);
   if(menu.fetched_at)card.append(element('p',`Collected ${new Date(menu.fetched_at).toLocaleString()}`,'menu-meta'));
  }
  if(!verified.length)card.append(element('p',unsupported.includes(p)?'A menu adapter is not available for this platform yet.':running?'Waiting for collection to finish.':candidates.length?'A possible menu link needs branch verification before it can count as a result.':denied?'The website rejected the page request. Basic listing data can still be available.':observed.length?'No confirmed menu was extracted from the visited sources.':'No menu source was checked in this run.','menu-card-description'));
  for(const candidate of candidates){const link=safeLink(candidate.url,'Review candidate · unverified');if(link)card.append(link);}
  if(observed.length){
   const details=element('details',undefined,'menu-attempts');details.append(element('summary',`Source checks (${observed.length})`));
   for(const attempt of observed){const row=element('div',undefined,'menu-attempt');row.append(element('p',reason(attempt)));if(attempt.url){const a=safeLink(attempt.url,'Open checked source');if(a)row.append(a);}row.append(element('span',attempt.status||'unknown','menu-meta'));details.append(row);}card.append(details);
  }
  grid.append(card);
 }
 panel.append(grid);
 const outside=coverage.filter(c=>c.status==='not_checked'&&!(c.attempts||[]).length);
 if(outside.length)panel.append(element('p',`Outside this run’s checked sources: ${outside.map(c=>channelNames[c.channel]||c.channel).join(', ')}.`,'menu-scope-note'));
}
