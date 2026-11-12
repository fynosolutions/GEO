import type {CheerioAPI,Cheerio} from 'cheerio';
import type {MediaSource,MediaArticle,MediaEvidence} from './public.js';

/** Inspect only the restaurant's description container, never page chrome or neighbouring cards. */
export function inspectCardDescription($:CheerioAPI,input:Cheerio<any>,source:MediaSource){
 const card=input.clone();
 card.find('script,style,svg,noscript,template,aside,figcaption,button,[hidden],[aria-hidden="true"]').remove();
 const selector=source.id==='infatuation-hot-pot-directory'?'p.css-501r93':source.site==='The Infatuation'?'[data-testid="venue-description"], div[city]':source.site==='Eater NY'?'p.duet--article--standard-paragraph':source.site==='Time Out New York'?'[data-testid="summary_testID"]':source.site==='MICHELIN Guide'?'.card__menu-content--desc':'';
 if(!selector)return {text:null,present:null,selector:'unsupported'};
 const containers=card.find(selector);
 if(!containers.length)return {text:null,present:null,selector};
 const blocks:string[]=[];
 containers.each((_,e)=>{
  // Nested description containers must not duplicate the same paragraph.
  if($(e).parents().toArray().some(parent=>containers.toArray().includes(parent)))return;
  const node=$(e),paragraphs=node.is('p')?node:node.find('p');
  if(paragraphs.length)paragraphs.each((_,p)=>{const text=$(p).text().trim();if(text)blocks.push(text);});
  else{const text=node.text().trim();if(text)blocks.push(text);}
 });
 const text=blocks.join('\n\n')||null;
 return {text,present:text!==null,selector};
}

export function descriptionAvailability(articles:MediaArticle[],evidence:MediaEvidence[]){
 const rows=articles.flatMap((article,index)=>article.restaurants.map(restaurant=>{
  const observation=evidence[index].descriptions?.find(d=>d.rank===restaurant.rank&&d.name===restaurant.name);
  return {source_id:evidence[index].source_id,url:article.url,rank:restaurant.rank,name:restaurant.name,present:restaurant.blurb?true:observation?.present??null,reason:restaurant.blurb?'exported':observation?.reason??'not_checked',characters:restaurant.blurb?.length??observation?.characters??null,selector:observation?.selector??null};
 }));
 const counts={exported:0,not_selected:0,not_provided:0,parse_failed:0,not_checked:0};
 for(const row of rows)counts[row.reason as keyof typeof counts]++;
 return {entries:rows.length,present:rows.filter(r=>r.present===true).length,confirmed_absent:rows.filter(r=>r.present===false).length,unknown:rows.filter(r=>r.present===null).length,counts,entries_by_source:articles.map((article,index)=>({source_id:evidence[index].source_id,entries:article.restaurants.length,present:rows.filter(r=>r.url===article.url&&r.present===true).length,exported:rows.filter(r=>r.url===article.url&&r.reason==='exported').length})),rows};
}
