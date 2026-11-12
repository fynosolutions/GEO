import {createHash} from 'node:crypto';
import type {MediaArticle,MediaEvidence} from './public.js';

export type SuppliedText={url:string;restaurants:{rank:number;name:string;blurb:string}[]};
/** Merge text explicitly supplied by the user; never infer source paragraphs or rewrite their wording. */
export function applySuppliedTexts(articles:MediaArticle[],evidence:MediaEvidence[],input:unknown){
 if(!Array.isArray(input)||input.length===0)throw Error('Supplied texts must be a non-empty article array.');
 if(articles.length!==evidence.length)throw Error('Article/evidence lengths differ.');
 const patches:{article:number;restaurant:number;text:string}[]=[],seenUrls=new Set<string>();
 for(const row of input){
  if(!row||typeof row.url!=='string'||!Array.isArray(row.restaurants)||row.restaurants.length===0)throw Error('Invalid supplied text article.');
  if(seenUrls.has(row.url))throw Error('Duplicate supplied article URL.');seenUrls.add(row.url);
  const index=articles.findIndex(a=>a.url===row.url);if(index<0)throw Error('Supplied text URL is not in the selected article records.');
  const seenRanks=new Set<number>();
  for(const text of row.restaurants){
   if(!text||!Number.isInteger(text.rank)||text.rank<1||typeof text.name!=='string'||typeof text.blurb!=='string'||!text.blurb.trim())throw Error('Supplied text requires rank, exact name and non-empty blurb.');
   if(seenRanks.has(text.rank))throw Error('Duplicate supplied restaurant rank.');seenRanks.add(text.rank);
   const restaurant=articles[index].restaurants.findIndex(r=>r.rank===text.rank&&r.name===text.name);
   if(restaurant<0)throw Error('Supplied text restaurant name/rank does not match the captured article.');
   const current=articles[index].restaurants[restaurant].blurb;if(current!==null&&current!==text.blurb)throw Error('Supplied text conflicts with an existing original paragraph.');
   patches.push({article:index,restaurant,text:text.blurb});
  }
 }
 // Validate the whole input before applying any changes.
 const result=structuredClone({articles,evidence});
 for(const patch of patches){
  const restaurant=result.articles[patch.article].restaurants[patch.restaurant];restaurant.blurb=patch.text;
  const observation=result.evidence[patch.article].descriptions?.find(d=>d.rank===restaurant.rank&&d.name===restaurant.name);
  if(observation){observation.present=true;observation.reason='exported';observation.characters=patch.text.length;}
 }
 for(const index of new Set(patches.map(p=>p.article))){
  const changed=patches.filter(p=>p.article===index),source=result.evidence[index];
  source.supplied_texts=changed.map(p=>({rank:result.articles[index].restaurants[p.restaurant].rank,sha256:createHash('sha256').update(p.text).digest('hex')}));
  source.issues=source.issues.filter(s=>!s.startsWith('Full copyrighted descriptions')&&!s.startsWith('Description text is present but excluded')&&!s.startsWith('Description layout was not recognized'));
  if(source.descriptions?.some(d=>d.reason==='not_selected'))source.issues.push('Description text is present but excluded by the selected export policy; null does not mean absent.');
  if(source.descriptions?.some(d=>d.reason==='parse_failed'))source.issues.push('Description layout was not recognized for some entries; absence is not established.');
  if(result.articles[index].restaurants.some(r=>r.blurb===null))source.issues.push('Some original descriptions are still not exported; see per-entry description evidence.');
  source.issues.push('Supplementary original text supplied by the user; wording preserved, source-page correspondence not independently verified.');
 }
 return result;
}
