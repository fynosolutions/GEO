import {createHash} from 'node:crypto';import {readFile,writeFile,mkdir,unlink} from 'node:fs/promises';import {join} from 'node:path';import {setTimeout as delay} from 'node:timers/promises';
export type RedditCredentials={clientId:string;clientSecret:string;refreshToken:string;userAgent:string};
export class RedditError extends Error{constructor(public code:string,message:string,public status:number|null=null){super(message);}}
export function redditCredentials(env:Record<string,string|undefined>=process.env):RedditCredentials|null{
 const keys=['REDDIT_CLIENT_ID','REDDIT_CLIENT_SECRET','REDDIT_REFRESH_TOKEN','REDDIT_USER_AGENT'];if(keys.some(k=>!env[k]?.trim()))return null;
 if(keys.some(k=>/[\r\n]/.test(env[k]!)))throw new RedditError('credentials_invalid','Reddit configuration contains an invalid line break.');
 return {clientId:env[keys[0]]!,clientSecret:env[keys[1]]!,refreshToken:env[keys[2]]!,userAgent:env[keys[3]]!};
}
export type RedditReader={get(path:string):Promise<any>;lastStatus?:number|null;lastContentType?:string|null;requestCount?:number;oauthCount?:number};
/** Read-only OAuth endpoints; credential/token values never enter errors, files or URLs. */
export function redditReader(credentials:RedditCredentials,transport:typeof fetch=fetch,options:{sleep?:(ms:number)=>Promise<void>;now?:()=>number}={}):RedditReader{
 let token='',expires=0,nextRequest=0,lastStatus:number|null=null,lastContentType:string|null=null,requests=0,oauthRequests=0;const sleep=options.sleep??(ms=>delay(ms)),now=options.now??Date.now;
 const json=async(response:Response)=>{try{return await response.json();}catch{throw new RedditError('invalid_response','Reddit returned invalid JSON.',response.status);}};
 return {get requestCount(){return requests;},get oauthCount(){return oauthRequests;},get lastStatus(){return lastStatus;},get lastContentType(){return lastContentType;},async get(path){
  if(!/^\/(?:comments\/[a-z0-9]+\.json\?|api\/morechildren\?)/.test(path))throw new RedditError('invalid_request','Only public comment read endpoints are enabled.');
  if(!token||now()>=expires){
   oauthRequests++;let response:Response;try{response=await transport('https://www.reddit.com/api/v1/access_token',{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:'Basic '+Buffer.from(credentials.clientId+':'+credentials.clientSecret).toString('base64'),'User-Agent':credentials.userAgent,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:credentials.refreshToken})});}catch{throw new RedditError('oauth_failed','Reddit OAuth request could not connect.');}
   if(!response.ok)throw new RedditError('oauth_failed','Reddit OAuth rejected the configured credentials (HTTP '+response.status+').',response.status);
   const data=await json(response);if(typeof data.access_token!=='string'||!data.access_token||typeof data.scope!=='string'||!data.scope.split(/[ ,]+/).some((s:string)=>s==='read'||s==='*'))throw new RedditError('oauth_failed','Reddit OAuth did not grant a read token.');token=data.access_token;expires=now()+Math.max(0,(Number(data.expires_in)||3600)-60)*1000;
  }
  if(nextRequest>now())await sleep(Math.min(nextRequest-now(),60000));
  requests++;let response:Response;try{response=await transport('https://oauth.reddit.com'+path,{redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:'Bearer '+token,'User-Agent':credentials.userAgent}});}catch{throw new RedditError('request_failed','Reddit comment request could not connect.');}
  lastStatus=response.status;lastContentType=response.headers.get('content-type');nextRequest=now()+1100;
  if(response.headers.get('x-ratelimit-remaining')!==null&&Number(response.headers.get('x-ratelimit-remaining'))<=0){const reset=Number(response.headers.get('x-ratelimit-reset'));if(Number.isFinite(reset)&&reset>0)nextRequest=now()+Math.min(reset*1000,60000);}
  if(response.status===429)throw new RedditError('rate_limited','Reddit rate limit reached; no anonymous or proxy fallback was attempted.',429);
  if(!response.ok)throw new RedditError('api_denied','Reddit comments unavailable (HTTP '+response.status+').',response.status);
  return json(response);
 }};
}
export type RedditComment={id:string;parent_id:string;body:string|null;permalink:string;created_utc:number|null;deleted:boolean};
export type RedditSnapshot={url:string;post_id:string;fetched_at:string;title:string|null;published:string|null;updated:string|null;declared_comments:number|null;http_status:number|null;content_type:string|null;comments:RedditComment[];unavailable_ids:string[];api_calls:number;tree_complete:boolean;error:string|null};
export function redditThread(url:string){const u=new URL(url),m=u.pathname.match(/^\/r\/([A-Za-z0-9_]+)\/comments\/([a-z0-9]+)(?:\/[^/]+)?\/?$/);if(u.protocol!=='https:'||!['www.reddit.com','reddit.com'].includes(u.hostname)||!m)throw new RedditError('invalid_request','Expected a public Reddit thread URL.');return {subreddit:m[1],postId:m[2]};}
export function snapshotHash(snapshot:RedditSnapshot){return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');}
export async function fetchRedditThread(url:string,reader:RedditReader,maxCalls=100):Promise<RedditSnapshot>{
 if(!Number.isInteger(maxCalls)||maxCalls<1||maxCalls>100)throw new RedditError('invalid_request','Reddit capture request cap must be 1–100.');
 const {postId,subreddit}=redditThread(url),fullname='t3_'+postId;
 const snapshot:RedditSnapshot={url,post_id:postId,fetched_at:new Date().toISOString(),title:null,published:null,updated:null,declared_comments:null,http_status:null,content_type:null,comments:[],unavailable_ids:[],api_calls:0,tree_complete:false,error:null};
 const first=await reader.get('/comments/'+postId+'.json?sort=old&limit=500&raw_json=1');snapshot.api_calls++;snapshot.http_status=reader.lastStatus??null;snapshot.content_type=reader.lastContentType??null;
 const post=first?.[0]?.data?.children?.[0];if(post?.kind!=='t3'||post.data?.id!==postId||String(post.data?.subreddit).toLowerCase()!==subreddit.toLowerCase())throw new RedditError('invalid_response','Reddit returned a different thread identity.',reader.lastStatus??null);
 if(['[deleted]','[removed]'].includes(post.data.selftext))throw new RedditError('post_unavailable','The thread is deleted/removed; content was not retained.',reader.lastStatus??null);
 const data=post.data,toDate=(v:unknown)=>typeof v==='number'&&v>0&&Number.isFinite(v)&&v*1000<8.64e15?new Date(v*1000).toISOString():null;
 snapshot.title=typeof data.title==='string'?data.title:null;snapshot.published=toDate(data.created_utc);snapshot.updated=toDate(data.edited);snapshot.declared_comments=Number.isInteger(data.num_comments)&&data.num_comments>=0?data.num_comments:null;
 const comments=new Map<string,RedditComment>(),pending=new Set<string>(),requested=new Set<string>(),unavailable=new Set<string>();let malformed=false;
 const postPath=typeof data.permalink==='string'&&data.permalink.startsWith('/r/'+subreddit+'/comments/'+postId+'/')?data.permalink.replace(/\/$/,''):new URL(url).pathname.replace(/\/$/,'');
 const ingest=(things:any[])=>{
  if(!Array.isArray(things)){malformed=true;return;}
  for(const thing of things){const r=thing?.data;
   if(thing?.kind==='more'){
    if(!Array.isArray(r?.children)){malformed=true;continue;}
    for(const id of r.children)if(typeof id==='string'&&/^[a-z0-9]+$/.test(id)&&!comments.has(id)&&!requested.has(id))pending.add(id);else if(typeof id!=='string'||!id.match(/^[a-z0-9]+$/))malformed=true;
    if(r.count>0&&r.children.length===0)malformed=true;continue;
   }
   if(thing?.kind!=='t1'||!r||!/^[a-z0-9]+$/.test(r.id??'')||r.link_id!==fullname||!/^t[13]_[a-z0-9]+$/.test(r.parent_id??'')){malformed=true;continue;}
   const deleted=r.body==='[deleted]'||r.body==='[removed]',body=deleted?null:typeof r.body==='string'?r.body:null;
   const permalink='https://www.reddit.com'+postPath+'/'+r.id+'/';
   if(comments.has(r.id)){const previous=comments.get(r.id)!;if(previous.body!==body||previous.parent_id!==r.parent_id)malformed=true;}
   const removed=deleted||comments.get(r.id)?.deleted===true;
   comments.set(r.id,{id:r.id,parent_id:r.parent_id,body:removed?null:body,permalink,created_utc:typeof r.created_utc==='number'?r.created_utc:null,deleted:removed});pending.delete(r.id);if(!removed&&(typeof body!=='string'||!body.trim())){malformed=true;unavailable.add(r.id);}else unavailable.delete(r.id);
   if(r.replies&&typeof r.replies==='object')ingest(r.replies.data?.children);
  }
 };
 ingest(first?.[1]?.data?.children);
 while(pending.size&&snapshot.api_calls<maxCalls&&comments.size<20000){
  const batch=[...pending].filter(id=>!comments.has(id)&&!requested.has(id)).slice(0,100);if(!batch.length)break;
  for(const id of batch){pending.delete(id);requested.add(id);}
  try{snapshot.api_calls++;const result=await reader.get('/api/morechildren?api_type=json&link_id='+fullname+'&children='+batch.join(',')+'&sort=old&raw_json=1');
   if(result?.json?.errors?.length||!Array.isArray(result?.json?.data?.things))throw new RedditError('invalid_response','Reddit reply expansion returned an incomplete response.');
   ingest(result.json.data.things);for(const id of batch)if(!comments.has(id))unavailable.add(id);
  }catch(e){snapshot.error=e instanceof RedditError?e.message:'Reddit reply expansion failed.';for(const id of batch)if(!comments.has(id))unavailable.add(id);break;}
 }
 for(const id of pending)if(!comments.has(id))unavailable.add(id);
 const order=(a:RedditComment,b:RedditComment)=>(a.created_utc??0)-(b.created_utc??0)||a.id.localeCompare(b.id);
 const children=new Map<string,RedditComment[]>();for(const c of comments.values()){if(!children.has(c.parent_id))children.set(c.parent_id,[]);children.get(c.parent_id)!.push(c);}
 const seen=new Set<string>();const append=(parent:string)=>{for(const c of (children.get(parent)??[]).sort(order)){if(seen.has(c.id)){malformed=true;continue;}seen.add(c.id);snapshot.comments.push(c);append('t1_'+c.id);}};append(fullname);
 for(const c of [...comments.values()].sort(order))if(!seen.has(c.id)){malformed=true;snapshot.comments.push(c);}
 snapshot.unavailable_ids=[...unavailable];snapshot.tree_complete=!malformed&&!unavailable.size&&!snapshot.error&&snapshot.comments.length===snapshot.declared_comments;
 if(!snapshot.tree_complete&&!snapshot.error)snapshot.error='Accessible comment coverage does not fully match the declared count or parent/reply structure.';
 return snapshot;
}
export async function saveRedditSnapshot(root:string,id:string,snapshot:RedditSnapshot){await mkdir(root,{recursive:true});await writeFile(join(root,id+'.reddit.json'),JSON.stringify({snapshot,sha256:snapshotHash(snapshot)},null,2)+'\n');}
export async function readRedditSnapshot(root:string,id:string,url:string,now=Date.now()){
 const path=join(root,id+'.reddit.json'),value=JSON.parse(await readFile(path,'utf8'));const snapshot=value.snapshot as RedditSnapshot;
 if(snapshot?.url!==url||value.sha256!==snapshotHash(snapshot)||!Number.isFinite(Date.parse(snapshot.fetched_at)))throw new RedditError('cache_invalid','Reddit cache identity, timestamp or content hash is invalid.');
 if(now-Date.parse(snapshot.fetched_at)>24*3600000||Date.parse(snapshot.fetched_at)>now+60000){await unlink(path);throw new RedditError('cache_expired','Reddit local snapshot expired and was removed; refresh through the official API.');}return snapshot;
}

export async function removeRedditSnapshot(root:string,id:string){try{await unlink(join(root,id+'.reddit.json'));}catch(e:any){if(e.code!=='ENOENT')throw e;}}
