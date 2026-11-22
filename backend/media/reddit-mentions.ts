import {createHash} from 'node:crypto';import type {MediaArticle,MediaEvidence,MediaSource} from './public.js';import type {MediaTarget} from './membership.js';import {snapshotHash,type RedditSnapshot} from './reddit.js';
export type MentionSpan={start:number;end:number};
export type RedditReview={url:string;content_sha256:string;comments:{id:string;reviewed:boolean;mentions:MentionSpan[]}[]};
const escape=(v:string)=>v.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function mediaMentionCatalog(articles:MediaArticle[],targets:MediaTarget[]){return [...new Set([...articles.flatMap(a=>a.restaurants.map(r=>r.name)),...targets.flatMap(t=>[t.name,...t.aliases])].map(n=>n.trim()).filter(n=>n.length>=3))];}
export function suggestedMentions(body:string,names:string[]):MentionSpan[]{
 const hits:MentionSpan[]=[];
 for(const name of names){const phrase=escape(name).replace(/\s+/g,'\\s+'),pattern=/\p{Script=Han}/u.test(name)?phrase:'(?<![\\p{L}\\p{N}])'+phrase+'(?![\\p{L}\\p{N}])';
  for(const m of body.matchAll(new RegExp(pattern,'giu')))hits.push({start:m.index!,end:m.index!+m[0].length});
 }
 hits.sort((a,b)=>a.start-b.start||(b.end-b.start)-(a.end-a.start));const out:MentionSpan[]=[],occupied:MentionSpan[]=[],seen=new Set<string>();
 for(const h of hits){const key=body.slice(h.start,h.end).toLowerCase();if(occupied.some(v=>h.start<v.end&&h.end>v.start))continue;occupied.push(h);if(seen.has(key))continue;out.push(h);seen.add(key);}return out;
}
export function redditMentions(snapshot:RedditSnapshot,source:MediaSource,catalog:string[],review?:RedditReview){
 const hash=snapshotHash(snapshot),contentHash=mentionContentHash(snapshot),readable=snapshot.comments.filter(c=>!c.deleted&&typeof c.body==='string'&&c.body.trim()),issues:string[]=[];
 const template:RedditReview&{comments:(RedditReview['comments'][number]&{body:string})[]}={url:source.url,content_sha256:contentHash,comments:readable.map(c=>({id:c.id,reviewed:false,body:c.body!,mentions:suggestedMentions(c.body!,catalog)}))};
 const accepted=new Map<string,MentionSpan[]>();let reviewed=readable.length===0;
 if(review&&review.url===source.url&&review.content_sha256===contentHash){
  if(!Array.isArray(review.comments))throw Error('Reddit mention review must contain a comment array.');
  const ids=new Set<string>();
  for(const item of review.comments){const comment=readable.find(c=>c.id===item.id);if(!comment||ids.has(item.id)||typeof item.reviewed!=='boolean'||!Array.isArray(item.mentions))throw Error('Reddit mention review contains unknown/duplicate comments or invalid fields.');ids.add(item.id);
   const sorted=[...item.mentions].sort((a,b)=>a.start-b.start);let end=0;
   for(const span of sorted){if(!Number.isInteger(span.start)||!Number.isInteger(span.end)||span.start<end||span.end<=span.start||span.end>comment.body!.length||!comment.body!.slice(span.start,span.end).trim())throw Error('Reddit mention review span does not match the original body.');end=span.end;}
   if(item.reviewed)accepted.set(item.id,sorted);
  }
  reviewed=accepted.size===readable.length;
 }else if(review)issues.push('Mention review does not match the current thread content and was not reused.');
 const article:MediaArticle={url:source.url,site:source.site,title:snapshot.title,published:snapshot.published,updated:snapshot.updated,restaurants:[]};
 const descriptions:NonNullable<MediaEvidence['descriptions']>=[],closures:NonNullable<MediaEvidence['closure_markers']>=[];
 for(const c of readable){const spans=accepted.get(c.id)??suggestedMentions(c.body!,catalog);
  for(const span of spans){const name=c.body!.slice(span.start,span.end),tail=c.body!.slice(span.end),closed=/^\s+(?:(?:is|was|has|is now)\s+)?(?:permanently\s+closed|closed\s+permanently)\b/i.test(tail),rank=article.restaurants.length+1;
   article.restaurants.push({name,rank,address:null,blurb:c.body,closed,comment_url:c.permalink});descriptions.push({rank,name,present:true,reason:'exported',selector:'official comment body '+c.id,characters:c.body!.length});
   if(closed)closures.push({rank,name,marker:'explicit permanent-closure phrase immediately after the source name',source:c.permalink});
  }
 }
 if(!reviewed)issues.push('Restaurant names use exact literal matches from the current media/target catalog; unknown names may be missed. Full semantic mention coverage has not been reviewed.');
 if(!snapshot.tree_complete)issues.push(snapshot.error??'Comment tree coverage is partial.');
 issues.push('Community rank is deterministic chronological parent-tree traversal order, not an editorial ranking. Separate comments keep separate original quotes and comment URLs.');
 const evidence:MediaEvidence={source_id:source.id,fetched_at:snapshot.fetched_at,status:article.restaurants.length?'partial':'failed',expected_count:null,extracted_count:article.restaurants.length,count_verified:snapshot.tree_complete&&reviewed,source_kind:'reddit_oauth',issues,dates:[],descriptions,closure_markers:closures,comment_coverage:{declared:snapshot.declared_comments,saved:snapshot.comments.length,readable:readable.length,deleted:snapshot.comments.filter(c=>c.deleted).length,unavailable:snapshot.unavailable_ids.length,unique_ids:new Set(snapshot.comments.map(c=>c.id)).size===snapshot.comments.length,reviewed},reddit:{tree_complete:snapshot.tree_complete,mentions_reviewed:reviewed,unresolved:snapshot.unavailable_ids.length,api_calls:snapshot.api_calls,capture_sha256:hash,content_sha256:contentHash}};
 return {article,evidence,template};
}

export function mentionContentHash(snapshot:RedditSnapshot){
 return createHash('sha256').update(JSON.stringify({url:snapshot.url,post_id:snapshot.post_id,comments:snapshot.comments.map(c=>({id:c.id,parent_id:c.parent_id,body:c.body,deleted:c.deleted,permalink:c.permalink}))})).digest('hex');
}
