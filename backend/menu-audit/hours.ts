import type {Listing} from '../public.js';
const days=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
type Interval={open:string;close:string;start:number;end:number};
function clock(value:string):number|null {
 const m=value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);if(!m)return null;
 let h=Number(m[1]),min=Number(m[2]||0);if(min>59)return null;
 if(m[3]){if(h<1||h>12)return null;h=h%12+(m[3].toLowerCase()==='pm'?12:0);}else if(h>24||h===24&&min!==0)return null;
 return h*60+min;
}
const fmt=(m:number)=>`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
export function parseDay(value:unknown):Interval[]|null{
 if(typeof value!=='string')return null;
 const v=value.replace(/\u202f|\u00a0/g,' ').trim();if(/^closed$/i.test(v))return [];
 if(/^(open )?24 hours$/i.test(v))return [{open:'00:00',close:'24:00',start:0,end:1440}];
 const intervals:Interval[]=[];
 for(const part of v.split(/[,;]/)){
  const pair=part.trim().split(/\s*(?:–|—|-|\bto\b)\s*/i);if(pair.length!==2)return null;
  const a=clock(pair[0]),b=clock(pair[1]);if(a===null||b===null||a>=1440||a===b)return null;
  intervals.push({open:fmt(a),close:fmt(b),start:a,end:b<=a?b+1440:b});
 }
 intervals.sort((a,b)=>a.start-b.start);if(intervals.some((v,i)=>i>0&&v.start<intervals[i-1].end))return null;
 return intervals;
}
export function week(raw:unknown):Array<Interval[]|null>{
 const fromValue=(value:unknown):Interval[]|null=>Array.isArray(value)&&value.every(v=>typeof v==='string')?parseDay(value.join(';')):parseDay(value);
 const fromMinutes=(entries:any[]):Interval[]|null=>{
  if(!entries.length)return [];
  if(entries.some(v=>!Number.isInteger(v.startTime)||!Number.isInteger(v.endTime)||v.startTime<0||v.startTime>=1440||v.endTime<0||v.endTime>1440))return null;
  return parseDay(entries.map(v=>`${fmt(v.startTime)}-${fmt(v.endTime)}`).join(';'));
 };
 if(Array.isArray(raw)){
  if(raw.some(v=>typeof v?.dayRange==='string')){
   const dayIndex=(name:string)=>days.findIndex(day=>[day.toLowerCase(),day.slice(0,3).toLowerCase()].includes(name.trim().toLowerCase().replace(/\.$/,'')));
   const indices=(range:string):number[]=>{
    if(/^(every day|daily)$/i.test(range.trim()))return days.map((_,i)=>i);
    const parts=range.split(/\s*(?:-|–|—|\bto\b)\s*/i),a=dayIndex(parts[0]);
    if(a<0)return [];if(parts.length===1)return [a];if(parts.length!==2)return [];
    const b=dayIndex(parts[1]);if(b<0)return [];const result=[a];while(result[result.length-1]!==b)result.push((result[result.length-1]+1)%7);return result;
   };
   return days.map((_,i)=>{const matches=raw.filter(v=>typeof v?.dayRange==='string'&&indices(v.dayRange).includes(i));return !matches.length||matches.some(v=>!Array.isArray(v.sectionHours))?null:fromMinutes(matches.flatMap(v=>v.sectionHours));});
  }
  // Identical values for all seven weekdays need no assumption about numeric day ordering.
  if(raw.length===7&&raw.every(v=>Array.isArray(v?.timeRanges))&&new Set(raw.map(v=>JSON.stringify(v.timeRanges))).size===1)return days.map(()=>fromValue(raw[0].timeRanges));
 }
 if(raw&&typeof raw==='object'&&!Array.isArray(raw)&&Array.isArray((raw as any).weekRanges)){
  const ranges=(raw as any).weekRanges;
  if(ranges.length===7&&new Set(ranges.map((v:any)=>JSON.stringify(v))).size===1)return days.map(()=>parseDay(ranges[0].map((v:any)=>`${v.openHours}-${v.closeHours}`).join(';')));
 }
 return days.map(day=>{
  if(Array.isArray(raw)){
   const entries=raw.filter(v=>v&&typeof v==='object'&&String(v.day||v.dayOfWeekShort||v.dayOfWeek).toLowerCase().replace('https://schema.org/','').startsWith(day.toLowerCase().slice(0,3)));
   if(entries.length>1&&entries.every(v=>typeof v.opens==='string'&&typeof v.closes==='string'))return parseDay(entries.map(v=>`${v.opens}-${v.closes}`).join(';'));
   const entry=entries[0];
   return fromValue(entry?.regularHours??entry?.hours??(entry?.opens&&entry?.closes?`${entry.opens}-${entry.closes}`:null));
  }
  if(raw&&typeof raw==='object'){const key=Object.keys(raw).find(k=>k.toLowerCase().slice(0,3)===day.toLowerCase().slice(0,3));return key?fromValue((raw as any)[key]):null;}
  return null;
 });
}
export function compareHours(records:Listing[]){
 const google=records.find(r=>r.platform==='google_maps'&&r.matched&&r.found),baseline=week(google?.hours);
 return records.flatMap(r=>{
  const parsed=week(r.matched&&r.found?r.hours:null);
  return days.map((day,i)=>{
   const a=parsed[i],b=baseline[i];let verdict:string|null=null,reason:string|null=null,diff_minutes:number|number[]|null=null;
   if(a===null||b===null)reason='Missing or unsupported regular weekly hours; no comparison made.';
   else if(a.length!==b.length){verdict='不一致';reason='Different closed status or number of service intervals.';}
   else if(a.length===0){verdict='一致';diff_minutes=0;}
   else {
    const diffs=a.map((v,j)=>v.end-b[j].end);diff_minutes=diffs.length===1?diffs[0]:diffs;
    const opensMatch=a.every((v,j)=>v.start===b[j].start);
    if(!opensMatch)reason='Opening times differ from Google; the delivery closing-time allowance does not apply.';
    verdict=opensMatch&&diffs.every(d=>d===0)?'一致':opensMatch&&['doordash','uber_eats','grubhub'].includes(r.platform)&&diffs.every(d=>d>=-30&&d<=0)?'外卖常规提前':'不一致';
   }
   const values=(v:Interval[]|null,key:'open'|'close')=>v===null?null:v.length===0?'closed':v.length===1?v[0][key]:v.map(x=>x[key]);
   return {platform:r.platform,day,open:values(a,'open'),close:values(a,'close'),google_open:values(b,'open'),google_close:values(b,'close'),diff_minutes,verdict,reason,url:r.url,fetched_at:r.fetched_at,google_url:google?.url??null,google_fetched_at:google?.fetched_at??null};
  });
 });
}
