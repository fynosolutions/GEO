import {mapItem,matchesIdentity,safeName} from '../collection.js';

export const reviewPlatforms=['google_maps','yelp'] as const;
export type ReviewPlatform=typeof reviewPlatforms[number];
export type ReviewStore={id:string;name:string;address:string;place_id:string;google_maps_url:string;yelp_url:string};
export type Review={date:string|null;rating:number|null;text:string;language:string|null};
export type ReviewRecord={platform:ReviewPlatform;total_reviews:number|null;topics:unknown[];reviews:Review[];url:string;fetched_at:string;error:string|null};
export type ReviewEvidence={identity_verified:boolean;raw_count:number;duplicates:number;invalid:number;missing_language:number;possible_truncations:number;expected:number|null;complete:boolean;notes:string[]};
const integer=(v:unknown):number|null=>typeof v==='number'&&Number.isInteger(v)&&v>=0?v:null;
const pick=(...v:any[])=>v.find(x=>x!==undefined&&x!==null);
export function canonicalYelp(value:string):string{
 const u=new URL(value);if(u.protocol!=='https:'||!['www.yelp.com','yelp.com','m.yelp.com'].includes(u.hostname)||!/^\/biz\/[^/]+\/?$/.test(u.pathname))throw Error('Expected an HTTPS Yelp business URL.');
 return 'https://www.yelp.com'+u.pathname.replace(/\/$/,'');
}
export function reviewStores(value:unknown):ReviewStore[]{
 if(!Array.isArray(value)||!value.length||value.length>20)throw Error('Provide 1–20 review stores.');
 const ids=new Set<string>(),places=new Set<string>(),yelps=new Set<string>();
 return value.map(v=>{
  if(!v||typeof v!=='object')throw Error('Invalid review store.');
  for(const k of ['id','name','address','place_id','google_maps_url','yelp_url'])if(typeof v[k]!=='string'||!v[k].trim()||v[k].length>1500)throw Error('Missing or invalid review store field: '+k);
  if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(v.id)||ids.has(v.id))throw Error('Review store IDs must be unique safe slugs.');
  const google=new URL(v.google_maps_url),yelp=canonicalYelp(v.yelp_url);
  if(google.protocol!=='https:'||!['google.com','www.google.com','maps.google.com'].includes(google.hostname)||google.searchParams.get('query_place_id')!==v.place_id)throw Error('Google source URL must identify the configured Place ID.');
  if(places.has(v.place_id)||yelps.has(yelp))throw Error('Duplicate review listing identity.');
  ids.add(v.id);places.add(v.place_id);yelps.add(yelp);
  return {id:v.id,name:v.name,address:v.address,place_id:v.place_id,google_maps_url:v.google_maps_url,yelp_url:yelp};
 });
}
export function reviewFilename(s:ReviewStore){return safeName(s.name)+'--'+s.id+'.json';}
export function actorSpec(platform:ReviewPlatform,store:ReviewStore,limit:number){
 if(!Number.isInteger(limit)||limit<1||limit>200)throw Error('Review limit must be 1–200.');
 return platform==='google_maps'?{
  actor:'compass/crawler-google-places',input:{placeIds:[store.place_id],maxCrawledPlacesPerSearch:1,maxReviews:limit,reviewsSort:'newest',reviewsOrigin:'google',scrapePlaceDetailPage:true,maxImages:0,scrapeReviewsPersonalData:false,language:'en'},
 }:{actor:'tri_angle/yelp-review-scraper',input:{startUrls:[{url:canonicalYelp(store.yelp_url)}],maxReviewsPerUrl:limit}};
}
export function normalizeReviews(platform:ReviewPlatform,items:any[],store:ReviewStore,limit=200,fetchedAt=new Date().toISOString(),providerError:string|null=null){
 const notes:string[]=[],target={name:store.name,address:store.address};
 let roots=items,identity=false,total:number|null=null,topics:unknown[]=[],candidates:any[]=[];
 if(platform==='google_maps'){
  roots=items.filter(r=>r&&r.placeId===store.place_id&&matchesIdentity(mapItem('google_maps',r),target));
  identity=roots.length>0;
  total=roots.map(r=>integer(r.reviewsCount)).find(v=>v!==null)??null;
  topics=Array.isArray(roots[0]?.reviewsTags)?roots[0].reviewsTags:[];
  for(const r of roots)if(Array.isArray(r.reviews))candidates.push(...r.reviews.filter((v:any)=>!v.reviewOrigin||/^google$/i.test(v.reviewOrigin)));
 }else{
  roots=items.filter(r=>{
   if(!r||typeof r!=='object')return false;
   const record=mapItem('yelp',{name:pick(r.businessName,r.business?.name),address:pick(r.businessAddress,r.business?.address),url:pick(r.businessUrl,r.business?.url)});
   try{return canonicalYelp(record.url as string)===store.yelp_url&&matchesIdentity(record,target);}catch{return false;}
  });
  identity=roots.length>0;
  total=roots.map(r=>integer(pick(r.reviewCount,r.business?.reviewCount))).find(v=>v!==null)??null;
  topics=Array.isArray(roots[0]?.topics)?roots[0].topics:[];
  for(const r of roots)candidates.push(...(Array.isArray(r.reviews)?r.reviews:[r]));
 }
 const evidence:ReviewEvidence={identity_verified:identity,raw_count:candidates.length,duplicates:0,invalid:0,missing_language:0,possible_truncations:0,expected:total===null?null:Math.min(limit,total),complete:false,notes};
 const reviews:Review[]=[],seen=new Set<string>();
 for(const r of candidates){
  if(!r||typeof r.text!=='string'){evidence.invalid++;continue;}
  const id=pick(r.reviewId,r.id,r.reviewUrl);if(typeof id==='string'&&id){if(seen.has(id)){evidence.duplicates++;continue;}seen.add(id);}
  const rawDate=pick(r.publishedAtDate,r.date,r.publishedDate),date=typeof rawDate==='string'&&Number.isFinite(Date.parse(rawDate))?rawDate:null;
  const rawRating=platform==='google_maps'?pick(r.stars,r.rating):r.rating,rating=typeof rawRating==='number'&&rawRating>=1&&rawRating<=5?rawRating:null;
  const rawLanguage=pick(r.originalLanguage,r.language,r.reviewLanguage),language=typeof rawLanguage==='string'&&/^[a-z]{2,3}(?:[-_][a-zA-Z]{2,4})?$/.test(rawLanguage)?rawLanguage:null;
  if(!date||rating===null)evidence.invalid++;
  if(!language&&r.text.trim())evidence.missing_language++;
  if(/(?:read more|show more|…\s*more|\.\.\.\s*more|展开全文|查看更多|更多)\s*$/i.test(r.text))evidence.possible_truncations++;
  // Google encodes displayed line breaks in its original-text field. Preserve all other source characters.
  const text=platform==='google_maps'?r.text.replace(/<br\s*\/?>/gi,'\n'):r.text;
  reviews.push({date,rating,text,language});
 }
 reviews.sort((a,b)=>(b.date?Date.parse(b.date):-Infinity)-(a.date?Date.parse(a.date):-Infinity));
 const selected=reviews.slice(0,limit);
 if(!identity)notes.push('Target branch identity was not verified in provider output.');
 if(total===null)notes.push('Platform total review count is unavailable.');
 if(evidence.invalid)notes.push('Some review dates, ratings or original text fields are unavailable.');
 if(evidence.missing_language)notes.push('Original review language is unavailable for some reviews.');
 if(evidence.possible_truncations)notes.push('Some original texts require expansion/completeness review.');
 if(identity&&evidence.expected!==null&&selected.length<evidence.expected)notes.push('Fewer reviews were returned than the requested latest-review window.');
 if(!candidates.length&&total!==0)notes.push('No verified review text was returned; this is not evidence of zero reviews.');
 if(providerError)notes.push(providerError);
 evidence.complete=identity&&total!==null&&selected.length===evidence.expected&&!evidence.invalid&&!evidence.possible_truncations&&!providerError;
 const sourceTopics=topics.flatMap((v:any)=>typeof v==='string'?[v]:v&&typeof v.title==='string'?[v.title+(v.count!==undefined&&v.count!==null?' · '+String(v.count):'')]:[]);
 const record:ReviewRecord={platform,total_reviews:identity?total:null,topics:identity?sourceTopics:[],reviews:identity?selected:[],url:platform==='google_maps'?store.google_maps_url:store.yelp_url,fetched_at:fetchedAt,error:notes.length?notes.join(' '):null};
 return {record,evidence};
}
