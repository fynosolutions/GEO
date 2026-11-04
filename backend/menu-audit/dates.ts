export type DateSource='on_page'|'metadata'|'upload_date'|'unknown';
export type DateEvidence={menu_date:string|null;date_source:DateSource;date_text:string|null};
export function dateRange(value:string|null):[string,string]|null {
 if(!value)return null;
 if(/^\d{4}$/.test(value))return [`${value}-01-01`,`${value}-12-31`];
 if(/^\d{4}-\d{2}$/.test(value)){
  const [y,m]=value.split('-').map(Number);if(m<1||m>12)return null;
  return [`${value}-01`,`${value}-${new Date(Date.UTC(y,m,0)).getUTCDate()}`];
 }
 if(/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value)return [value,value];
 // Seasons preserve their uncertainty; do not invent a day or silently choose a hemisphere.
 const seasonal=value.match(/^(?:Spring|Summer|Fall|Autumn|Winter) (\d{4})$/i);
 return seasonal?[`${seasonal[1]}-01-01`,`${seasonal[1]}-12-31`]:null;
}
export function subtractMonths(date:string,months:number):string{
 const d=new Date(date.slice(0,10)+'T12:00:00Z'),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()-months);
 const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));return d.toISOString().slice(0,10);
}
export function freshness(date:string|null,asOf:string){
 const range=dateRange(date);if(!range)return {freshness:'unknown_date',year:null};
 const today=asOf.slice(0,10),boundary=subtractMonths(today,12);
 return {freshness:range[0]>today?'future_date':range[1]<boundary?'stale':range[0]>=boundary&&range[1]<=today?'fresh':'uncertain_date',year:range[0].slice(0,4)};
}
export function extractDate(text:string,metadata?:string|null,upload?:string|null):DateEvidence {
 // Only menu/update/version markers; footer copyright years are not menu dates.
 const pattern=/(?:updated?(?:\s+on)?|revised|effective|menu(?:\s+date)?|version)\s*[:–-]?\s*(\d{4}-\d{2}-\d{2}|\d{4}-\d{2}|\d{4})\b|\b((?:Spring|Summer|Fall|Autumn|Winter)\s+\d{4})\b/gi;
 const candidates=[...text.matchAll(pattern)].map(m=>({value:m[1]||m[2],raw:m[0]})).filter(v=>dateRange(v.value));
 const distinct=[...new Set(candidates.map(v=>v.value))];
 if(distinct.length===1)return {menu_date:distinct[0],date_source:'on_page',date_text:candidates[0].raw};
 if(distinct.length>1)return {menu_date:null,date_source:'unknown',date_text:'Conflicting on-page dates: '+distinct.join('; ')};
 for(const [value,source] of [[metadata,'metadata'],[upload,'upload_date']] as const){
  if(!value)continue;const parsed=dateRange(value)?value:Number.isFinite(Date.parse(value))?new Date(value).toISOString().slice(0,10):null;
  if(parsed)return {menu_date:parsed,date_source:source,date_text:value};
 }
 return {menu_date:null,date_source:'unknown',date_text:null};
}
export function channelsOutOfSync(menus:Array<{channel:string;url:string;menu_date:string|null}>){
 const comparisons=[];
 for(let i=0;i<menus.length;i++)for(let j=i+1;j<menus.length;j++){
  const a=menus[i],b=menus[j];if(a.channel===b.channel)continue;
  const ar=dateRange(a.menu_date),br=dateRange(b.menu_date);if(!ar||!br)continue;
  if(ar[1]<subtractMonths(br[0],6))comparisons.push({flag:'channels_out_of_sync',oldest_channel:a.channel,oldest_url:a.url,newer_channel:b.channel,newer_url:b.url});
  else if(br[1]<subtractMonths(ar[0],6))comparisons.push({flag:'channels_out_of_sync',oldest_channel:b.channel,oldest_url:b.url,newer_channel:a.channel,newer_url:a.url});
 }
 return comparisons;
}
