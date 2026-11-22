import {readManualMedia} from './manual.js';
import {snapshotHash,redditCredentials,redditReader,fetchRedditThread,readRedditSnapshot,saveRedditSnapshot,removeRedditSnapshot,RedditError,type RedditReader,type RedditSnapshot} from './reddit.js';
import {mediaMentionCatalog,redditMentions,type RedditReview} from './reddit-mentions.js';
import {mkdir,writeFile} from 'node:fs/promises';import {join} from 'node:path';import {setTimeout as delay} from 'node:timers/promises';
import {configuredMediaSources} from './sources.js';import {fetchMediaPage,readMediaCapture,saveMediaCapture,type MediaCapture} from './live.js';import {parseConfiguredMediaPage} from './layouts.js';
import {evaluateMediaAcceptance,descriptionAvailability,type MediaArticle,type MediaEvidence,type MediaSource} from './public.js';import type {MediaTarget} from './membership.js';
export type MediaOutcome='parsed'|'partial'|'parser_gap'|'blocked'|'http_error'|'network_error'|'not_captured'|'deferred'|'unsupported_content'|'requires_rendering'|'cache_error'|'storage_error'|'credentials_missing'|'oauth_error'|'rate_limited'|'api_denied';
export function mediaAccessOutcome(html:string,meta:MediaCapture):MediaOutcome|null{
 if(meta.error)return 'network_error';if([401,403,429].includes(meta.status??0))return 'blocked';
 if(meta.status===202)return /awswaf|challenge|captcha/i.test(html)?'blocked':'requires_rendering';
 if(meta.status!==200)return 'http_error';
 if(new URL(meta.final_url).pathname==='/'&&new URL(meta.url).pathname!=='/')return 'unsupported_content';
 if(meta.content_type&&!/text\/html|application\/xhtml\+xml/i.test(meta.content_type))return 'unsupported_content';
 if(/<title[^>]*>\s*(?:just a moment|access denied|verify you are human|security check)/i.test(html))return 'blocked';return null;
}
export async function collectConfiguredMedia(config:unknown,options:{cache:string;manualDir?:string;offline?:boolean;offlineHtml?:boolean;transport?:typeof fetch;targets?:MediaTarget[];redditClient?:RedditReader|null;redditReviews?:RedditReview[];onProgress?:(value:{url:string;outcome:MediaOutcome;entries:number})=>void}){
 const sources=configuredMediaSources(config),rows=new Map<string,{article:MediaArticle;evidence:MediaEvidence;access:any}>(),templates:any[]=[];
 const nextRequest=new Map<string,number>(),httpOffline=options.offline||options.offlineHtml;
 let api=options.redditClient,credentialError:RedditError|undefined;if(api===undefined){try{const credentials=options.offline||!sources.some(s=>s.page_type==='community')?null:redditCredentials();api=credentials?redditReader(credentials,options.transport):null;}catch(e){credentialError=e instanceof RedditError?e:new RedditError('credentials_invalid','Reddit configuration is invalid.');api=null;}}
 const empty=(source:MediaSource)=>({article:{url:source.url,site:source.site,title:null,published:null,updated:null,restaurants:[]} as MediaArticle,evidence:{source_id:source.id,fetched_at:null,status:'failed',expected_count:null,extracted_count:0,count_verified:false,issues:[],dates:[]} as MediaEvidence});
 for(const source of sources.filter(s=>s.page_type!=='community')){
  let outcome:MediaOutcome='network_error',meta:MediaCapture|undefined,reason:string|null=null;let stage:'capture'|'storage'|'parse'='capture';
  let {article,evidence:entry}=empty(source);
  try{
   const host=new URL(source.url).hostname;if(!httpOffline)await delay(Math.max(0,(nextRequest.get(host)??0)-Date.now()));
   const captured=httpOffline?await readMediaCapture(options.cache,source):await fetchMediaPage(source,options.transport);
   if(!httpOffline)nextRequest.set(host,Date.now()+500);
   meta=captured.meta;if(!httpOffline){stage='storage';await saveMediaCapture(options.cache,source,captured);}stage='parse';
   const unavailable=mediaAccessOutcome(captured.html,meta);
   if(unavailable){outcome=unavailable;reason=meta.error??`HTTP ${meta.status}: ${unavailable}; no merchant facts inferred.`;}
   else{const result=parseConfiguredMediaPage(captured.html,source,meta.fetched_at,options.targets);article=result.article;entry=result.evidence;outcome=!article.restaurants.length?'parser_gap':entry.count_verified?'parsed':'partial';}
  }catch(e:any){outcome=stage==='parse'?'parser_gap':stage==='storage'?'storage_error':httpOffline?(e.code==='ENOENT'?'not_captured':'cache_error'):'network_error';reason=httpOffline&&e.code==='ENOENT'?'No cached capture for this exact URL; offline mode makes no requests.':e instanceof Error?e.message:'Media source failed.';}
  if(reason)entry.issues.push(reason);if(meta)entry.fetched_at=meta.fetched_at;
  const access:any={source_id:source.id,url:source.url,page_type:source.page_type,outcome,reason,fetched_at:meta?.fetched_at??null,http_status:meta?.status??null,final_url:meta?.final_url??null,content_type:meta?.content_type??null,sha256:meta?.sha256??null,entries:article.restaurants.length,count_verified:entry.count_verified,retrieval:httpOffline?'offline_replay':'fresh_http',capture_format:'html'};
  if(options.manualDir&&!['parsed','partial'].includes(outcome)){try{const m=await readManualMedia(options.manualDir,source);if(m){const parsed=parseConfiguredMediaPage(m.html,source,m.fetched_at,options.targets);if(!parsed.article.restaurants.length)throw Error('Manual HTML has no recognized restaurant layout.');article=parsed.article;entry=parsed.evidence;entry.source_kind='manual_html';entry.issues.unshift('User-saved HTML fallback; original direct-access failure retained in access evidence.');access.direct_outcome=outcome;access.direct_reason=reason;access.direct_sha256=access.sha256;access.direct_fetched_at=access.fetched_at;access.outcome=entry.count_verified?'parsed':'partial';access.reason=null;access.retrieval='manual_html';access.fetched_at=m.fetched_at;access.sha256=m.sha256;access.entries=article.restaurants.length;access.count_verified=entry.count_verified;outcome=access.outcome;}}catch(e){entry.issues.push(e instanceof Error?e.message:'Manual import failed.');}}
  rows.set(source.id,{article,evidence:entry,access});options.onProgress?.({url:source.url,outcome,entries:article.restaurants.length});
 }
 const catalog=mediaMentionCatalog([...rows.values()].map(r=>r.article),options.targets??[]);
 for(const source of sources.filter(s=>s.page_type==='community')){
  let {article,evidence:entry}=empty(source),outcome:MediaOutcome='credentials_missing',reason:string|null=null,snapshot:RedditSnapshot|undefined,apiStatus:number|null=null;const readsBefore=api?.requestCount??0,oauthBefore=api?.oauthCount??0;
  try{
   if(options.offline)snapshot=await readRedditSnapshot(options.cache,source.id,source.url);
   else{if(credentialError)throw credentialError;if(!api)throw new RedditError('credentials_missing','Reddit official API credentials are missing. Configure the approved OAuth client, refresh token and User-Agent; no anonymous request was made.');snapshot=await fetchRedditThread(source.url,api);await saveRedditSnapshot(options.cache,source.id,snapshot);}
   const result=redditMentions(snapshot,source,catalog,options.redditReviews?.find(r=>r.url===source.url));article=result.article;entry=result.evidence;templates.push(result.template);outcome=entry.count_verified?'parsed':'partial';reason=entry.count_verified?null:entry.issues.join(' ');
  }catch(e:any){
   if(e instanceof RedditError){if(e.code==='post_unavailable')await removeRedditSnapshot(options.cache,source.id);apiStatus=e.status;outcome=e.code==='credentials_missing'?'credentials_missing':e.code==='oauth_failed'||e.code==='credentials_invalid'?'oauth_error':e.code==='rate_limited'?'rate_limited':e.code==='api_denied'||e.code==='post_unavailable'?'api_denied':e.code.startsWith('cache_')?'cache_error':e.code==='invalid_response'||e.code==='invalid_request'?'parser_gap':'network_error';reason=e.message;}
   else{outcome=options.offline&&e.code==='ENOENT'?'not_captured':options.offline?'cache_error':'parser_gap';reason=options.offline&&e.code==='ENOENT'?'No official Reddit snapshot is cached; offline mode does not use saved HTML or make requests.':'Reddit capture or mention validation failed.';}
   entry.issues.push(reason!);
  }
  const access={source_id:source.id,url:source.url,page_type:source.page_type,outcome,reason,fetched_at:snapshot?.fetched_at??null,http_status:snapshot?.http_status??apiStatus,final_url:source.url,content_type:snapshot?.content_type??null,sha256:snapshot?snapshotHash(snapshot):null,entries:article.restaurants.length,count_verified:entry.count_verified,retrieval:options.offline?'offline_replay':'reddit_oauth',capture_format:'reddit_snapshot',api_calls:options.offline?0:snapshot?.api_calls??Math.max(0,(api?.requestCount??0)-readsBefore),capture_api_calls:snapshot?.api_calls??0,oauth_calls:Math.max(0,(api?.oauthCount??0)-oauthBefore)};
  rows.set(source.id,{article,evidence:entry,access});options.onProgress?.({url:source.url,outcome,entries:article.restaurants.length});
 }
 const ordered=sources.map(s=>rows.get(s.id)!),articles=ordered.map(r=>r.article),evidence=ordered.map(r=>r.evidence),access=ordered.map(r=>r.access),evaluated=evaluateMediaAcceptance(articles,evidence,sources);
 const counts:Record<string,number>={};for(const row of access)counts[row.outcome]=(counts[row.outcome]??0)+1;
 const redditApiCalls=ordered.reduce((n,r)=>n+(r.access.api_calls??0),0),redditOauthCalls=ordered.reduce((n,r)=>n+(r.access.oauth_calls??0),0);
 const redditSources=ordered.filter(r=>r.access.page_type==='community');const phase3Complete=redditSources.length>0&&redditSources.every(r=>r.evidence.reddit?.tree_complete&&r.evidence.reddit?.mentions_reviewed);
 return {sources,articles,evidence:evaluated.evidence,access,templates,acceptance:{...evaluated.acceptance,phase:3,phase3_code_complete:true,phase3_complete:phase3Complete,reddit_api_verified:redditSources.length>0&&redditSources.every(r=>r.evidence.source_kind==='reddit_oauth'),ready_for_delivery:false,access_counts:counts,apify_runs:0,reddit_api_calls:redditApiCalls,reddit_oauth_calls:redditOauthCalls,reddit_cost_status:redditApiCalls||redditOauthCalls?'not_measured':'no_requests',paid_calls:redditApiCalls||redditOauthCalls?null:0},availability:descriptionAvailability(articles,evaluated.evidence)};
}
export async function writeConfiguredMedia(out:string,result:Awaited<ReturnType<typeof collectConfiguredMedia>>,input:{urls_file:string;sha256:string}){
 await mkdir(out,{recursive:true});
 const files:Record<string,unknown>={'articles.json':result.articles,'evidence.json':{phase:3,sources:result.evidence},'access-checks.json':result.access,'acceptance.json':result.acceptance,'description-availability.json':result.availability,'reddit-review-template.json':{threads:result.templates},'input-manifest.json':{...input,urls:result.sources.map(s=>s.url),sources:result.sources}};
 for(const [name,value] of Object.entries(files))await writeFile(join(out,name),JSON.stringify(value,null,2)+'\n');
 const cell=(v:unknown)=>String(v??'—').replace(/\|/g,'\\|').replace(/[\r\n]/g,' ');
 const lines=['# Issue #20 phases 1–3 local result','',`Inputs: ${result.sources.length}; extracted entries: ${result.acceptance.restaurant_count}. Closed markers and official Reddit OAuth are implemented. See per-source credential/tree/mention coverage; manual exceptions and final delivery are pending.`,'','| URL | Type | Outcome | HTTP | Entries | Reason |','|---|---|---|---|---:|---|'];
 for(const r of result.access)lines.push('| '+[r.url,r.page_type,r.outcome,r.http_status,r.entries,r.reason??result.evidence.find(e=>e.source_id===r.source_id)?.issues.join(' ')].map(cell).join(' | ')+' |');
 await writeFile(join(out,'coverage.md'),lines.join('\n')+'\n');
}
