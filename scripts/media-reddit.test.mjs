import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {redditCredentials,redditReader,fetchRedditThread,saveRedditSnapshot,readRedditSnapshot,snapshotHash,RedditError} from '../dist/backend/media/reddit.js';
import {redditMentions,mediaMentionCatalog,suggestedMentions,mentionContentHash} from '../dist/backend/media/reddit-mentions.js';import {configuredMediaSources} from '../dist/backend/media/sources.js';import {collectConfiguredMedia} from '../dist/backend/media/current.js';import {parseConfiguredMediaPage} from '../dist/backend/media/layouts.js';
const url='https://www.reddit.com/r/FoodNYC/comments/abc/thread',source=configuredMediaSources({urls:[url]})[0];
const post=(count)=>({kind:'t3',data:{id:'abc',subreddit:'FoodNYC',title:'Hot pot discussion',permalink:'/r/FoodNYC/comments/abc/thread/',created_utc:1700000000,num_comments:count}});
const comment=(id,body,parent='t3_abc',replies='')=>({kind:'t1',data:{id,body,parent_id:parent,link_id:'t3_abc',created_utc:1700000001+id.charCodeAt(0),author:'not-retained-user',replies}});
const listing=(things)=>({data:{children:things}});
const response=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json',...headers}});
test('missing/partial OAuth config makes no request and credentials never leak in OAuth errors',async()=>{
 assert.equal(redditCredentials({}),null);assert.equal(redditCredentials({REDDIT_CLIENT_ID:'dummy'}),null);
 const credentials={clientId:'dummy-client',clientSecret:'dummy-secret',refreshToken:'dummy-refresh',userAgent:'script:test:1 (by /u/test)'};
 const client=redditReader(credentials,async(u,opts)=>{assert.equal(String(u),'https://www.reddit.com/api/v1/access_token');assert.ok(!String(u).includes(credentials.refreshToken));assert.equal(opts.method,'POST');return response({error:credentials.clientSecret},401);});
 await assert.rejects(()=>client.get('/comments/abc.json?raw_json=1'),e=>e.code==='oauth_failed'&&!e.message.includes(credentials.clientSecret));
 await assert.rejects(()=>client.get('/api/vote?'),/Only public comment/);
});
test('OAuth requests read scope, reuses token and honors rate headers without anonymous fallback',async()=>{
 let now=0,auth=0,gets=0;const waits=[];const c=redditReader({clientId:'client',clientSecret:'secret',refreshToken:'refresh',userAgent:'script:test:1 (by /u/test)'},async(u,opts)=>{
  if(String(u).endsWith('/access_token')){auth++;assert.equal(new URLSearchParams(opts.body).get('grant_type'),'refresh_token');return response({access_token:'access',expires_in:3600,scope:'read'});}
  gets++;assert.ok(String(u).startsWith('https://oauth.reddit.com/'));assert.equal(opts.headers.Authorization,'Bearer access');return response({ok:true},200,{'x-ratelimit-remaining':'0','x-ratelimit-reset':'2'});
 },{now:()=>now,sleep:async ms=>{waits.push(ms);now+=ms;}});
 await c.get('/comments/abc.json?raw_json=1');await c.get('/api/morechildren?children=a');assert.equal(auth,1);assert.equal(gets,2);assert.deepEqual(waits,[2000]);assert.equal(c.lastStatus,200);
});
test('comment trees expand replies, deduplicate native IDs, keep original bodies and discard author/deleted content',async()=>{
 let calls=0;const reader={lastStatus:200,lastContentType:'application/json',async get(path){calls++;return path.startsWith('/comments/')?[listing([post(3)]),listing([comment('a','LaoJie Hotpot is good.','t3_abc',listing([comment('b','New Noodle House is good.','t1_a')])),{kind:'more',data:{children:['c','c'],count:1}}])]:{json:{errors:[],data:{things:[comment('c','[deleted]'),comment('b','New Noodle House is good.','t1_a')]}}};}};
 const snap=await fetchRedditThread(url,reader);assert.equal(calls,2);assert.equal(snap.comments.length,3);assert.equal(snap.tree_complete,true);assert.equal(snap.comments.find(c=>c.id==='c').body,null);assert.ok(!JSON.stringify(snap).includes('not-retained-user'));assert.ok(snap.comments.every(c=>c.permalink.endsWith('/'+c.id+'/')));
});
test('morechildren uses batches of at most 100 and wrong thread identities are rejected',async()=>{
 const ids=Array.from({length:151},(_,i)=>'c'+i),sizes=[];const snap=await fetchRedditThread(url,{lastStatus:200,async get(path){if(path.startsWith('/comments/'))return [listing([post(151)]),listing([{kind:'more',data:{children:ids,count:151}}])];const batch=new URL('https://oauth.reddit.com'+path).searchParams.get('children').split(',');sizes.push(batch.length);return {json:{errors:[],data:{things:batch.map(id=>comment(id,'Original'))}}};}});assert.deepEqual(sizes,[100,51]);assert.equal(snap.comments.length,151);assert.equal(snap.tree_complete,true);
 await assert.rejects(()=>fetchRedditThread(url,{async get(){const p=post(0);p.data.id='wrong';return [listing([p]),listing([])];}}),/different thread/);
});
test('API rate failures and unresolved child IDs remain partial without fabricating comments',async()=>{
 const snap=await fetchRedditThread(url,{async get(path){if(path.startsWith('/comments/'))return [listing([post(2)]),listing([comment('a','Original'),{kind:'more',data:{children:['b'],count:1}}])];throw new RedditError('rate_limited','Reddit rate limit reached.',429);}});assert.equal(snap.tree_complete,false);assert.equal(snap.comments.length,1);assert.deepEqual(snap.unavailable_ids,['b']);assert.equal(snap.api_calls,2);
});
test('request limits and missing replies do not masquerade as full thread coverage',async()=>{
 let calls=0;const reader={async get(){calls++;return [listing([post(1)]),listing([{kind:'more',data:{children:['a'],count:1}}])];}};const snap=await fetchRedditThread(url,reader,1);assert.equal(calls,1);assert.equal(snap.tree_complete,false);assert.deepEqual(snap.unavailable_ids,['a']);
 await assert.rejects(()=>fetchRedditThread(url,reader,0),/request cap/);assert.equal(calls,1);
});
async function snapshot(){return fetchRedditThread(url,{lastStatus:200,lastContentType:'application/json',async get(){return [listing([post(3)]),listing([comment('a','LaoJie Hotpot is good.'),comment('b','New Noodle House is good.'),comment('c','[removed]')])];}});}
test('literal catalog mentions keep own comment URLs and unknown names do not become a claim of full coverage',async()=>{
 const s=await snapshot();const auto=redditMentions(s,source,['LaoJie Hotpot']);assert.equal(auto.article.restaurants.length,1);assert.equal(auto.article.restaurants[0].comment_url,'https://www.reddit.com/r/FoodNYC/comments/abc/thread/a/');assert.equal(auto.evidence.count_verified,false);assert.equal(auto.evidence.reddit.tree_complete,true);assert.equal(auto.template.comments.length,2);
 const review={url,content_sha256:mentionContentHash(s),comments:auto.template.comments.map(c=>({id:c.id,reviewed:true,mentions:c.id==='b'?[{start:0,end:'New Noodle House'.length}]:c.mentions}))};
 const checked=redditMentions(s,source,['LaoJie Hotpot'],review);assert.equal(checked.evidence.count_verified,true);const repeated=structuredClone(s);repeated.fetched_at=new Date(Date.parse(s.fetched_at)+1000).toISOString();repeated.api_calls++;assert.equal(redditMentions(repeated,source,['LaoJie Hotpot'],review).evidence.count_verified,true);assert.deepEqual(checked.article.restaurants.map(r=>r.name),['LaoJie Hotpot','New Noodle House']);assert.ok(checked.article.restaurants.every(r=>typeof r.closed==='boolean'));
 const stale=redditMentions(s,source,['LaoJie Hotpot'],{...review,content_sha256:'old'});assert.equal(stale.evidence.count_verified,false);
 const bad=structuredClone(review);bad.comments[0].mentions=[{start:0,end:9999}];assert.throws(()=>redditMentions(s,source,[],bad),/span/);
});
test('catalog is data-driven, uses longest non-overlapping original spans and preserves separate quotes',async()=>{
 const names=mediaMentionCatalog([{restaurants:[{name:'New Noodle House'}]}],[{name:'LaoJie',aliases:['LaoJie Hotpot']}]);assert.ok(names.includes('New Noodle House'));assert.deepEqual(suggestedMentions('LaoJie Hotpot and LaoJie Hotpot.',names),[{start:0,end:13}]);
 const s=await snapshot();s.comments[1].body='LaoJie Hotpot again.';const p=redditMentions(s,source,names);assert.equal(p.article.restaurants.length,2);assert.notEqual(p.article.restaurants[0].comment_url,p.article.restaurants[1].comment_url);
});
test('deleted snapshot content is never restored and expired offline snapshots are removed',async()=>{
 const root=await mkdtemp(join(tmpdir(),'geo-reddit-cache-'));try{
  const s=await snapshot();await saveRedditSnapshot(root,source.id,s);assert.equal((await readRedditSnapshot(root,source.id,url)).comments.length,3);
  await assert.rejects(()=>readRedditSnapshot(root,source.id,url,Date.parse(s.fetched_at)+25*3600000),/expired/);await assert.rejects(()=>readFile(join(root,source.id+'.reddit.json')),e=>e.code==='ENOENT');
  await saveRedditSnapshot(root,source.id,s);const file=join(root,source.id+'.reddit.json'),v=JSON.parse(await readFile(file,'utf8'));v.snapshot.title='tampered';await writeFile(file,JSON.stringify(v));await assert.rejects(()=>readRedditSnapshot(root,source.id,url),/hash/);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('Reddit integration preserves requested order, never makes anonymous requests when config is missing',async()=>{
 const root=await mkdtemp(join(tmpdir(),'geo-reddit-integration-'));try{
  let network=0;const missing=await collectConfiguredMedia({urls:[url]},{cache:root,redditClient:null,transport:async()=>{network++;throw Error('No anonymous request');}});assert.equal(network,0);assert.equal(missing.access[0].outcome,'credentials_missing');assert.equal(missing.acceptance.reddit_api_verified,false);
  const result=await collectConfiguredMedia({urls:[url]},{cache:root,redditClient:{lastStatus:200,lastContentType:'application/json',async get(){return [listing([post(1)]),listing([comment('a','LaoJie Hotpot is good.')])];}},targets:[{id:'x',name:'LaoJie Hotpot',address:'1 Main St',aliases:[]}]});assert.equal(result.articles[0].restaurants.length,1);assert.equal(result.evidence[0].source_kind,'reddit_oauth');assert.equal(result.acceptance.phase3_complete,false);assert.equal(result.acceptance.paid_calls,null);
 }finally{await rm(root,{recursive:true,force:true});}
});
const reviewSource=configuredMediaSources({urls:['https://www.theinfatuation.com/new-york/reviews/hometown']})[0];
function venueHTML(primaryStatus='Permanently Closed',relatedStatus='Open'){
 const state={'primary':{__typename:'PostReview',canonicalPath:'/new-york',slug:{__ref:'slug-primary'},venue:{name:'Hometown',closed:false,closedStatus:primaryStatus}},'slug-primary':{name:'hometown'},'related':{__typename:'PostReview',canonicalPath:'/new-york',slug:{name:'other'},venue:{name:'Other',closedStatus:relatedStatus}}};
 return '<h1>Hometown</h1><main><div class="flatplan_tags"><p>Original introduction.</p></div></main><script type="application/ld+json">'+JSON.stringify({'@type':'Review',itemReviewed:{'@type':'Restaurant',name:'Hometown'}})+'</script><script id="__NEXT_DATA__">'+JSON.stringify({props:{pageProps:{initialApolloState:state}}})+'</script>';
}
test('explicit canonical closure status wins over contradictory boolean and related venues never close the primary',()=>{
 const p=parseConfiguredMediaPage(venueHTML(),reviewSource,'2026-11-18T00:00:00Z');assert.equal(p.article.restaurants[0].closed,true);assert.equal(p.evidence.closure_markers[0].marker,'Permanently Closed');
 assert.equal(parseConfiguredMediaPage(venueHTML('Open','Permanently Closed'),reviewSource,'2026-11-18T00:00:00Z').article.restaurants[0].closed,false);
});
test('business opening status is not a permanent-closure marker and Reddit literal closure stays scoped',async()=>{
 const s=configuredMediaSources({urls:['https://www.allyoucaneatguide.com/new-york-city']})[0];const html='<h1>Directory</h1><main><div class="grid"><a><div class="card-name">Cafe</div><span class="open-status closed">Closed</span></a></div></main>';assert.equal(parseConfiguredMediaPage(html,s,'2026-11-18T00:00:00Z').article.restaurants[0].closed,false);
 const snap=await snapshot();snap.comments[0].body='LaoJie Hotpot is permanently closed.';snap.comments[1].body='LaoJie Hotpot is closed now.';const r=redditMentions(snap,source,['LaoJie Hotpot']);assert.equal(r.article.restaurants[0].closed,true);assert.equal(r.article.restaurants[1].closed,false);
});
test('a denied first API read records its real status/attempt and does not claim zero cost',async()=>{
 const root=await mkdtemp(join(tmpdir(),'geo-reddit-denied-'));try{let reads=0;const r=await collectConfiguredMedia({urls:[url]},{cache:root,redditClient:{get requestCount(){return reads;},async get(){reads++;throw new RedditError('api_denied','Reddit comments unavailable (HTTP 403).',403);}}});assert.equal(r.access[0].http_status,403);assert.equal(r.access[0].outcome,'api_denied');assert.equal(r.acceptance.reddit_api_calls,1);assert.equal(r.acceptance.paid_calls,null);}finally{await rm(root,{recursive:true,force:true});}
});
test('mixed input order is preserved while the full media catalog is built before Reddit extraction',async()=>{
 const root=await mkdtemp(join(tmpdir(),'geo-reddit-order-'));try{
  const page='https://www.theinfatuation.com/new-york/reviews/fixture-kitchen';const html='<h1>Fixture Kitchen</h1><main><div class="flatplan_tags"><p>Original introduction.</p></div></main><script type="application/ld+json">'+JSON.stringify({'@type':'Review',itemReviewed:{'@type':'Restaurant',name:'Fixture Kitchen'}})+'</script>';
  const r=await collectConfiguredMedia({urls:[url,page]},{cache:root,transport:async()=>new Response(html,{headers:{'content-type':'text/html'}}),redditClient:{lastStatus:200,lastContentType:'application/json',async get(){return [listing([post(1)]),listing([comment('a','Fixture Kitchen is good.')])];}}});assert.deepEqual(r.articles.map(a=>a.url),[url,page]);assert.equal(r.articles[0].restaurants[0].name,'Fixture Kitchen');
 }finally{await rm(root,{recursive:true,force:true});}
});
test('a newly deleted post removes the old official snapshot instead of restoring cached quotes',async()=>{
 const root=await mkdtemp(join(tmpdir(),'geo-reddit-delete-'));try{await saveRedditSnapshot(root,source.id,await snapshot());const r=await collectConfiguredMedia({urls:[url]},{cache:root,redditClient:{lastStatus:200,async get(){const p=post(3);p.data.selftext='[deleted]';return [listing([p]),listing([])];}}});assert.equal(r.access[0].outcome,'api_denied');assert.equal(r.articles[0].restaurants.length,0);await assert.rejects(()=>readFile(join(root,source.id+'.reddit.json')),e=>e.code==='ENOENT');}finally{await rm(root,{recursive:true,force:true});}
});
test('verified empty readable comment scope is zero mentions, not a fabricated collection failure',async()=>{
 const snap=await fetchRedditThread(url,{lastStatus:200,async get(){return [listing([post(1)]),listing([comment('a','[removed]')])];}});const r=redditMentions(snap,source,[]);assert.equal(r.article.restaurants.length,0);assert.equal(r.evidence.count_verified,true);assert.equal(r.evidence.comment_coverage.deleted,1);
});
test('missing non-deleted body remains an unavailable comment rather than verified zero mentions',async()=>{
 const snap=await fetchRedditThread(url,{lastStatus:200,async get(){const c=comment('a','x');delete c.data.body;return [listing([post(1)]),listing([c])];}});assert.equal(snap.tree_complete,false);assert.deepEqual(snap.unavailable_ids,['a']);assert.equal(redditMentions(snap,source,[]).evidence.count_verified,false);
});
test('offline replay reports zero new API calls and does not require credentials',async()=>{
 const root=await mkdtemp(join(tmpdir(),'geo-reddit-offline-'));try{await saveRedditSnapshot(root,source.id,await snapshot());const r=await collectConfiguredMedia({urls:[url]},{cache:root,offline:true,redditClient:null});assert.equal(r.acceptance.reddit_api_calls,0);assert.equal(r.acceptance.paid_calls,0);assert.equal(r.access[0].capture_api_calls,1);assert.equal(r.evidence[0].source_kind,'reddit_oauth');}finally{await rm(root,{recursive:true,force:true});}
});
test('invalid Reddit credential configuration does not prevent unrelated media HTML collection',async()=>{
 const root=await mkdtemp(join(tmpdir(),'geo-reddit-config-')),keys=['REDDIT_CLIENT_ID','REDDIT_CLIENT_SECRET','REDDIT_REFRESH_TOKEN','REDDIT_USER_AGENT'],previous=Object.fromEntries(keys.map(k=>[k,process.env[k]]));try{
  for(const k of keys)process.env[k]='fixture';process.env.REDDIT_USER_AGENT='invalid\nagent';let calls=0;
  const html='<h1>Fixture</h1><main><div class="flatplan_tags"><p>Original.</p></div></main><script type="application/ld+json">'+JSON.stringify({'@type':'Review',itemReviewed:{'@type':'Restaurant',name:'Fixture'}})+'</script>';
  const r=await collectConfiguredMedia({urls:['https://www.theinfatuation.com/new-york/reviews/fixture',url]},{cache:root,transport:async()=>{calls++;return new Response(html,{headers:{'content-type':'text/html'}});}});assert.equal(calls,1);assert.equal(r.articles[0].restaurants.length,1);assert.equal(r.access[1].outcome,'oauth_error');
 }finally{for(const k of keys)if(previous[k]===undefined)delete process.env[k];else process.env[k]=previous[k];await rm(root,{recursive:true,force:true});}
});
