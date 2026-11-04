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
 const menusSection=document.querySelector<HTMLElement>('#menus-section'),hoursSection=document.querySelector<HTMLElement>('#hours-section'),hoursPanel=document.querySelector<HTMLElement>('#hours-panel');
 const previousFilter=hoursPanel?.querySelector<HTMLSelectElement>('select')?.value;
 panel.replaceChildren();hoursPanel?.replaceChildren();panel.hidden=!job.menu_mode;
 if(menusSection)menusSection.hidden=!job.menu_mode;
 if(hoursSection)hoursSection.hidden=true;
 if(!job.menu_mode)return;
 const result=job.menu_result,menus:any[]=result?.menus||[],coverage:any[]=result?.coverage||[],attempts:any[]=coverage.flatMap(c=>c.attempts||[]);
 const selected:string[]=result?.summary?.selected_platforms||job.input?.platforms||job.records?.map((r:any)=>r.platform)||[];
 const unsupported:string[]=result?.summary?.unsupported_platforms||[];
 const unverified=attempts.filter(a=>a.status==='unverified'&&a.url),blocked=attempts.filter(a=>/403|access restricted|captcha/i.test(String(a.error||'')));
 const header=element('div',undefined,'menu-section-header'),title=element('div');title.append(element('p','MENU AVAILABILITY','eyebrow'));
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
  const observed=attempts.filter(a=>platform(a.platform)===p),verified=menus.filter(m=>platform(m.platform)===p),candidates=observed.filter(a=>a.status==='unverified'&&a.url),serviceFailed=observed.some(a=>a.status==='error'&&/Apify|Actor|network|HTTP 5/i.test(String(a.error||''))),denied=observed.some(a=>/403|access restricted|captcha/i.test(String(a.error||'')));
  const label=unsupported.includes(p)?'Not supported':verified.length?'Verified':running?'Collecting':denied?'Access blocked':serviceFailed?'Collection failed':candidates.length?'Needs verification':observed.length?'No menu retrieved':'Not checked';
  const tone=verified.length?'success':unsupported.includes(p)||label==='Not checked'?'neutral':'warning';
  const card=element('article',undefined,'menu-platform-card'),top=element('div',undefined,'menu-card-heading');top.append(element('h3',names[p]||p),element('span',label,`menu-status menu-status-${tone}`));card.append(top);
  for(const menu of verified){
   if(typeof menu.item_count==='number')card.append(element('p',`${menu.item_count} menu items returned`,'menu-meta'));
   const link=safeLink(menu.url,`Open ${String(menu.format||'').toUpperCase()} menu`);if(link)card.append(link);
   const date=element('p',menu.menu_date?`Menu date: ${menu.menu_date} · ${menu.date_source}`:'Menu date unknown','menu-meta');card.append(date);
   if(menu.fetched_at)card.append(element('p',`Collected ${new Date(menu.fetched_at).toLocaleString()}`,'menu-meta'));
   const items=Array.isArray(menu.items)&&menu.items.length?menu.items:(result?.prices||[]).filter((price:any)=>menu.menu_id&&price.menu_id===menu.menu_id&&price.channel===menu.channel&&price.url===menu.url);
   if(items.length)renderItems(card,items);
   else card.append(element('p',job.menu_mode==='links'?'Dish names and prices were not saved in this links-only run. Start a new audit with “Full menu details and prices” to collect them.':'This source did not return dish-level details. Open the original menu to check dishes and prices.','menu-card-description'));
  }
  if(!verified.length)card.append(element('p',unsupported.includes(p)?'A menu adapter is not available for this platform yet.':running?'Waiting for collection to finish.':candidates.length?'A possible menu link needs branch verification before it can count as a result.':serviceFailed?'Menu collection stopped because a service request failed. See source checks below.':denied?'The website rejected the page request. Basic listing data can still be available.':observed.length?'No confirmed menu was extracted from the visited sources.':'No menu source was checked in this run.','menu-card-description'));
  for(const candidate of candidates){const link=safeLink(candidate.url,'Review candidate · unverified');if(link)card.append(link);}
  if(observed.length){
   const details=element('details',undefined,'menu-attempts');details.append(element('summary',`Source checks (${observed.length})`));
   for(const attempt of observed){const row=element('div',undefined,'menu-attempt');row.append(element('p',reason(attempt)));if(attempt.url){const a=safeLink(attempt.url,'Open checked source');if(a)row.append(a);}row.append(element('span',attempt.status||'unknown','menu-meta'));details.append(row);}card.append(details);
  }
  grid.append(card);
 }
 panel.append(grid);
 if(result?.hours?.length&&hoursPanel){if(hoursSection)hoursSection.hidden=false;renderHours(hoursPanel,result.hours,previousFilter);}
 const outside=coverage.filter(c=>c.status==='not_checked'&&!(c.attempts||[]).length);
 if(outside.length)panel.append(element('p',`Outside this run’s checked sources: ${outside.map(c=>channelNames[c.channel]||c.channel).join(', ')}.`,'menu-scope-note'));
}

function renderHours(parent:HTMLElement,rows:any[],previousFilter?:string){
 if(!rows.length)return;
 const section=element('section',undefined,'hours-analysis'),heading=element('div',undefined,'menu-section-header');
 heading.append(element('p','Filter daily verdicts by platform','menu-scope-note'));
 const filter=element('select');filter.setAttribute('aria-label','Filter opening hours by platform');filter.append(new Option('All platforms','all'));
 for(const p of [...new Set(rows.map(r=>r.platform))])filter.append(new Option(names[p]||p,p));heading.append(filter);section.append(heading);
 section.append(element('p','Google is the baseline. Delivery closing up to 30 minutes earlier is allowed only when opening times match. Missing or unsupported hours remain unknown.','menu-scope-note'));
 const wrapper=element('div',undefined,'hours-analysis-scroll'),table=element('table');table.append(element('caption','Daily opening-hours verdicts'));wrapper.append(table);section.append(wrapper);
 const display=(v:any)=>v===null||v===undefined?'—':Array.isArray(v)?v.join(' / '):String(v);
 const verdicts:Record<string,string>={'一致':'Aligned','外卖常规提前':'Standard delivery lead','不一致':'Different'};
 const paint=()=>{
  table.replaceChildren(element('caption','Daily opening-hours verdicts'));
  const head=element('thead'),tr=element('tr');for(const label of ['Platform / day','Platform hours','Google hours','Closing difference','Result','Source'])tr.append(element('th',label));head.append(tr);table.append(head);
  const body=element('tbody');
  for(const row of rows.filter(r=>filter.value==='all'||r.platform===filter.value)){
   const line=element('tr');line.dataset.verdict=row.verdict||'unknown';
   const identity=element('th');identity.scope='row';identity.append(element('strong',names[row.platform]||row.platform),element('span',row.day,'menu-meta'));line.append(identity);
   line.append(element('td',`${display(row.open)} → ${display(row.close)}`),element('td',`${display(row.google_open)} → ${display(row.google_close)}`));
   line.append(element('td',row.diff_minutes===null?'—':`${display(row.diff_minutes)} min`));
   const result=element('td');result.append(element('span',verdicts[row.verdict]||'Cannot compare',`menu-status menu-status-${row.verdict==='一致'||row.verdict==='外卖常规提前'?'success':row.verdict?'warning':'neutral'}`));
   if(row.reason)result.append(element('p',row.reason,'menu-meta'));line.append(result);
   const source=element('td'),a=safeLink(row.url,'Platform'),google=safeLink(row.google_url,'Google baseline');if(a)source.append(a);if(google)source.append(google);line.append(source);body.append(line);
  }table.append(body);
 };
 if(previousFilter&&Array.from(filter.options).some(option=>option.value===previousFilter))filter.value=previousFilter;
 filter.addEventListener('change',paint);paint();parent.append(section);
}

function renderItems(parent:HTMLElement,items:any[]){
 const details=element('details',undefined,'menu-dish-details');details.open=true;details.append(element('summary',`Dishes & prices (${items.length})`));
 const scroll=element('div',undefined,'menu-dishes-scroll'),table=element('table');
 const head=element('thead'),heading=element('tr');for(const title of ['Dish name','Category','Price'])heading.append(element('th',title));head.append(heading);table.append(head);
 const body=element('tbody');
 for(const item of items){const row=element('tr');
  const price=item.price===null||item.price===undefined?'Not available':typeof item.price==='object'?(item.price.display??item.price.amount??'Not available'):String(item.price);
  row.append(element('td',item.name),element('td',item.category||item.variant||'—'),element('td',price+(price!=='Not available'&&item.currency?` (${item.currency})`:'')));body.append(row);
 }
 table.append(body);scroll.append(table);details.append(scroll);parent.append(details);
}
