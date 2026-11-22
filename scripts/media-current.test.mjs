import {spawnSync} from 'node:child_process';import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {configuredMediaSources,mediaPageType} from '../dist/backend/media/sources.js';import {fetchMediaPage,saveMediaCapture,readMediaCapture} from '../dist/backend/media/live.js';import {parseConfiguredMediaPage} from '../dist/backend/media/layouts.js';import {collectConfiguredMedia,mediaAccessOutcome,writeConfiguredMedia} from '../dist/backend/media/current.js';
const date='2026-11-18T00:00:00Z',url='https://www.theinfatuation.com/new-york/reviews/fixture-kitchen';
const source=configuredMediaSources({urls:[url]})[0];
const reviewHTML='<h1>Fixture Kitchen</h1><main><div class="flatplan_tags"><p>Original paragraph with 中文 &amp; text.</p><p>Second paragraph.</p></div></main><aside>Unrelated restaurant</aside><script type="application/ld+json">'+JSON.stringify({'@type':'Review',datePublished:'2026-10-20',itemReviewed:{'@type':'Restaurant',name:'Fixture Kitchen',address:{streetAddress:'123 Main St',addressLocality:'New York'}},reviewBody:'Wrong excerpt fallback'})+'</script>';
const response=(html=reviewHTML,status=200)=>new Response(html,{status,headers:{'content-type':'text/html'}});
test('media configuration preserves input order and stable URL IDs across changed lists',()=>{
 const second='https://www.theinfatuation.com/los-angeles/reviews/another';
 const a=configuredMediaSources({urls:[url,second]}),b=configuredMediaSources({urls:[second,url]});
 assert.equal(a[0].id,b[1].id);assert.deepEqual(b.map(s=>s.url),[second,url]);assert.equal(a[1].page_type,'review');
 assert.throws(()=>configuredMediaSources({urls:[url,url]}),/Duplicate/);
 for(const invalid of ['http://example.com','https://127.0.0.1/','https://user:pass@example.com/','https://localhost/','https://example.com/#secret'])assert.throws(()=>configuredMediaSources({urls:[invalid]}));
 assert.throws(()=>configuredMediaSources({urls:[],other:true}));
 assert.equal(mediaPageType('https://www.corner.inc/place/unknown'),'place');
 assert.equal(mediaPageType('https://guide.michelin.com/en/city/restaurant/new'),'review');
});
test('single review uses the primary restaurant and full scoped body rather than related cards',()=>{
 const {article,evidence}=parseConfiguredMediaPage(reviewHTML,source,date);
 assert.deepEqual(article.restaurants,[{name:'Fixture Kitchen',rank:1,address:'123 Main St, New York',blurb:'Original paragraph with 中文 & text.\n\nSecond paragraph.',closed:false}]);assert.equal(evidence.count_verified,true);assert.equal(article.published,'2026-10-20');
 const conflict=reviewHTML+'<meta property="article:published_time" content="2025-01-01">';assert.equal(parseConfiguredMediaPage(conflict,source,date).article.published,null);
});
test('directory cards exclude filters and open status; absent descriptions stay null',()=>{
 const s=configuredMediaSources({urls:['https://www.allyoucaneatguide.com/new-york-city']})[0];
 const html='<h1>Directory</h1><main><a>Filter</a><div class="grid"><a><div class="card-name">Fixture Kitchen</div><div class="card-meta"><div class="meta-item">📍 123 Main St</div></div><div class="card-tags">BBQ</div><span>Closed</span></a></div></main><footer><div class="card-name">Not a restaurant entry</div></footer>';
 const p=parseConfiguredMediaPage(html,s,date);assert.equal(p.article.restaurants.length,1);assert.equal(p.article.restaurants[0].blurb,null);assert.equal(p.article.restaurants[0].address,'123 Main St');assert.equal(p.evidence.descriptions[0].reason,'not_provided');
});
test('generic structured lists require visible names, reject hidden unrelated structured entries',()=>{
 const s=configuredMediaSources({urls:['https://www.corner.inc/list/fixture']})[0];
 const schema={'@type':'ItemList',itemListElement:[{item:{name:'Kitchen A',description:'Original A'}},{item:{name:'Kitchen B',description:'Original B'}}]};
 const html='<h1>List</h1><main>Kitchen A</main><script type="application/ld+json">'+JSON.stringify(schema)+'</script>';
 const p=parseConfiguredMediaPage(html,s,date);assert.equal(p.article.restaurants.length,1);assert.equal(p.evidence.count_verified,false);
});
const guideSource=configuredMediaSources({urls:['https://www.theinfatuation.com/new-york/guides/fixture']})[0];
function guideFixture(wrongOrder=false,wrongGuide=false){
 const state={ROOT_QUERY:{['postGuideCollection('+JSON.stringify({where:{canonicalPath:'/new-york',slug:{name:wrongGuide?'different':'fixture'}}})+')']:{items:[{['contentV2BodyCollection({"limit":800})']:{items:[{review:{__ref:'review-a'}},{review:{__ref:'review-b'}}]}}]}},'review-a':{title:'Different editorial title',canonicalPath:'/new-york',slug:{__ref:'slug-a'}},'review-b':{title:'B',canonicalPath:'/new-york',slug:{name:'b'}},'slug-a':{name:wrongOrder?'b':'a'}};
 const cards=['A','B'].map(n=>`<div id="${n}"><a href="/new-york/reviews/${n.toLowerCase()}"><h2 data-testid="venue-title">${n}</h2></a><div data-testid="venue-description"><p>Original ${n}</p></div></div>`).join('');
 return '<h1>Guide</h1>'+cards+'<script type="application/ld+json">'+JSON.stringify({'@type':'ItemList',itemListElement:[{item:{name:'A'}}]})+'</script><script id="__NEXT_DATA__" type="application/json">'+JSON.stringify({props:{pageProps:{initialApolloState:state}}})+'</script>';
}
test('full canonical guide body verifies entries beyond abbreviated JSON-LD only when links/order match',()=>{
 const p=parseConfiguredMediaPage(guideFixture(),guideSource,date);assert.equal(p.article.restaurants.length,2);assert.equal(p.evidence.count_verified,true);assert.equal(p.evidence.expected_count,2);
 assert.equal(parseConfiguredMediaPage(guideFixture(true),guideSource,date).evidence.count_verified,false);
 assert.equal(parseConfiguredMediaPage(guideFixture(false,true),guideSource,date).evidence.count_verified,false);
});
test('HTTP access retains status, redirect destination and body hash without following private redirects',async()=>{
 let calls=0;const r=await fetchMediaPage(source,async()=>{calls++;return calls===1?new Response(null,{status:302,headers:{location:'/new-york/reviews/moved'}}):response();});
 assert.equal(r.meta.status,200);assert.equal(r.meta.final_url,'https://www.theinfatuation.com/new-york/reviews/moved');assert.equal(r.meta.sha256.length,64);
 let internal=0;const bad=await fetchMediaPage(source,async()=>{internal++;return new Response(null,{status:302,headers:{location:'https://127.0.0.1/private'}});});assert.equal(internal,1);assert.ok(bad.meta.error);
 assert.equal(mediaAccessOutcome('<script>awswaf challenge</script>',{...r.meta,status:202}),'blocked');assert.equal(mediaAccessOutcome('',{...r.meta,status:429}),'blocked');
});
test('collector validates before requests, isolates failures, defers Reddit and never replaces failed fresh access with old facts',async()=>{
 const root=await mkdtemp(join(tmpdir(),'geo-media-current-'));let calls=0;
 try{
  await assert.rejects(()=>collectConfiguredMedia({urls:[url,'http://bad.test']},{cache:root,redditClient:null,transport:async()=>{calls++;return response();}}));assert.equal(calls,0);
  const config={urls:[url,'https://www.corner.inc/place/blocked','https://www.reddit.com/r/example/comments/abc/thread']};
  const r=await collectConfiguredMedia(config,{cache:root,redditClient:null,transport:async u=>{calls++;return String(u).includes('corner.inc')?response('Access denied',403):response();}});
  assert.equal(calls,2);assert.deepEqual(r.access.map(a=>a.outcome),['parsed','blocked','credentials_missing']);assert.equal(r.articles.length,3);assert.equal(r.articles[1].restaurants.length,0);assert.equal(r.acceptance.ready_for_delivery,false);
  await writeConfiguredMedia(join(root,'out'),r,{urls_file:'fixture.json',sha256:'a'.repeat(64)});assert.equal(JSON.parse(await readFile(join(root,'out/articles.json'),'utf8')).length,3);
  const valid=spawnSync(process.execPath,['scripts/verify-media-current.mjs',join(root,'out')],{encoding:'utf8'});assert.equal(valid.status,0,valid.stderr);
  const invalid=JSON.parse(await readFile(join(root,'out/articles.json'),'utf8'));invalid[1].restaurants=invalid[0].restaurants;await writeFile(join(root,'out/articles.json'),JSON.stringify(invalid));
  assert.notEqual(spawnSync(process.execPath,['scripts/verify-media-current.mjs',join(root,'out')],{encoding:'utf8'}).status,0);
  let network=0;const offline=await collectConfiguredMedia(config,{cache:root,offline:true,redditClient:null,transport:async()=>{network++;throw Error('no network');}});assert.equal(network,0);assert.deepEqual(offline.articles,r.articles);
  const failed=await collectConfiguredMedia({urls:[url]},{cache:root,redditClient:null,transport:async()=>response('blocked',403)});assert.equal(failed.articles[0].restaurants.length,0);assert.equal(failed.access[0].http_status,403);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('offline replay rejects modified cached content and missing captures without network',async()=>{
 const root=await mkdtemp(join(tmpdir(),'geo-media-integrity-'));
 try{
  const captured=await fetchMediaPage(source,async()=>response());await saveMediaCapture(root,source,captured);await writeFile(join(root,source.id+'.html'),'tampered');await assert.rejects(()=>readMediaCapture(root,source),/hash/);
  const r=await collectConfiguredMedia({urls:[url]},{cache:root,offline:true});assert.equal(r.access[0].outcome,'cache_error');assert.equal(r.articles[0].restaurants.length,0);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('Welcome cards separate source addresses from descriptions and exclude unrelated footer headings',()=>{
 const s=configuredMediaSources({urls:['https://welcometochinatown.com/guides/another']})[0];const card=(name,body)=>`<div><div class="image-title-wrapper"><div class="image-title"><h4>${name}</h4></div></div><div class="image-subtitle"><p><strong>123 Main St</strong></p>${body}</div></div>`;
 const r=parseConfiguredMediaPage('<h1>Guide</h1><article>'+card('A','<p>Original A.</p>')+card('B','')+'</article><footer><h4>Donate</h4></footer>',s,date);
 assert.equal(r.article.restaurants.length,2);assert.equal(r.article.restaurants[0].blurb,'Original A.');assert.equal(r.article.restaurants[1].blurb,null);assert.equal(r.evidence.descriptions[1].reason,'not_provided');
});
test('Eater story preserves the primary restaurant and body, not a later quoted person',()=>{
 const s=configuredMediaSources({urls:['https://ny.eater.com/2026/1/1/123/story']})[0];const html='<h1>Restaurant story</h1><main><div class="duet--article--article-body-component"><p class="duet--article--standard-paragraph">The chain <strong>Fixture Hot Pot</strong> opened.</p><p class="duet--article--standard-paragraph"><strong>Person Name</strong> said so.</p></div></main>';
 const r=parseConfiguredMediaPage(html,s,date);assert.deepEqual(r.article.restaurants.map(r=>r.name),['Fixture Hot Pot']);assert.match(r.article.restaurants[0].blurb,/Person Name/);
});
test('Time Out verifies the visible numbered list against named source metadata when headline has no count',()=>{
 const s=configuredMediaSources({urls:['https://www.timeout.com/los-angeles/restaurants/best-new-fixture']})[0];
 const html='<h1>Best restaurants</h1><script type="application/ld+json">'+JSON.stringify({'@type':'Article',headline:'Best restaurants',name:'2 Best Restaurants'})+'</script>'+['A','B'].map((n,i)=>`<article data-testid="tile-zone-large-list_testID"><h3 data-testid="tile-title_testID">${i+1}. ${n}</h3><div data-testid="summary_testID"><p>Original ${n}.</p></div></article>`).join('');
 assert.equal(parseConfiguredMediaPage(html,s,date).evidence.count_verified,true);
});
test('malformed readable HTML is a parser gap rather than a network failure',async()=>{
 const root=await mkdtemp(join(tmpdir(),'geo-media-parser-'));
 try{const r=await collectConfiguredMedia({urls:['https://www.corner.inc/list/fixture']},{cache:root,redditClient:null,transport:async()=>response('<h1>List</h1><main>Visible</main><script type="application/ld+json">{"@type":"ItemList","itemListElement":[null]}</script>')});assert.equal(r.access[0].outcome,'parser_gap');assert.equal(r.access[0].http_status,200);assert.equal(r.articles[0].restaurants.length,0);}finally{await rm(root,{recursive:true,force:true});}
});
test('Time Out reads visible editorial annotations even when JSON-LD reviewBody is empty',()=>{
 const s=configuredMediaSources({urls:['https://www.timeout.com/newyork/restaurants/new-fixture']})[0];const html='<h1>Kitchen</h1><main><div data-testid="annotation_testID"><p>Full original introduction.</p></div><div data-testid="inline-newsletter_testID"><p>Subscribe now.</p></div></main><script type="application/ld+json">'+JSON.stringify({'@type':'Review',reviewBody:'',itemReviewed:{'@type':'Restaurant',name:'Kitchen'}})+'</script>';
 const r=parseConfiguredMediaPage(html,s,date);assert.equal(r.article.restaurants[0].blurb,'Full original introduction.');assert.equal(r.evidence.descriptions[0].reason,'exported');
});
test('a single-page H1 or successful homepage redirect is not restaurant identity evidence',()=>{
 const p=parseConfiguredMediaPage('<h1>Page not found</h1><main>Try our homepage.</main>',source,date);assert.equal(p.article.restaurants.length,0);
 assert.equal(mediaAccessOutcome('<h1>Home</h1>',{url,final_url:'https://www.theinfatuation.com/',fetched_at:date,status:200,error:null,content_type:'text/html',bytes:20,sha256:'x'}),'unsupported_content');
});
