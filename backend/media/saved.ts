import {load} from 'cheerio';
import {createHash} from 'node:crypto';
import {parseMediaArticle} from './public.js';
import type {MediaSource,MediaArticle,MediaEvidence} from './public.js';

// Observed spellings in the reviewed FoodNYC thread, not a general restaurant name classifier.
const spellings=[/\blao\s*jie\b/ig,/\b99\s+favor\s+taste\b/ig,/\bEasy\s+Joy\b/ig,/\bFunny\s+BBQ\b/ig,/\bZao\s+Men\s+Qian\b/ig,/\bK-?pot\b/ig,/\bChon?g?qing\s+Lao\s+zao\b/ig,/\bhou\s+yi\b/ig,/\bHometown\b/ig,/\bMikiya\b/ig,/\bXiang\s+Hot\s+Pot\b/ig,/\bDolar\s+Shop\b/ig];
export function parseSavedMediaPage(html:string,source:MediaSource,savedAt:string,reviewed=false){
 const savedUrl=html.match(/saved from url=\([^)]*\)([^\r\n]+?)\s*-->/)?.[1]?.trim();
 if(savedUrl!==source.url)throw Error('Saved HTML source URL does not match the configured article.');
 if(!Number.isFinite(Date.parse(savedAt)))throw Error('Saved HTML timestamp is invalid.');
 const hash=createHash('sha256').update(html).digest('hex'),$=load(html);
 $('script,style,noscript,svg').remove();
 if(source.site==='The Infatuation'&&source.id!=='infatuation-hot-pot-directory'){
  const result=parseMediaArticle(html,source,savedAt);
  $('[data-testid="venue-title"]').each((index,e)=>{
   const card=$(e).closest('[id]'),paragraphs=card.find('div[city] p').map((_,p)=>$(p).text().trim()).get().filter(Boolean);
   if(result.article.restaurants[index]&&paragraphs.length)result.article.restaurants[index].blurb=paragraphs.join('\n\n');
  });
  result.evidence.source_kind='user_saved_html';result.evidence.user_file_sha256=hash;
  result.evidence.issues=result.evidence.issues.filter(s=>!s.startsWith('Full copyrighted descriptions'));
  if(result.article.restaurants.some(r=>!r.blurb))result.evidence.issues.push('Some descriptions were not present in the saved venue-description layout.');
  result.evidence.issues.push('Descriptions extracted from the user-provided saved HTML venue paragraphs; wording and paragraph order retained.');
  return result;
 }
 if(source.id!=='reddit-hot-pot')throw Error('No saved-page parser is validated for this source.');
 const post=$('shreddit-post').filter((_,e)=>$(e).attr('permalink')===new URL(source.url).pathname).first();
 if(post.length!==1)throw Error('Saved Reddit post identity is unavailable.');
 const declaredText=post.attr('comment-count')??'',declared=/^\d+$/.test(declaredText)?Number(declaredText):null;
 const postId=new URL(source.url).pathname.split('/')[4],tree=$('#comment-tree-content-anchor-'+postId);
 if(tree.length!==1)throw Error('Saved Reddit comment-tree boundary is unavailable.');
 const comments=tree.find('shreddit-comment');
 const ids=new Set<string>();let readable=0,deleted=0,unavailable=0;
 const article:MediaArticle={url:source.url,site:source.site,title:$('h1').first().text().trim()||null,published:null,updated:null,restaurants:[]};
 const evidence:MediaEvidence={source_id:source.id,fetched_at:savedAt,status:'partial',expected_count:null,extracted_count:0,count_verified:false,source_kind:'user_saved_html',user_file_sha256:hash,issues:[],dates:[],mentions:[]};
 const created=post.attr('created-timestamp'),parsed=created?Date.parse(created):NaN;
 if(Number.isFinite(parsed)){article.published=new Date(parsed).toISOString();evidence.dates.push({field:'published',value:created!,source:'saved post created-timestamp'});}
 const seen=new Set<number>();let unique=true;
 comments.each((_,e)=>{
  const n=$(e),id=n.attr('thingid');if(!id||ids.has(id)){unique=false;return;}ids.add(id);
  if(n.attr('postid')!=='t3_'+postId&&!(n.attr('postid')===undefined&&n.is('[is-comment-deleted]'))){unavailable++;return;}
  const body=n.find('[slot="comment"]').filter((_,b)=>$(b).closest('shreddit-comment').attr('thingid')===id).first();
  const paragraphs=body.find('p').map((_,p)=>$(p).text().trim()).get().filter(Boolean);
  const text=paragraphs.length?paragraphs.join('\n\n'):body.text().trim();
  if(!text){const own=n.clone();own.find('shreddit-comment').remove();if(/\[(?:deleted|removed|已删除|已移除)\]/i.test(own.text()))deleted++;else unavailable++;return;}
  readable++;
  const hits=spellings.flatMap((pattern,key)=>Array.from(text.matchAll(pattern),m=>({key,index:m.index!,name:m[0]}))).sort((a,b)=>a.index-b.index);
  for(const hit of hits){if(seen.has(hit.key))continue;seen.add(hit.key);const rank=article.restaurants.length+1;article.restaurants.push({name:hit.name,rank,address:null,blurb:text});evidence.mentions!.push({rank,context:text});}
 });
 evidence.comment_coverage={declared,saved:comments.length,readable,deleted,unavailable,unique_ids:unique,reviewed};
 evidence.count_verified=declared!==null&&declared===comments.length&&unique&&unavailable===0&&readable+deleted===declared&&reviewed;
 evidence.extracted_count=article.restaurants.length;
 evidence.issues.push(`User-provided thread HTML: ${comments.length} saved comment nodes, ${readable} readable, ${deleted} deleted/removed, ${unavailable} unexplained. Deleted text is not recovered.`);
 evidence.issues.push('Community mentions, not an editorial ranking. First occurrence in the saved Best-sort thread determines order; original spellings and paragraphs retained. No full branch addresses are inferred.');
 evidence.issues.push(reviewed?'Readable saved comments reviewed for restaurant mentions; coverage applies to this capture only, not future comments.':'Saved comments have not been reviewed for additional restaurant spellings; completeness remains unverified.');
 if(!evidence.count_verified)evidence.issues.push('Saved comment coverage does not satisfy count, identity, readability and review checks.');
 return {article,evidence};
}
