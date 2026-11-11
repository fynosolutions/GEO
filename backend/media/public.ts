import {load} from 'cheerio';

export type MediaSource={id:string;site:string;url:string;priority:number};
export type MediaRestaurant={name:string;rank:number;address:string|null;blurb:string|null};
export type MediaArticle={url:string;site:string;title:string|null;published:string|null;updated:string|null;restaurants:MediaRestaurant[]};
export type MediaEvidence={source_id:string;fetched_at:string|null;status:'complete'|'partial'|'failed';expected_count:number|null;extracted_count:number;count_verified:boolean;issues:string[];source_kind?:'direct_html'|'browser_dom'|'user_saved_html'|'web_index';source_age?:string;count_conflict?:{introductory:number;displayed:number};mentions?:{rank:number;context:string}[];user_file_sha256?:string;comment_coverage?:{declared:number|null;saved:number;readable:number;deleted:number;unavailable:number;unique_ids:boolean;reviewed:boolean};supplied_texts?:{rank:number;sha256:string}[];dates:{field:string;value:string;source:string}[]};
export const mediaSources:MediaSource[]=[
 {id:'infatuation-hot-pot',site:'The Infatuation',url:'https://www.theinfatuation.com/new-york/guides/best-hot-pot-nyc',priority:55},
 {id:'eater-hot-pot',site:'Eater NY',url:'https://ny.eater.com/maps/best-hot-pot-restaurants-nyc',priority:51},
 {id:'infatuation-hot-pot-directory',site:'The Infatuation',url:'https://www.theinfatuation.com/new-york/cuisines/hot-pot',priority:15},
 {id:'infatuation-dim-sum',site:'The Infatuation',url:'https://www.theinfatuation.com/new-york/guides/best-dim-sum-nyc',priority:11},
 {id:'infatuation-ayce',site:'The Infatuation',url:'https://www.theinfatuation.com/new-york/guides/best-all-you-can-eat-new-york',priority:9},
 {id:'eater-ayce',site:'Eater NY',url:'https://ny.eater.com/maps/best-all-you-can-eat-restaurants-nyc',priority:9},
 {id:'reddit-hot-pot',site:'Reddit',url:'https://www.reddit.com/r/FoodNYC/comments/1wmlr4l/best_all_you_can_eat_hot_pot_in_manhattan_or_lic/',priority:8},
 {id:'timeout-dim-sum',site:'Time Out New York',url:'https://www.timeout.com/newyork/restaurants/best-dim-sum-restaurants-in-new-york-city',priority:0},
 {id:'michelin-dim-sum',site:'MICHELIN Guide',url:'https://guide.michelin.com/en/best-of/best-dim-sum-nyc',priority:0},
];
export function parseMediaArticle(html:string,source:MediaSource,fetchedAt:string){
 const $=load(html),issues:string[]=[],dates:MediaEvidence['dates']=[];
 const schemas:any[]=[];
 const walk=(v:any):void=>{if(Array.isArray(v)){v.forEach(walk);return;}if(v&&typeof v==='object'){schemas.push(v);if(v['@graph'])walk(v['@graph']);}};
 $('script[type="application/ld+json"]').each((_,e)=>{try{walk(JSON.parse($(e).text()));}catch{issues.push('Invalid JSON-LD was ignored.');}});
 const type=(v:any,t:string)=>[v['@type']].flat().includes(t);
 for(const [field,property,key] of [['published','article:published_time','datePublished'],['updated','article:modified_time','dateModified']]){
  $(`meta[property="${property}"]`).each((_,e)=>{const value=$(e).attr('content');if(value)dates.push({field,value,source:property});});
  for(const v of schemas.filter(v=>['Article','NewsArticle','BlogPosting'].some(t=>type(v,t))))if(typeof v[key]==='string')dates.push({field,value:v[key],source:'JSON-LD '+v['@type']});
 }
 const date=(field:string):string|null=>{const values=dates.filter(d=>d.field===field);if(!values.length)return null;
  if(values.some(d=>!/^\d{4}-\d\d-\d\d(?:T.*)?$/.test(d.value)||!Number.isFinite(Date.parse(d.value)))){issues.push(`Invalid ${field} date in source.`);return null;}
  if(new Set(values.map(d=>Date.parse(d.value))).size!==1){issues.push(`Conflicting ${field} dates; no value selected.`);return null;}return values[0].value;
 };
 const article:MediaArticle={url:source.url,site:source.site,title:null,published:date('published'),updated:date('updated'),restaurants:[]};
 let directory:any=null;
 if(source.id==='infatuation-hot-pot-directory'){try{const pp=JSON.parse($('#__NEXT_DATA__').text()).props.pageProps;directory=pp.initialQueryState.queries.flatMap((q:any)=>q.state?.data?.pages??[]).find((p:any)=>Array.isArray(p.items)&&typeof p.hasNextPage==='boolean');}catch{issues.push('Directory data could not be read.');}}
 // Remove non-visible CSS/SVG titles before extracting visible text.
 $('style,script,svg,noscript').remove();
 const text=(el:any)=>$(el).text().replace(/\s+/g,' ').trim();
 article.title=$('h1').first().text().trim()||$('meta[property="og:title"]').attr('content')||$('head > title').first().text().trim()||null;
 const list=schemas.find(v=>type(v,'ItemList')&&Array.isArray(v.itemListElement));
 const items:any[]=list?.itemListElement??[];
 let expected:number|null=items.length||null;
 let referenceNames:string[]|null=null,sequenceVerified=true;
 if(source.id==='infatuation-hot-pot-directory'){
  const reviews=directory?.items.filter((v:any)=>v.__typename==='PostReview')??[];
  referenceNames=reviews.map((v:any)=>v.documentTitleText.trim());expected=directory&&!directory.hasNextPage&&directory.totalCount===directory.items.length?reviews.length:null;
  $('[data-testid="detailedStory-storyElement"]').each((_,e)=>{
   const link=$(e).find('a[href*="/reviews/"]').first(),name=text($(e).find('h3').first());if(!link.length||!name)return;
   const item=reviews.find((v:any)=>v.documentIdentifier===$(e).attr('id'));
   article.restaurants.push({name,rank:article.restaurants.length+1,address:item?.placeStreetName||null,blurb:null});
  });
  issues.push('Cuisine directory, not an editorial ranking. Guide cards are excluded. Addresses use the page embedded restaurant fields.');
 }else if(source.site==='The Infatuation'){
  $('[data-testid="venue-title"]').each((_,e)=>{
   const card=$(e).closest('[id]'),name=text(e);if(!name||!card.length)return;
   const addressNode=card.find('a[href*="google.com/maps/search"]').first();
   article.restaurants.push({name,rank:article.restaurants.length+1,address:addressNode.length?text(addressNode):null,blurb:null});
  });
 }else if(source.site==='Eater NY'){
  $('.duet--article--map-card').each((_,e)=>{
   const card=$(e),name=text(card.find('h2').first());if(!name)return;
   const location=card.find('a[href*="google.com/maps/search"] div').first();
   article.restaurants.push({name,rank:article.restaurants.length+1,address:location.length?text(location):null,blurb:null});
  });
 }
 else if(source.site==='Time Out New York'){
  const articleSchema=schemas.find(v=>type(v,'Article')),number=String(articleSchema?.headline??'').match(/\b(\d+)\b/);
  expected=number?Number(number[1]):null;referenceNames=[];
  $('article[data-testid="tile-zone-large-list_testID"]').each((_,e)=>{
   const heading=text($(e).find('h3[data-testid="tile-title_testID"]').first()),m=heading.match(/^(\d+)\.\s*(.+)$/);if(!m)return;
   const rank=article.restaurants.length+1;if(Number(m[1])!==rank)sequenceVerified=false;
   article.restaurants.push({name:m[2],rank,address:text($(e).find('address').first())||null,blurb:null});
  });
  issues.push('Count checked against the headline and consecutive visible item numbers. Addresses absent from this list remain null.');
 }else if(source.site==='MICHELIN Guide'){
  const declared=text($('.city-guide__description--info-total-restaurants').first()).match(/^(\d+) Restaurants?$/);
  expected=declared?Number(declared[1]):null;referenceNames=[];
  $('h5.card__menu-content--title').each((_,e)=>{
   const name=text($(e).find('a[href*="/restaurant/"]').first());if(!name)return;
   const card=$(e).parent();
   article.restaurants.push({name,rank:article.restaurants.length+1,address:text(card.find('.card__menu-content--address').first())||null,blurb:null});
  });
  const updated=$('.detail-page-single-header').map((_,e)=>text(e)).get().find(t=>/^Updated on /.test(t));
  if(updated){const value=updated.slice(11),parsed=Date.parse(value+' UTC');if(Number.isFinite(parsed)){article.updated=new Date(parsed).toISOString().slice(0,10);dates.push({field:'updated',value,source:'visible page text'});}}
  issues.push('Restaurant cards checked against the visible restaurant count; related best-of guides are excluded.');
 }else issues.push('This source layout has not been validated yet.');
 // Both observed layouts provide an independent structured list. Check its order as well as count.
 const names=referenceNames??items.map(v=>{const name=v.item?.name??v.name;return typeof name==='string'?load(name,null,false).text().replace(/\s+/g,' ').trim():null;});
 const countVerified=expected!==null&&expected===article.restaurants.length&&sequenceVerified&&names.every((n,i)=>n===article.restaurants[i].name);
 if(!countVerified)issues.push('Visible entries do not match a verified structured list in count and order.');
 if(!article.restaurants.length)issues.push('No validated restaurant entries extracted; this does not establish absence.');
 if(article.restaurants.some(r=>!r.address))issues.push('Some restaurant addresses are unavailable.');
 issues.push('Full copyrighted descriptions are not included in this metadata export; blurb remains null.');
 const evidence:MediaEvidence={source_id:source.id,fetched_at:fetchedAt,source_kind:'direct_html',status:article.restaurants.length?'partial':'failed',expected_count:expected,extracted_count:article.restaurants.length,count_verified:countVerified,issues,dates};
 if(source.site==='MICHELIN Guide'&&/four restaurants/i.test(text($('.detail-page-single-header').first()))&&expected===3){evidence.count_conflict={introductory:4,displayed:3};issues.push('Introductory prose says four restaurants; the live displayed count and all three cards agree. No fourth restaurant is inferred.');}
 return {article,evidence};
}

export {parseIndexedMedia} from './indexed.js';
export {mediaMembershipReport} from './membership.js';
export {applySuppliedTexts} from './texts.js';

export {evaluateMediaAcceptance,missingDescriptions,mediaAcceptanceReport} from './acceptance.js';

export {parseSavedMediaPage} from './saved.js';
