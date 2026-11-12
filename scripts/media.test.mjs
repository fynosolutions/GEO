import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMediaArticle,mediaSources} from '../dist/backend/media/public.js';
const source=mediaSources[0];
const fixture=(names=['Test Kitchen'])=>`<html><head><title>Real title</title><meta property="article:published_time" content="2025-01-02"><meta property="article:modified_time" content="2025-02-01"><script type="application/ld+json">${JSON.stringify({'@type':'Article',datePublished:'2025-01-02',dateModified:'2025-03-01'})}</script><script type="application/ld+json">${JSON.stringify({'@type':'ItemList',itemListElement:names.map(name=>({item:{name}}))})}</script></head><body><h1>Original heading</h1><svg><title>Save spot</title></svg>${names.map((name,i)=>`<div id="spot-${i}"><h2 data-testid="venue-title">${name}</h2><a href="https://www.google.com/maps/search/?api=1"><style>.x{color:red}</style>${i+1} Main St</a><p>A fictional restaurant paragraph for this test.</p></div>`).join('')}<aside><h2>Related reading</h2></aside></body></html>`;
test('metadata excludes SVG/CSS and related headings, retaining original list order',()=>{
 const {article,evidence}=parseMediaArticle(fixture(['Second Name','First Name']),source,'2026-11-10T00:00:00Z');
 assert.equal(article.title,'Original heading');assert.deepEqual(article.restaurants.map(r=>[r.name,r.rank,r.address]),[['Second Name',1,'1 Main St'],['First Name',2,'2 Main St']]);
 assert.equal(evidence.count_verified,true);assert.equal(article.published,'2025-01-02');assert.equal(article.updated,null);assert.match(evidence.issues.join(' '),/Conflicting updated/);assert.equal(evidence.dates.length,4);assert.equal(evidence.status,'partial');
});
test('a missing card fails independent count verification',()=>{
 const result=parseMediaArticle(fixture(['A','B']).replace('data-testid="venue-title">B','data-testid="other">B'),source,'2026-11-10T00:00:00Z');
 assert.equal(result.evidence.count_verified,false);assert.equal(result.evidence.expected_count,2);assert.equal(result.article.restaurants.length,1);
});
test('an empty or access-challenge response never establishes absence',()=>{
 const {article,evidence}=parseMediaArticle('<h1>Access denied</h1>',source,'2026-11-10T00:00:00Z');
 assert.equal(evidence.status,'failed');assert.equal(evidence.count_verified,false);assert.equal(article.published,null);assert.equal(article.updated,null);assert.deepEqual(article.restaurants,[]);
});
test('Eater parses only map cards, retaining branch address and original order',()=>{
 const html='<h1>List</h1><script type="application/ld+json">{"@type":"ItemList","itemListElement":[{"item":{"name":"Same Brand"}}]}</script><div class="duet--article--map-card"><h2>Same Brand</h2><a href="https://www.google.com/maps/search/"><div><span>732 61st St, Brooklyn</span></div></a><aside><h2>More dining</h2></aside></div><h2>The Latest</h2>';
 const {article,evidence}=parseMediaArticle(html,mediaSources[1],'2026-11-10T00:00:00Z');
 assert.equal(evidence.count_verified,true);assert.deepEqual(article.restaurants,[{name:'Same Brand',rank:1,address:'732 61st St, Brooklyn',blurb:null}]);
});
test('a directory without its pagination metadata cannot be marked complete',()=>{
 const {article,evidence}=parseMediaArticle(fixture(),mediaSources[2],'2026-11-10T00:00:00Z');
 assert.equal(evidence.status,'failed');assert.equal(evidence.count_verified,false);assert.deepEqual(article.restaurants,[]);
});

test('structured HTML entities compare to visible names without changing exported names',()=>{
 const html=fixture(['Alpha & Beta']).replace('"name":"Alpha & Beta"','"name":"Alpha &amp; Beta"');
 const {article,evidence}=parseMediaArticle(html,source,'2026-11-10T00:00:00Z');
 assert.equal(evidence.count_verified,true);assert.equal(article.restaurants[0].name,'Alpha & Beta');
});

import {readFileSync,mkdtempSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {parseIndexedMedia,mediaMembershipReport} from '../dist/backend/media/public.js';
const directoryFixture=(hasNextPage=false)=>`<h1>Directory</h1><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({props:{pageProps:{initialQueryState:{queries:[{state:{data:{pages:[{items:[{__typename:'PostGuide',documentIdentifier:'guide'},{__typename:'PostReview',documentIdentifier:'a',documentTitleText:'Test Kitchen',placeStreetName:'9 Main St'}],totalCount:2,hasNextPage}]}}}]}}}})}</script><div data-testid="detailedStory-storyElement" id="guide"><a href="/new-york/guides/example"><h3>A guide, not a restaurant</h3></a></div><div data-testid="detailedStory-storyElement" id="a"><a href="/new-york/reviews/test-kitchen"><h3>Test Kitchen</h3></a></div>`;
test('directory excludes guide cards and validates final pagination and embedded branch address',()=>{
 const {article,evidence}=parseMediaArticle(directoryFixture(),mediaSources[2],'2026-11-10T00:00:00Z');
 assert.equal(evidence.count_verified,true);assert.deepEqual(article.restaurants,[{name:'Test Kitchen',rank:1,address:'9 Main St',blurb:null}]);assert.equal(article.published,null);
 assert.equal(parseMediaArticle(directoryFixture(true),mediaSources[2],'2026-11-10T00:00:00Z').evidence.count_verified,false);
});
test('Time Out requires headline count and consecutive visible numbering',()=>{
 const html='<h1>Dim sum</h1><script type="application/ld+json">{"@type":"Article","headline":"The 2 best dim sum spots"}</script>'+[1,2].map(n=>`<article data-testid="tile-zone-large-list_testID"><h3 data-testid="tile-title_testID">${n}. Kitchen ${n}</h3></article>`).join('')+'<aside><h3>Related kitchen</h3></aside>';
 const result=parseMediaArticle(html,mediaSources[7],'2026-11-10T00:00:00Z');assert.equal(result.evidence.count_verified,true);assert.equal(result.article.restaurants.length,2);assert.equal(result.article.restaurants[0].address,null);
 assert.equal(parseMediaArticle(html.replace('2. Kitchen','3. Kitchen'),mediaSources[7],'2026-11-10T00:00:00Z').evidence.count_verified,false);
});
const indexed=(source,lines)=>`Example (${source.url})\nCrawled: 5 days ago\n`+lines.map((l,i)=>`L${i}: ${l}`).join('\n');
test('Michelin indexed parser counts visible cards and excludes related guides',()=>{
 const raw=indexed(mediaSources[8],['# Dim Sum','【12†Image】 2 Restaurants','Updated on 19 May 2025','##### 【15†Kitchen A】','','1 Main St','##### 【17†Kitchen B】','','2 Main St','## Find our other best-of guides','##### Related Kitchen']);
 const {article,evidence}=parseIndexedMedia(raw,mediaSources[8],'2026-11-10T00:00:00Z');assert.equal(evidence.count_verified,true);assert.equal(evidence.source_kind,'web_index');assert.equal(article.updated,'2025-05-19');assert.deepEqual(article.restaurants.map(r=>r.name),['Kitchen A','Kitchen B']);
 assert.throws(()=>parseIndexedMedia(raw,mediaSources[6],'2026-11-10T00:00:00Z'),/URL does not match/);
});
test('Reddit mentions preserve first spelling, deduplicate and exclude related posts without claiming completeness',()=>{
 const raw=indexed(mediaSources[6],['# Thread','Best','Easy Joy on Mulberry.','Another vote for Easy Joy.','K-pot is mentioned too.','# More posts you may like','Dolar Shop']);
 const {article,evidence}=parseIndexedMedia(raw,mediaSources[6],'2026-11-10T00:00:00Z');assert.deepEqual(article.restaurants.map(r=>r.name),['Easy Joy','K-pot']);assert.ok(article.restaurants.every(r=>r.address===null));assert.equal(evidence.count_verified,false);assert.match(evidence.issues.join(' '),/collapsed/);
});
test('membership counts distinct verified pages and keeps other branches and community mentions separate',()=>{
 const targets=JSON.parse(readFileSync('backend/media/targets.json','utf8'));
 const make=(name,address)=>({url:'https://example.com/list',site:'Example',title:'List',published:null,updated:null,restaurants:[{name,rank:1,address,blurb:null}]});
 const valid={source_id:'test',fetched_at:'2026-11-10T00:00:00Z',status:'partial',count_verified:true,source_kind:'direct_html',expected_count:1,extracted_count:1,dates:[],issues:[]};
 const wrong=make('99 Favor Taste','732 61st St, Brooklyn'),right=make('99 Favor Taste','285 Grand St, New York');right.url+='-2';right.restaurants.push({...right.restaurants[0],rank:2});
 const community=make('Easy Joy',null);community.url+='-3';
 const report=mediaMembershipReport([wrong,right,community],[valid,valid,{...valid,count_verified:false,source_kind:'web_index'}],targets);
 assert.match(report,/\| 99 Favor Taste \| 285 Grand St, New York, NY 10002 \| 1 \|/);assert.match(report,/\| Easy Joy \| 145 Mulberry St, New York, NY 10013 \| 0 \|/);assert.match(report,/732 61st St, Brooklyn \| 地址不同/);
});
test('CLI offline replay produces fixed schema, source errors and six-row table without network',()=>{
 const dir=mkdtempSync(join(tmpdir(),'geo-media-')),cache=join(dir,'cache'),out=join(dir,'out');
 try{const result=spawnSync(process.execPath,['dist/backend/media/cli.js','--cache',cache,'--out',out],{encoding:'utf8'});assert.equal(result.status,2,result.stderr);
  const articles=JSON.parse(readFileSync(join(out,'articles.json'))),evidence=JSON.parse(readFileSync(join(out,'evidence.json')));assert.equal(articles.length,9);assert.equal(evidence.apify_cost_usd,0);assert.ok(evidence.sources.every(s=>s.status==='failed'&&s.fetched_at===null));assert.ok(articles.every(a=>Object.keys(a).join(',')==='url,site,title,published,updated,restaurants'));assert.match(readFileSync(join(out,'上榜表.md'),'utf8'),/KPOT/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

import {applySuppliedTexts} from '../dist/backend/media/public.js';
test('Reddit blurb retains the first visible original paragraph rather than a summary',()=>{
 const original='I like Easy Joy on Mulberry. Drinks and desserts are included.';
 const raw=indexed(mediaSources[6],['# Thread','Best',original,'Another vote for Easy Joy.','# More posts you may like']);
 const result=parseIndexedMedia(raw,mediaSources[6],'2026-11-11T00:00:00Z');
 assert.equal(result.article.restaurants[0].blurb,original);assert.equal(result.evidence.count_verified,false);
});
test('supplied original paragraphs retain whitespace, provenance and captured facts without mutating inputs',()=>{
 const captured=parseMediaArticle(fixture(),source,'2026-11-11T00:00:00Z');const before=structuredClone(captured);
 const paragraph='  A fictional source paragraph.\n\nSecond paragraph with café & tea.  ';
 const result=applySuppliedTexts([captured.article],[captured.evidence],[{url:source.url,restaurants:[{name:'Test Kitchen',rank:1,blurb:paragraph}]}]);
 assert.equal(result.articles[0].restaurants[0].blurb,paragraph);assert.equal(result.articles[0].restaurants[0].address,'1 Main St');assert.equal(result.evidence[0].count_verified,true);assert.match(result.evidence[0].supplied_texts[0].sha256,/^[a-f0-9]{64}$/);assert.deepEqual(captured,before);assert.match(result.evidence[0].issues.join(' '),/not independently verified/);
});
test('supplied text rejects wrong sources, wrong names, duplicates and conflicting paragraphs as a whole',()=>{
 const captured=parseMediaArticle(fixture(),source,'2026-11-11T00:00:00Z'),articles=[captured.article],evidence=[captured.evidence];
 const entry={rank:1,name:'Test Kitchen',blurb:'Fictional supplied source text.'};
 for(const input of [[{url:'https://example.com/wrong',restaurants:[entry]}],[{url:source.url,restaurants:[{...entry,name:'Other branch'}]}],[{url:source.url,restaurants:[entry,entry]}],[{url:source.url,restaurants:[{...entry,blurb:' '}]}]])assert.throws(()=>applySuppliedTexts(articles,evidence,input));
 assert.equal(articles[0].restaurants[0].blurb,null);
 const merged=applySuppliedTexts(articles,evidence,[{url:source.url,restaurants:[entry]}]);assert.throws(()=>applySuppliedTexts(merged.articles,merged.evidence,[{url:source.url,restaurants:[{...entry,blurb:'Different text'}]}]),/conflicts/);
});

test('CLI imports supplied text and rejects invalid input without replacing previous output',()=>{
 const root=mkdtempSync(join(tmpdir(),'geo-media-text-')),cache=join(root,'cache'),out=join(root,'out'),input=join(root,'texts.json');mkdirSync(cache);
 try{
  writeFileSync(join(cache,'infatuation-hot-pot.html'),fixture());writeFileSync(join(cache,'infatuation-hot-pot.json'),JSON.stringify({url:source.url,status:200,fetched_at:'2026-11-11T00:00:00Z'}));
  writeFileSync(input,JSON.stringify([{url:source.url,restaurants:[{rank:1,name:'Test Kitchen',blurb:'Fictional paragraph.\nOriginal second line.'}]}]));
  const args=['dist/backend/media/cli.js','--source','infatuation-hot-pot','--cache',cache,'--out',out,'--supplied-texts',input];
  const valid=spawnSync(process.execPath,args,{encoding:'utf8'});assert.equal(valid.status,0,valid.stderr);const previous=readFileSync(join(out,'articles.json'),'utf8');assert.equal(JSON.parse(previous)[0].restaurants[0].blurb,'Fictional paragraph.\nOriginal second line.');
  writeFileSync(input,'null');const invalid=spawnSync(process.execPath,args,{encoding:'utf8'});assert.equal(invalid.status,1);assert.match(invalid.stderr,/non-empty article array/);assert.equal(readFileSync(join(out,'articles.json'),'utf8'),previous);
 }finally{rmSync(root,{recursive:true,force:true});}
});

import {evaluateMediaAcceptance,missingDescriptions} from '../dist/backend/media/public.js';
test('acceptance computes completion from content and distinguishes selected scope from delivery',()=>{
 const {article,evidence}=parseMediaArticle(fixture(),source,'2026-11-11T00:00:00Z');
 const partial=evaluateMediaAcceptance([article],[evidence],mediaSources);
 assert.equal(partial.acceptance.complete,false);assert.equal(partial.acceptance.descriptions_missing,1);
 assert.equal(missingDescriptions([article])[0].restaurants[0].name,'Test Kitchen');
 article.restaurants[0].blurb='Fictional original description.';
 const complete=evaluateMediaAcceptance([article],[evidence],mediaSources);
 assert.equal(complete.acceptance.complete,true);assert.equal(complete.acceptance.ready_for_delivery,false);assert.equal(complete.evidence[0].status,'complete');
 assert.equal(evaluateMediaAcceptance([article],[evidence],[source]).acceptance.ready_for_delivery,true);
 assert.equal(evaluateMediaAcceptance([article],[{...evidence,source_kind:'web_index'}],[source]).acceptance.complete,false);
 assert.equal(evaluateMediaAcceptance([article],[{...evidence,extracted_count:2}],[source]).acceptance.complete,false);
 assert.equal(evidence.status,'partial');
});
const michelinFixture='<h1>Best Dim Sum</h1><div class="detail-page-single-header">Our four restaurants</div><div class="city-guide__description--info-total-restaurants">3 Restaurants</div><div class="detail-page-single-header">Updated on 19 May 2025</div>'+['Kitchen A','Kitchen B','Kitchen C'].map((name,i)=>`<div><h5 class="card__menu-content--title"><a href="/en/restaurant/${i}">${name}</a></h5><div class="card__menu-content--address">${i+1} Main St</div></div>`).join('')+'<aside><h3>Related guide</h3></aside>';
test('Michelin live DOM verifies displayed cards while recording editorial prose conflict',()=>{
 const {article,evidence}=parseMediaArticle(michelinFixture,mediaSources[8],'2026-11-11T00:00:00Z');
 assert.equal(evidence.count_verified,true);assert.equal(article.restaurants.length,3);assert.equal(article.updated,'2025-05-19');assert.deepEqual(evidence.count_conflict,{introductory:4,displayed:3});
 assert.deepEqual(article.restaurants.map(r=>r.address),['1 Main St','2 Main St','3 Main St']);
 assert.equal(parseMediaArticle(michelinFixture.replace('3 Restaurants','4 Restaurants'),mediaSources[8],'2026-11-11T00:00:00Z').evidence.count_verified,false);
});
test('CLI rendered-page cache takes priority over stale index without claiming an HTTP status',()=>{
 const root=mkdtempSync(join(tmpdir(),'geo-media-dom-')),cache=join(root,'cache'),out=join(root,'out');mkdirSync(cache);
 try{
  const source=mediaSources[8];writeFileSync(join(cache,source.id+'.html'),michelinFixture);writeFileSync(join(cache,source.id+'.json'),JSON.stringify({url:source.url,fetched_at:'2026-11-11T00:00:00Z',status:null,retrieval:'browser_dom',rendered:true}));
  writeFileSync(join(cache,source.id+'.web.txt'),'Malformed old index must not be selected');
  const result=spawnSync(process.execPath,['dist/backend/media/cli.js','--cache',cache,'--out',out,'--source',source.id],{encoding:'utf8'});assert.equal(result.status,2,result.stderr);
  const evidence=JSON.parse(readFileSync(join(out,'evidence.json'),'utf8')).sources[0];assert.equal(evidence.source_kind,'browser_dom');assert.equal(evidence.count_verified,true);
  const acceptance=JSON.parse(readFileSync(join(out,'acceptance.json'),'utf8'));assert.equal(acceptance.descriptions_missing,3);assert.equal(acceptance.missing_sources.length,8);
  assert.ok(JSON.parse(readFileSync(join(out,'cache-manifest.json'),'utf8')).every(e=>/^[a-f0-9]{64}$/.test(e.sha256)));
 }finally{rmSync(root,{recursive:true,force:true});}
});

import {parseSavedMediaPage} from '../dist/backend/media/public.js';
const savedHeader=(s)=>`<!-- saved from url=(0000)${s.url} -->`;
const redditSavedFixture=(count=3)=>savedHeader(mediaSources[6])+`<h1>Original community thread</h1><shreddit-post permalink="${new URL(mediaSources[6].url).pathname}" comment-count="${count}" created-timestamp="2026-09-21T18:52:14Z"></shreddit-post><div id="comment-tree-content-anchor-1wmlr4l"><shreddit-comment postid="t3_1wmlr4l" thingid="t1_a" depth="0"><details><div slot="comment"><p>Easy Joy on Mulberry.</p></div><shreddit-comment postid="t3_1wmlr4l" thingid="t1_b" depth="1"><div slot="comment"><p>Lao Jie is good.</p><p>Another original paragraph.</p></div></shreddit-comment></details></shreddit-comment><shreddit-comment postid="t3_1wmlr4l" thingid="t1_c" depth="0"><details>[已删除]</details></shreddit-comment></div><aside><p>Dolar Shop advertisement</p></aside>`;
test('saved Reddit matches comment IDs/count including deleted replies and excludes nested-body duplication',()=>{
 const result=parseSavedMediaPage(redditSavedFixture(),mediaSources[6],'2026-11-11T00:00:00Z',true);
 assert.equal(result.evidence.count_verified,true);assert.deepEqual(result.evidence.comment_coverage,{declared:3,saved:3,readable:2,deleted:1,unavailable:0,unique_ids:true,reviewed:true});
 assert.deepEqual(result.article.restaurants.map(r=>r.name),['Easy Joy','Lao Jie']);assert.equal(result.article.restaurants[0].blurb,'Easy Joy on Mulberry.');assert.equal(result.article.restaurants[1].blurb,'Lao Jie is good.\n\nAnother original paragraph.');assert.equal(result.article.published,'2026-09-21T18:52:14.000Z');
 assert.equal(parseSavedMediaPage(redditSavedFixture().replace('postid="t3_1wmlr4l" thingid="t1_c"','is-comment-deleted thingid="t1_c"'),mediaSources[6],'2026-11-11T00:00:00Z',true).evidence.count_verified,true);
 assert.equal(result.evidence.source_kind,'user_saved_html');assert.match(result.evidence.user_file_sha256,/^[a-f0-9]{64}$/);
});
test('saved Reddit never verifies incomplete, duplicate, unexplained or unreviewed comments',()=>{
 for(const html of [redditSavedFixture(4),redditSavedFixture().replace('thingid="t1_b"','thingid="t1_a"'),redditSavedFixture().replace('[已删除]','Missing content')])assert.equal(parseSavedMediaPage(html,mediaSources[6],'2026-11-11T00:00:00Z',true).evidence.count_verified,false);
 assert.equal(parseSavedMediaPage(redditSavedFixture(),mediaSources[6],'2026-11-11T00:00:00Z').evidence.count_verified,false);
 assert.throws(()=>parseSavedMediaPage(redditSavedFixture().replace(mediaSources[6].url,'https://example.com/wrong'),mediaSources[6],'2026-11-11T00:00:00Z',true),/source URL/);
});
test('user-saved editorial paragraphs retain inline text and paragraph order without exporting page chrome',()=>{
 const html=savedHeader(source)+fixture().replace('<p>A fictional restaurant paragraph for this test.</p>','<div city="new-york"><p>A fictional <a href="/review">original paragraph</a>.</p><p>Second paragraph.</p></div>');
 const result=parseSavedMediaPage(html,source,'2026-11-11T00:00:00Z');
 assert.equal(result.article.restaurants[0].blurb,'A fictional original paragraph.\n\nSecond paragraph.');assert.equal(result.evidence.count_verified,true);assert.equal(result.evidence.source_kind,'user_saved_html');assert.equal(result.article.restaurants[0].address,'1 Main St');
});
test('CLI imports saved-page manifest and requires reviewed hash before accepting community completeness',()=>{
 const root=mkdtempSync(join(tmpdir(),'geo-media-pages-')),pages=join(root,'pages'),out=join(root,'out');mkdirSync(pages);
 try{
  const html=redditSavedFixture();writeFileSync(join(pages,'reddit.html'),html);writeFileSync(join(pages,'manifest.json'),JSON.stringify([{source_id:mediaSources[6].id,file:'reddit.html',reviewed:true,reviewed_sha256:'wrong'}]));
  const args=['dist/backend/media/cli.js','--source',mediaSources[6].id,'--supplied-pages',pages,'--cache',join(root,'cache'),'--out',out];
  const bad=spawnSync(process.execPath,args,{encoding:'utf8'});assert.equal(bad.status,2);assert.match(readFileSync(join(out,'evidence.json'),'utf8'),/hash does not match/);
  const hash=createHash('sha256').update(html).digest('hex');writeFileSync(join(pages,'manifest.json'),JSON.stringify([{source_id:mediaSources[6].id,file:'reddit.html',reviewed:true,reviewed_sha256:hash}]));
  const good=spawnSync(process.execPath,args,{encoding:'utf8'});assert.equal(good.status,0,good.stderr);const a=JSON.parse(readFileSync(join(out,'acceptance.json'),'utf8'));assert.equal(a.complete,true);assert.equal(a.ready_for_delivery,false);
  writeFileSync(join(pages,'manifest.json'),JSON.stringify([{source_id:mediaSources[6].id,file:'../escape.html'}]));assert.equal(spawnSync(process.execPath,args,{encoding:'utf8'}).status,1);
 }finally{rmSync(root,{recursive:true,force:true});}
});

import {createHash} from 'node:crypto';

import {descriptionAvailability} from '../dist/backend/media/public.js';
test('description export preserves paragraphs and excludes navigation, hidden text and neighbouring cards',()=>{
 const html=fixture().replace('<p>A fictional restaurant paragraph for this test.</p>','<div city="new-york"><p>Fictional noodles &amp; tea.</p><p>Second original paragraph.<span hidden>Hidden UI</span></p><button>Read review</button><aside><p>Ad copy.</p></aside></div>');
 const result=parseMediaArticle(html,source,'2026-11-12T00:00:00Z');
 assert.equal(result.article.restaurants[0].blurb,'Fictional noodles & tea.\n\nSecond original paragraph.');
 assert.equal(result.evidence.descriptions[0].reason,'exported');assert.equal(result.evidence.descriptions[0].present,true);
 const limited=parseMediaArticle(html,source,'2026-11-12T00:00:00Z',{includeDescriptions:false});assert.equal(limited.article.restaurants[0].blurb,null);assert.equal(limited.evidence.descriptions[0].reason,'not_selected');assert.equal(limited.evidence.descriptions[0].present,true);
 const availability=descriptionAvailability([limited.article],[limited.evidence]);assert.equal(availability.counts.not_selected,1);assert.equal(availability.confirmed_absent,0);assert.equal(availability.present,1);
});
test('empty recognized description and unknown layout remain different states',()=>{
 const empty=parseMediaArticle(fixture().replace('<p>A fictional restaurant paragraph for this test.</p>','<div city="new-york"><p> </p></div>'),source,'2026-11-12T00:00:00Z');
 assert.equal(empty.evidence.descriptions[0].present,false);assert.equal(empty.evidence.descriptions[0].reason,'not_provided');
 const unknown=parseMediaArticle(fixture(),source,'2026-11-12T00:00:00Z');assert.equal(unknown.evidence.descriptions[0].present,null);assert.equal(unknown.evidence.descriptions[0].reason,'parse_failed');
});
test('Eater, Time Out, Michelin and cuisine-directory descriptions use source-specific containers',()=>{
 const cases=[
  [mediaSources[1],'<h1>Fictional list</h1><script type="application/ld+json">{"@type":"ItemList","itemListElement":[{"item":{"name":"Fictional Cafe"}}]}</script><div class="duet--article--map-card"><h2>Fictional Cafe</h2><p class="duet--article--standard-paragraph">Fictional Eater paragraph.</p><aside><p>Not an introduction.</p></aside></div>','Fictional Eater paragraph.'],
  [mediaSources[7],'<h1>The 1 fictional cafe</h1><script type="application/ld+json">{"@type":"Article","headline":"The 1 fictional cafe"}</script><article data-testid="tile-zone-large-list_testID"><h3 data-testid="tile-title_testID">1. Fictional Cafe</h3><div data-testid="summary_testID"><p>Fictional Time Out paragraph.</p></div><p>Unrelated UI.</p></article>','Fictional Time Out paragraph.'],
  [mediaSources[8],michelinFixture.replace('Kitchen A</a></h5>','Kitchen A</a></h5><div class="card__menu-content--desc">Fictional Michelin paragraph.</div>'),'Fictional Michelin paragraph.'],
  [mediaSources[2],directoryFixture().replace('<h3>Test Kitchen</h3>','<h3>Test Kitchen</h3><p class="css-501r93">Fictional directory excerpt.</p><p class="flatplan_authorName">Author.</p>'),'Fictional directory excerpt.']
 ];
 for(const [source,html,expected] of cases){
  const result=parseMediaArticle(html,source,'2026-11-12T00:00:00Z');assert.equal(result.article.restaurants[0].blurb,expected,source.id);assert.equal(result.evidence.count_verified,true,source.id);
  const saved=parseSavedMediaPage(savedHeader(source)+html,source,'2026-11-12T00:00:00Z');assert.equal(saved.article.restaurants[0].blurb,expected,source.id);assert.equal(saved.evidence.source_kind,'user_saved_html');
 }
});
test('CLI full mode exports fixture descriptions by default; supplied-only reports present but not selected',()=>{
 const root=mkdtempSync(join(tmpdir(),'geo-media-policy-')),cache=join(root,'cache'),out=join(root,'out');mkdirSync(cache);
 try{
  const html=fixture().replace('<p>A fictional restaurant paragraph for this test.</p>','<div city="new-york"><p>Fictional original cafe description.</p></div>');writeFileSync(join(cache,source.id+'.html'),html);writeFileSync(join(cache,source.id+'.json'),JSON.stringify({url:source.url,status:200,fetched_at:'2026-11-12T00:00:00Z'}));
  const args=['dist/backend/media/cli.js','--source',source.id,'--cache',cache,'--out',out];
  assert.equal(spawnSync(process.execPath,args,{encoding:'utf8'}).status,0);assert.equal(JSON.parse(readFileSync(join(out,'articles.json'),'utf8'))[0].restaurants[0].blurb,'Fictional original cafe description.');
  assert.equal(spawnSync(process.execPath,[...args,'--descriptions','supplied-only'],{encoding:'utf8'}).status,2);const report=JSON.parse(readFileSync(join(out,'description-availability.json'),'utf8'));assert.equal(report.present,1);assert.equal(report.counts.not_selected,1);assert.equal(report.confirmed_absent,0);
  assert.equal(spawnSync(process.execPath,[...args,'--descriptions','unknown'],{encoding:'utf8'}).status,1);
 }finally{rmSync(root,{recursive:true,force:true});}
});
