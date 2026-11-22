import {load} from 'cheerio';import type {MediaArticle,MediaEvidence,MediaSource} from './public.js';
const norm=(v:string)=>v.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g,'');
const closureText=(v:string)=>/^(?:(?:this spot|this restaurant|this place) is\s+)?(?:permanently\s+closed|closed\s+permanently|closed|永久关闭|已永久关闭)[.!。]?$/i.test(v.trim());
export function attachClosureMarkers(html:string,source:MediaSource,result:{article:MediaArticle;evidence:MediaEvidence}){
 const $=load(html);let state:any=null;
 try{state=JSON.parse($('#__NEXT_DATA__').text()).props.pageProps.initialApolloState;}catch{}
 const schemas:any[]=[];const walk=(v:any):void=>{if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object'){schemas.push(v);if(v['@graph'])walk(v['@graph']);}};
 $('script[type="application/ld+json"]').each((_,e)=>{try{walk(JSON.parse($(e).text()));}catch{}});
 $('script,style,svg,noscript,aside,footer,nav,[hidden],[aria-hidden="true"]').remove();
 const reviews=state?Object.values(state).filter((v:any)=>v?.__typename==='PostReview') as any[]:[];
 const deref=(v:any)=>v?.__ref?state?.[v.__ref]:v;
 const markers:NonNullable<MediaEvidence['closure_markers']>=[];
 for(const r of result.article.restaurants){
  r.closed=false;let path:string|null=null;let scope:any=null;
  if(source.site==='The Infatuation'){
   const headings=$('[data-testid="venue-title"]');const heading=headings.eq(r.rank-1);
   if(heading.length&&norm(heading.text())!==norm(r.name))continue;
   if(heading.length){path=heading.closest('a').attr('href')??null;scope=heading.closest('[id]');}
   else if(source.page_type==='review')path=new URL(source.url).pathname.replace(/\/$/,'');
   const candidates=reviews.filter(v=>{const slug=deref(v.slug);return path!==null&&typeof slug?.name==='string'&&v.canonicalPath+'/reviews/'+slug.name===path;});
   if(candidates.length===1){const venue=deref(candidates[0].venue);if(venue&&typeof venue.closedStatus==='string'&&closureText(venue.closedStatus)){r.closed=true;markers.push({rank:r.rank,name:r.name,marker:venue.closedStatus,source:'canonical embedded venue.closedStatus'});}else if(venue?.closed===true&&!venue.closedStatus){r.closed=true;markers.push({rank:r.rank,name:r.name,marker:'closed=true',source:'canonical embedded venue.closed'});}}
  }
  if(source.site==='Eater NY')scope=$('.duet--article--map-card').filter((_,e)=>norm($(e).find('h2').first().text())===norm(r.name)).first();
  if(source.site==='Time Out')scope=$('article[data-testid="tile-zone-large-list_testID"]').filter((_,e)=>norm($(e).find('h3').first().text().replace(/^\d+\.\s*/,''))===norm(r.name)).first();
  if(source.site==='Welcome to Chinatown')scope=$('article .image-title').filter((_,e)=>norm($(e).text())===norm(r.name)).closest('.image-title-wrapper').parent();
  if(scope?.length){
   const labels=scope.find('.closed-badge,.closed-label,.permanently-closed,[data-testid*="closed"],[class*="badge"],[data-status="permanently-closed"]');
   labels.each((_:number,e:any)=>{const n=$(e);if(n.closest('.open-status,.opening-hours,.hours,[data-testid*="hours"]').length)return;const text=n.text().trim();if(closureText(text)){r.closed=true;markers.push({rank:r.rank,name:r.name,marker:text,source:'own restaurant status label'});}});
  }
  const business=schemas.flatMap(v=>v['@type']==='Review'&&v.itemReviewed?[v.itemReviewed]:v['@type']==='ItemList'&&Array.isArray(v.itemListElement)?v.itemListElement.map((x:any)=>x?.item??x):[v]).filter(v=>v&&['Restaurant','FoodEstablishment'].includes(v['@type'])&&typeof v.name==='string'&&norm(load(v.name,null,false).text())===norm(r.name));
  if(business.length===1&&/^(?:CLOSED_PERMANENTLY|permanently closed)$/i.test(business[0].businessStatus??'')){r.closed=true;markers.push({rank:r.rank,name:r.name,marker:business[0].businessStatus,source:'own JSON-LD businessStatus'});}
 }
 result.evidence.closure_markers=markers;
 result.evidence.issues.push('closed=false means this source has no matched closure marker; it is not a real-time opening-status assertion.');
 return result;
}
