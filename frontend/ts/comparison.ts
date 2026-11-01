export type ComparisonSource={values:Record<string,unknown>;apify?:{items:unknown[];status?:string;review_themes?:{value:string|null}}};
export const coreFields:Record<string,string>={name:'Name',address:'Address',phone:'Phone',opening_hours:'Opening hours',cuisines:'Cuisine / categories',rating:'Rating',review_count:'Rating / review count'};
export const supplementaryFields:Record<string,string>={official_website:'Official website',price_range:'Price range',review_themes:'Review themes'};
export const comparisonFields={...coreFields,...supplementaryFields};
export function versionCandidates(p:ComparisonSource,field:string,version:'multi'|'apify'):Candidate[]{
 if(version==='multi')return hasData(p.values[field])?[{value:p.values[field],source:'Website / search',key:field}]:[];
 if(p.apify?.status==='location_mismatch')return[];
 if(field==='review_themes'&&hasData(p.apify?.review_themes?.value))return[{value:p.apify!.review_themes!.value,source:'Apify',key:'review_themes'}];
 return candidates({...p,values:{}},field).filter(c=>c.source==='Apify');
}
// Field names only are aligned. Values and JSON types remain unchanged.
const aliases:Record<string,string[]>={name:['name','title','restaurant.name'],address:['addressText','address.formatted','fullAddress','restaurant.location.address.display_address','location.address','address','addressObj'],phone:['phone','phoneNumber','phoneUnformatted'],official_website:['website'],opening_hours:['openingHours','operationHours','hours','availableHours','openingHoursFormatted'],cuisines:['cuisines','cuisine','categories','categoryName','cuisineList','restaurant.description'],rating:['restaurant.rating.average','ratingValue','rating','totalScore','aggregatedRating'],review_count:['reviewCount','reviewsCount','numberOfReviews','ratingCount','restaurant.rating.count'],price_range:['priceRange','priceLevel','priceBucket','priceRating','price']};
function readPath(record:Record<string,unknown>,path:string):unknown{let value:unknown=record;for(const key of path.split('.')){if(!value||typeof value!=='object'||!Object.hasOwn(value,key))return undefined;value=(value as Record<string,unknown>)[key];}return value;}
export function hasData(v:unknown):boolean{return v!==null&&v!==undefined&&v!==''&&(Array.isArray(v)?v.some(hasData):typeof v==='object'?Object.values(v).some(hasData):true);}
export type Candidate={value:unknown;source:'Apify'|'Website / search';key:string};
export function candidates(p:ComparisonSource,field:string):Candidate[]{
 const list:Candidate[]=[];
 const records=(p.apify?.status==='location_mismatch'?[]:p.apify?.items||[]).filter((v):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v));
 // Multiple provider records may be different branches: do not silently combine them.
 if(records.length===1)for(const key of aliases[field]||[]){const value=readPath(records[0],key);if(hasData(value)){list.push({value,source:'Apify',key});break;}}
 if(hasData(p.values[field]))list.push({value:p.values[field],source:'Website / search',key:field});
 // Some Actors expose hours as numeric weekRanges without weekday labels.
 // Prefer an already evidenced display string instead of inventing a weekday mapping.
 if(field==='opening_hours'&&list[0]?.source==='Apify'&&list[0].value&&typeof list[0].value==='object'&&'weekRanges' in list[0].value)list.sort((a,b)=>Number(a.source==='Apify')-Number(b.source==='Apify'));
 return list.filter((c,i)=>!list.slice(0,i).some(a=>typeof a.value!=='object'&&typeof c.value!=='object'?String(a.value)===String(c.value):JSON.stringify(a.value)===JSON.stringify(c.value)));
}
export function hasCoreData(p:ComparisonSource):boolean{return Object.keys(coreFields).some(f=>candidates(p,f).length>0);}
