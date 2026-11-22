import {load} from 'cheerio';import {attachClosureMarkers} from './closure.js';import {parseMediaArticle,type MediaSource,type MediaArticle,type MediaEvidence,type MediaRestaurant} from './public.js';import {mediaPageType} from './sources.js';
import type {MediaTarget} from './membership.js';
function parseConfiguredMediaPageBase(html:string,source:MediaSource,fetchedAt:string,targets:MediaTarget[]=[]){
 const kind=source.page_type??mediaPageType(source.url),$=load(html),schemas:any[]=[];
 const add=(v:any):void=>{if(Array.isArray(v))v.forEach(add);else if(v&&typeof v==='object'){schemas.push(v);if(v['@graph'])add(v['@graph']);}};
 $('script[type="application/ld+json"]').each((_,e)=>{try{add(JSON.parse($(e).text()));}catch{}});
 const type=(v:any,t:string)=>[v?.['@type']].flat().includes(t),plain=(v:unknown)=>typeof v==='string'?load(v,null,false).text().trim():null;
 const text=(v:any)=>$(v).text().replace(/\s+/g,' ').trim();
 $('style,script,svg,noscript,template,aside,nav,footer,[hidden],[aria-hidden="true"]').remove();
 const title=text($('h1').first())||$('meta[property="og:title"]').attr('content')||text($('title').first())||null;
 const article:MediaArticle={url:source.url,site:source.site,title,published:null,updated:null,restaurants:[]};
 const evidence:MediaEvidence={source_id:source.id,fetched_at:fetchedAt,status:'failed',expected_count:null,extracted_count:0,count_verified:false,source_kind:'direct_html',issues:[],dates:[],descriptions:[]};
 const date=(field:string,key:string,property:string)=>{
  const values=[...schemas.filter(v=>['Article','NewsArticle','BlogPosting','Review'].some(t=>type(v,t))).map(v=>v[key]),...$(`meta[property="${property}"]`).map((_,e)=>$(e).attr('content')).get()].filter(v=>typeof v==='string'&&v.trim());
  for(const value of values)evidence.dates.push({field,value,source:'page metadata'});
  if(!values.length)return null;if(values.some(v=>!/^\d{4}-\d\d-\d\d/.test(v)||!Number.isFinite(Date.parse(v)))||new Set(values.map(v=>Date.parse(v))).size>1){evidence.issues.push(`Conflicting or invalid ${field} dates.`);return null;}return values[0];
 };
 article.published=date('published','datePublished','article:published_time');article.updated=date('updated','dateModified','article:modified_time');
 const paragraphText=(node:any)=>{const p=$(node).find('p');return p.length?p.map((_,e)=>$(e).text().trim()).get().filter(Boolean).join('\n\n'):$(node).text().trim();};
 const address=(v:any):string|null=>{
  if(typeof v==='string')return v.trim()||null;if(!v||typeof v!=='object')return null;
  if(typeof v.name==='string'&&v.name.trim()&&v.streetAddress&&v.name.includes(v.streetAddress))return v.name;
  if(!v.streetAddress)return null;return [v.streetAddress,v.addressLocality,[v.addressRegion,v.postalCode].filter(Boolean).join(' '),typeof v.addressCountry==='string'?v.addressCountry:null].filter(Boolean).join(', ');
 };
 const push=(name:string|null,addr:string|null,blurb:string|null,selector:string)=>{
  if(!name)return;const r:MediaRestaurant={name,rank:article.restaurants.length+1,address:addr,blurb:blurb||null};article.restaurants.push(r);
  evidence.descriptions!.push({rank:r.rank,name:r.name,present:blurb?true:null,reason:blurb?'exported':'parse_failed',selector,characters:blurb?.length??null});
 };
 if((kind==='list'||kind==='directory')&&['The Infatuation','Eater NY','Time Out'].includes(source.site)){
  const parsed=parseMediaArticle(html,{...source,site:source.site==='Time Out'?'Time Out New York':source.site},fetchedAt);
  if(parsed.article.restaurants.length){
   if(!parsed.evidence.count_verified&&source.site==='The Infatuation'&&kind==='list')try{
    const state=JSON.parse(load(html)('#__NEXT_DATA__').text()).props.pageProps.initialApolloState;
    const parts=new URL(source.url).pathname.replace(/\/$/,'').split('/guides/');
    const entries=Object.entries(state.ROOT_QUERY).filter(([key])=>{if(!key.startsWith('postGuideCollection('))return false;const args=JSON.parse(key.slice(key.indexOf('(')+1,-1));return args.where?.canonicalPath===parts[0]&&args.where?.slug?.name===parts[1];});
    if(entries.length===1){
     const guide=(entries[0][1] as any).items[0],body=Object.entries(guide).find(([key])=>key.startsWith('contentV2BodyCollection('));
     if(body){const limit=JSON.parse(body[0].slice(body[0].indexOf('(')+1,-1)).limit,rows=(body[1] as any).items;
      const reviews=rows.filter((v:any)=>v.review).map((v:any)=>v.review.__ref?state[v.review.__ref]:v.review);
      const names=reviews.map((v:any)=>plain(v?.title??v?.venue?.name)?.replace(/\s+/g,' '));
      const links=reviews.map((v:any)=>{const slug=v?.slug?.__ref?state[v.slug.__ref]:v?.slug;return typeof v?.canonicalPath==='string'&&typeof slug?.name==='string'?v.canonicalPath+'/reviews/'+slug.name:null;});
      const dom=load(html),visibleLinks=dom('[data-testid="venue-title"]').filter((_,e)=>!!dom(e).closest('[id]').length).map((_,e)=>dom(e).closest('a').attr('href')??'').get();
      const sameNames=names.every((name:string,i:number)=>name===parsed.article.restaurants[i]?.name);
      const sameLinks=visibleLinks.length===links.length&&links.every((href:string|null,i:number)=>href!==null&&href===visibleLinks[i]);
      if(rows.length<limit&&names.length===parsed.article.restaurants.length&&(sameNames||sameLinks)){
       const previous=parsed.evidence.expected_count;parsed.evidence.expected_count=names.length;parsed.evidence.count_verified=true;
       parsed.evidence.issues=parsed.evidence.issues.filter(v=>v!=='Visible entries do not match a verified structured list in count and order.');
       parsed.evidence.issues.push(`Canonical guide embedded body verifies all ${names.length} visible entries in order; JSON-LD ItemList contains ${previous}. All visible source entries retained.`);
      }
     }
    }
   }catch{/* Unresolved embedded identity/count stays partial. */}
   parsed.article.site=source.site;return parsed;
  }
 }
 if(source.site==='Happy Hour NYC'){
  const cards=$('article.card[data-count]');
  cards.each((_,e)=>{const card=$(e),heading=card.find('h3').first().clone();heading.find('.num').remove();
   const meta=card.find('p.meta').first().clone();meta.find('.vibe,.price').remove();const addr=meta.text().split('·').map(v=>v.trim()).find(v=>/^\d+\s/.test(v))??null;
   push(heading.text().trim()||null,addr,paragraphText(card.find('.blurb'))||null,'article.card[data-count] h3/.blurb');
  });
  const declared=$('body').text().match(/(\d+)\s+verified spots/);evidence.expected_count=declared?Number(declared[1]):null;
  evidence.count_verified=!!evidence.expected_count&&evidence.expected_count===cards.length&&cards.length===article.restaurants.length;
 }else if(source.site==='Welcome to Chinatown'){
  const cards=$('article .image-title').closest('.image-title-wrapper').parent();
  cards.each((_,e)=>{const card=$(e),paragraphs=card.find('.image-subtitle p'),first=text(paragraphs.first()),addr=/^\d+(?:-\d+)?\s+\S+/.test(first)?first:null;
   const body=paragraphs.filter((i)=>!addr||i>0).map((_,p)=>$(p).text().trim()).get().filter(Boolean).join('\n\n')||null;
   push(text(card.find('.image-title h4').first())||null,addr,body,'.image-title/.image-subtitle');
   if(!body&&card.find('.image-subtitle').length){const d=evidence.descriptions!.at(-1);if(d){d.present=false;d.reason='not_provided';}}
  });
  // This adapter covers all static image-card entries, excluding footer/navigation cards.
  evidence.expected_count=$('article .image-title h4').length;evidence.count_verified=!!evidence.expected_count&&evidence.expected_count===article.restaurants.length;
 }else if(source.site==='All You Can Eat Guide'&&kind==='directory'){
  const cards=$('main .grid > a').filter((_,e)=>$(e).find('.card-name').length>0);
  cards.each((_,e)=>{const card=$(e),addr=card.find('.card-meta .meta-item').map((_,n)=>text(n)).get().find(v=>v.includes('📍'))?.replace(/^.*?📍\s*/, '')??null;
   // Tags, opening status and prices are not an original editorial description.
   push(text(card.find('.card-name'))||null,addr,null,'.grid > a .card-name');});
  evidence.expected_count=cards.length;evidence.count_verified=cards.length>0&&!$('a[rel="next"],button[data-load-more]').length;
  evidence.issues.push('Directory cards supply names/addresses/tags but no dedicated description; original blurbs remain null.');
  for(const d of evidence.descriptions!){d.present=false;d.reason='not_provided';d.selector='directory card (no description field)';}
 }else if(kind==='review'||kind==='place'){
  const isBusiness=(v:any)=>['Restaurant','FoodEstablishment',...(source.site==='Corner'?['LocalBusiness']:[])].some(t=>type(v,t));
  const review=schemas.find(v=>type(v,'Review')&&isBusiness(v.itemReviewed)),business=review?.itemReviewed??schemas.find(isBusiness);
  const heading=text($('h1').first())||null;
  const name=source.site==='Time Out'?heading:plain(business?.name)??heading;
  let body:string|null=null,selector='';
  if(source.site==='The Infatuation'){selector='main .flatplan_tags';const blocks=$('main .flatplan_tags').filter((_,e)=>$(e).find('p').length>0);body=blocks.map((_,e)=>paragraphText(e)).get().filter(Boolean).join('\n\n')||null;}
  if(!body&&source.site==='Time Out'){body=paragraphText($('main [data-testid="annotation_testID"]'))||null;selector='main annotation_testID paragraphs';}
  if(!body&&typeof review?.reviewBody==='string'){body=paragraphText(load(review.reviewBody,null,false).root());selector='JSON-LD Review.reviewBody';}
  if(!body&&source.site==='All You Can Eat Guide'){const section=$('main section, main .section').filter((_,e)=>/^About the Business$/i.test(text($(e).find('h2').first()))).first();body=paragraphText(section.find('.section-body'));selector='About the Business .section-body';}
  if(!body&&typeof business?.description==='string'){body=plain(business.description);selector='JSON-LD Restaurant.description';}
  if(source.site==='Corner'){const paragraphs=$('main p').filter((_,e)=>/leading-relaxed/.test($(e).attr('class')??'')&&!$(e).closest('section').length);body=paragraphs.map((_,e)=>$(e).text().trim()).get().filter(Boolean).join('\n\n')||body;selector='Corner primary description paragraphs';}
  if(!body&&source.site==='MICHELIN Guide'){body=paragraphText($('.restaurant-details__description, .data-sheet__description').first());selector='Michelin restaurant description';}
  if(business){push(name,address(business?.address),body,selector||'unrecognized description');evidence.expected_count=1;evidence.count_verified=!!business&&article.restaurants.length===1;}
 }else if(source.site==='Eater NY'&&kind==='article'){
  const paragraphs=$('main .duet--article--article-body-component p.duet--article--standard-paragraph'),opening=paragraphs.first();
  let name=text(opening.find('strong').first())||null;
  if(!name&&title){const candidates=targets.flatMap(t=>t.aliases).filter(a=>title.toLowerCase().includes(a.toLowerCase())&&text(opening).toLowerCase().includes(a.toLowerCase())).sort((a,b)=>b.length-a.length);const alias=candidates[0];if(alias){const at=title.toLowerCase().indexOf(alias.toLowerCase());name=title.slice(at,at+alias.length);}}
  const body=paragraphs.map((_,e)=>$(e).text().trim()).get().filter(Boolean).join('\n\n')||null;
  const addr=text(opening).match(/\b\d+\s+(?:[A-Z][\w'-]*\s+){0,5}(?:Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd)\b/)?.[0]??null;
  if(name&&body){push(name,addr,body,'article body paragraphs; primary opening reference');evidence.expected_count=1;evidence.count_verified=true;evidence.issues.push('Single restaurant story; body may mention background restaurants. This is not a ranked list.');}
 }
 if(source.site==='Corner'&&kind==='list'&&new URL(source.url).pathname.startsWith('/list/')){
  const headings=$('main h2 a[href*="/place/"]');headings.each((_,e)=>{const card=$(e).closest('div.flex-1'),addr=card.find('p').map((_,p)=>text(p)).get().find(v=>/^\d+\s/.test(v))??null;const body=card.find('p').filter((_,p)=>/leading-relaxed/.test($(p).attr('class')??'')).map((_,p)=>$(p).text().trim()).get().join('\n\n')||null;push(text(e),addr,body,'Corner list visible card');if(!body){const d=evidence.descriptions!.at(-1)!;d.present=false;d.reason='not_provided';}});
  const list=schemas.find(v=>type(v,'ItemList'));const names=list?.itemListElement?.map((v:any)=>plain((v.item??v).name));evidence.expected_count=list?.numberOfItems??null;evidence.count_verified=Array.isArray(names)&&names.length===article.restaurants.length&&names.every((n:string,i:number)=>n===article.restaurants[i].name)&&evidence.expected_count===names.length;
 }
 if(source.site==='Corner'&&kind==='list'&&new URL(source.url).pathname.startsWith('/guides/')){
  $('main a[data-track-place] h2').each((_,e)=>{let card=$(e).parent();while(card.parent().length&&!card.find('p.leading-relaxed').length&&card[0]?.tagName!=='main')card=card.parent();const ps=card.find('p'),addr=ps.map((_,p)=>text(p)).get().find(v=>/^\d+\s/.test(v))??null;push(text(e),addr,ps.filter((_,p)=>/leading-relaxed/.test($(p).attr('class')??'')).map((_,p)=>$(p).text().trim()).get().join('\n\n')||null,'Corner tracked guide card');});
  evidence.expected_count=$('main a[data-track-place] h2').length;evidence.count_verified=evidence.expected_count>0&&evidence.expected_count===article.restaurants.length;
 }
 if(!article.restaurants.length){
  // Generic structured lists are accepted only when linked names are also visible in the main content.
  const list=schemas.find(v=>type(v,'ItemList')&&Array.isArray(v.itemListElement));
  if(list){const entries=list.itemListElement,main=$('main,article').first(),mainText=text(main);let valid=main.length>0;
   for(const entry of entries){const item=entry.item??entry,name=plain(item.name??entry.name);if(!name||!mainText.includes(name)){valid=false;continue;}push(name,address(item.address),plain(item.description),'JSON-LD ItemList with visible name');}
   evidence.expected_count=entries.length;evidence.count_verified=valid&&entries.length>0&&entries.length===article.restaurants.length;
  }
 }
 evidence.extracted_count=article.restaurants.length;evidence.status=article.restaurants.length?'partial':'failed';
 if(!article.restaurants.length)evidence.issues.push('Readable page, but no validated restaurant layout extracted; this is a parser gap, not evidence of no restaurants.');
 if(!evidence.count_verified&&article.restaurants.length)evidence.issues.push('Full entry count/order remains unverified.');
 if(article.restaurants.some(r=>!r.address))evidence.issues.push('Some source addresses are unavailable.');return {article,evidence};
}

export function parseConfiguredMediaPage(html:string,source:MediaSource,fetchedAt:string,targets:MediaTarget[]=[]){
 return attachClosureMarkers(html,source,parseConfiguredMediaPageBase(html,source,fetchedAt,targets));
}
