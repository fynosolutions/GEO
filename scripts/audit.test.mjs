import test from 'node:test';
const nativeFetch = globalThis.fetch;
const fetch = (url, options = {}) => nativeFetch(url, { ...options, headers: { ...options.headers, Authorization: 'Bearer test-access-token' } });
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { emptyResult, verifyResult, mergeSamePlatform,selectBrowserCandidates,questionFallback,reviewThemesFallback } from '../dist/backend/audit.js';
import { acceptVisual } from '../dist/backend/vision.js';
import { readWithBrowser,matchesDomains,isListingCandidate,isPublicIP,classifyPage,englishUrl,sameDocumentUrl } from '../dist/backend/browser.js';

test('persistent browser reuses cookies and reevaluates natural challenge reload',async()=>{
 const {chromium}=await import('playwright');
 const original=chromium.launchPersistentContext.bind(chromium);
 const dir=await mkdtemp(join(tmpdir(),'geo-browser-session-'));
 const oldProfile=process.env.BROWSER_PROFILE_DIR,oldWait=process.env.BROWSER_SETTLE_TIMEOUT_MS;
 process.env.BROWSER_PROFILE_DIR=join(dir,'profiles');process.env.BROWSER_SETTLE_TIMEOUT_MS='8000';
 let launches=0;
 chromium.launchPersistentContext=async(profile,options)=>{
  const context=await original(profile,options);launches++;
  if(launches===2)assert.ok((await context.cookies()).some(c=>c.name==='session_fixture'&&c.value==='saved'));
  const newPage=context.newPage.bind(context);
  context.newPage=async()=>{
   const page=await newPage();
   await page.route('**/*',route=>{
    const ready=new URL(route.request().url()).searchParams.has('ready');
    return route.fulfill({status:ready?200:403,contentType:'text/html',body:ready?'<h1>Fixture Restaurant</h1><p>1 Test St, New York, NY. A fully loaded restaurant listing with its own visible text.</p>':`<p>Checking your browser</p><script>document.cookie='session_fixture=saved; Max-Age=3600; Secure; SameSite=Lax';setTimeout(()=>location.href='?ready=1',3000)</script>`});
   });return page;
  };return context;
 };
 try {
  for(let i=0;i<2;i++){
   const result=await readWithBrowser('https://www.yelp.com/biz/fixture',['yelp.com'],dir,`yelp-${i}`);
   assert.equal(result.initial_http_status,403);assert.equal(result.http_status,200);assert.equal(result.status,'readable');assert.equal(result.session_persistent,true);assert.match(result.text,/Fixture Restaurant/);
  }
 }finally{
  chromium.launchPersistentContext=original;
  if(oldProfile===undefined)delete process.env.BROWSER_PROFILE_DIR;else process.env.BROWSER_PROFILE_DIR=oldProfile;
  if(oldWait===undefined)delete process.env.BROWSER_SETTLE_TIMEOUT_MS;else process.env.BROWSER_SETTLE_TIMEOUT_MS=oldWait;
  await rm(dir,{recursive:true,force:true});
 }
});

test('independent question uses fresh search and keeps only supported same-platform fields',async()=>{
 const id=randomUUID(),directory=resolve(process.env.AUDIT_DATA_DIR||'.local/audits',id);await mkdir(directory,{recursive:true});
 const url='https://www.yelp.com/biz/fixture';const raw=emptyResult('yelp');raw.status='partial';raw.source_url=url;raw.values.name='Fixture';raw.values.rating='5.0';raw.values.phone='123';
 raw.evidence=[{field:'name',url,excerpt:'Fixture'},{field:'rating',url,excerpt:'4.5'},{field:'phone',url:'https://elsewhere.example',excerpt:'123'}];
 let calls=0;
 try {
  const base=emptyResult('yelp');base.status='blocked';base.status_note='Previous challenge text';
  const result=await questionFallback({id,merchant:{name:'Fixture',address:'1 Test St'}},'yelp',base,async payload=>{
   calls++;assert.ok(!JSON.stringify(payload).includes('Previous challenge text'));
   if(calls===1){assert.equal(payload.tool_choice,'required');return {status:'completed',output:[{type:'web_search_call',action:{sources:[{url}]}},{type:'message',content:[{type:'output_text',text:'Fixture, cited Yelp listing.'}]}]};}
   return {status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(raw)}]}]};
  });
  assert.equal(calls,2);assert.equal(result.values.name,'Fixture');assert.equal(result.values.rating,null);assert.equal(result.values.phone,null);assert.equal(result.evidence[0].scope,'search_excerpt');assert.equal(result.status,'partial');
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('review-theme fallback accepts only cited review evidence and preserves unrelated values',async()=>{
 const id=randomUUID(),directory=resolve(process.env.AUDIT_DATA_DIR||'.local/audits',id);await mkdir(directory,{recursive:true});
 const url='https://www.yelp.com/biz/fixture';const base=emptyResult('yelp');base.values.name='Original';base.status='partial';
 const raw=emptyResult('yelp');raw.source_url=url;raw.status='partial';raw.values.name='Invented';raw.values.review_themes='Individual feedback praises soup.';raw.evidence=[{field:'review_themes',url,excerpt:'The soup was tasty.'}];raw.review_metadata={source_type:'ai_summary',sample_size:1,sampling_method:'unknown',newest_sort_verified:false};
 try{let n=0;const result=await reviewThemesFallback({id,merchant:{name:'Fixture',address:'1 Test St'}},'yelp',base,async payload=>{n++;assert.ok(!/[\u4e00-\u9fff]/.test(payload.instructions));return{status:'completed',output:n===1?[{type:'web_search_call',action:{sources:[{url}]}},{type:'message',content:[{type:'output_text',text:'Review: The soup was tasty.'}]}]:[{type:'message',content:[{type:'output_text',text:JSON.stringify(raw)}]}]};});assert.equal(result.values.name,'Original');assert.equal(result.values.review_themes,'Individual feedback praises soup.');assert.equal(result.review_metadata.sample_size,1);}
 finally{await rm(directory,{recursive:true,force:true});}
});

test('browser navigation boundaries and challenge detection',()=>{
 assert.equal(matchesDomains('https://www.yelp.com/biz/test',['yelp.com']),true);
 for(const url of ['http://www.yelp.com/biz/test','https://yelp.com.evil.example','https://user:pass@yelp.com/biz/test','https://yelp.com:8080/biz/test']) assert.equal(matchesDomains(url,['yelp.com']),false);
 for(const ip of ['127.0.0.1','192.168.1.1','10.0.0.1','169.254.169.254','::1','::ffff:127.0.0.1']) assert.equal(isPublicIP(ip),false);
 assert.equal(classifyPage(403,'Forbidden'),true);assert.equal(classifyPage(200,'Verify you are human'),true);assert.equal(classifyPage(200,'Restaurant menu'),false);
 assert.equal(isListingCandidate('https://www.yelp.com/biz/easy-joy-new-york','yelp'),true);
 assert.equal(isListingCandidate('https://trust.yelp.com/wp-content/uploads/legal.pdf','yelp'),false);
 assert.equal(isListingCandidate('https://www.yelp.com/search?find_desc=Easy+Joy','yelp'),false);
 assert.equal(isListingCandidate('https://www.google.com/maps/place/Easy+Joy/','google_maps'),true);
 assert.equal(isListingCandidate('https://www.google.com/policies/privacy','google_maps'),false);
});
test('Maps retains working standard search fallback and English language requests',()=>{
 const result=selectBrowserCandidates('google_maps',['https://www.google.com/maps?q=Fixture','https://www.google.com/maps/place/Fixture/'],{name:'Fixture',address:'1 Test St',status:'confirmed',note:null});
 assert.match(result[0],/\/maps\/place\//);assert.ok(result.some(u=>u.includes('/maps/search/?api=1&query=')));
 const fallback=selectBrowserCandidates('google_maps',['https://www.google.com/maps?q=Fixture'],{name:'Fixture',address:'1 Test St',status:'confirmed',note:null});assert.match(fallback[0],/\/maps\/search\//);
 assert.equal(new URL(englishUrl('https://www.google.com/maps/place/Fixture/?hl=zh-CN')).searchParams.get('hl'),'en');
 assert.equal(new URL(englishUrl('https://www.yelp.com/biz/fixture')).searchParams.get('hl'),'en_US');
 assert.equal(sameDocumentUrl('https://www.yelp.com/biz/fixture','https://www.yelp.com/biz/fixture?hl=en_US'),true);
 assert.equal(sameDocumentUrl('https://www.google.com/maps?cid=1','https://www.google.com/maps?cid=2&hl=en'),false);
});

test('stop cancels server work and persists stopped sources',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'geo-stop-test-'));
 const child=spawn(process.execPath,['--import','./scripts/mock-openai.mjs','dist/backend/server.js'],{env:{...process.env,OPENAI_API_KEY:'test-only',GEO_API_TOKEN:'test-access-token',APIFY_ENABLED:'false',MOCK_SLOW:'true',AUDIT_DATA_DIR:dir,BROWSER_PROFILE_DIR:join(dir,'profiles'),BROWSER_SETTLE_TIMEOUT_MS:'0',PORT:'0',HOST:'127.0.0.1'},stdio:['ignore','pipe','pipe']});
 try {
  const base=await new Promise((resolve,reject)=>{child.stdout.on('data',chunk=>{const m=chunk.toString().match(/http:\/\/127\.0\.0\.1:(\d+)/);if(m)resolve(`http://127.0.0.1:${m[1]}`)});child.once('error',reject)});
  const accepted=await (await fetch(`${base}/api/check`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:'https://fixture.example'})})).json();
  await new Promise(r=>setTimeout(r,200));
  assert.equal((await fetch(`${base}/api/audits/${accepted.id}/cancel`,{method:'POST'})).status,202);
  let job;
  for(let i=0;i<300;i++){job=await(await fetch(`${base}/api/audits/${accepted.id}`)).json();if(job.status==='cancelled')break;await new Promise(r=>setTimeout(r,20));}
  assert.equal(job.status,'cancelled');assert.ok(Object.values(job.platforms).every(p=>!['queued','running','browser_running'].includes(p.status)));
 }finally{child.kill();await once(child,'exit');await rm(dir,{recursive:true,force:true});}
});

test('rejects cross-platform evidence and unsupported normalized facts', () => {
 const raw=emptyResult('yelp'); raw.status='success';raw.source_url='https://www.yelp.com/biz/fixture';raw.values.review_count='1200';
 raw.evidence=[{field:'review_count',excerpt:'1.2K reviews',url:raw.source_url}];
 const checked=verifyResult('yelp',raw,new Set([raw.source_url])); assert.equal(checked.values.review_count,null);
 raw.values.name='Wrong site';raw.evidence=[{field:'name',excerpt:'Wrong site',url:'https://www.grubhub.com/fixture'}];
 assert.equal(verifyResult('yelp',raw,new Set([raw.source_url,'https://www.grubhub.com/fixture'])).values.name,null);
 raw.status='blocked';raw.source_url=null;assert.equal(verifyResult('yelp',raw,new Set()).status,'blocked');
 raw.source_url='https://www.yelp.com/biz/fixture';raw.values.name='Fixture Restaurant';raw.evidence=[{field:'name',excerpt:'Fixture Restaurant',url:raw.source_url,scope:'search_excerpt'}];
 const partial=verifyResult('yelp',raw,new Set([raw.source_url]));assert.equal(partial.status,'partial');assert.equal(partial.values.name,'Fixture Restaurant');
});
test('visual acceptance rejects walls and unverified branches; merging preserves raw facts',()=>{
 const raw=emptyResult('yelp');raw.values.name='Fixture';
 const snapshot={status:'readable',url:'https://www.yelp.com/biz/fixture',screenshots:['yelp-0.browser.png']};
 const evidence={field:'name',image:'yelp-0.browser.png',excerpt:'Fixture',x:0,y:0,width:100,height:100};
 assert.equal(acceptVisual({page_state:'challenge',branch_verified:true,result:raw,visual_evidence:[evidence]},{page_state:'listing',branch_verified:true,verified_fields:['name']},snapshot),null);
 assert.equal(acceptVisual({page_state:'listing',branch_verified:false,result:raw,visual_evidence:[evidence]},{page_state:'listing',branch_verified:true,verified_fields:['name']},snapshot),null);
 const accepted=acceptVisual({page_state:'listing',branch_verified:true,result:raw,visual_evidence:[evidence]},{page_state:'listing',branch_verified:true,verified_fields:['name']},snapshot);
 assert.equal(accepted.evidence[0].scope,'screenshot');assert.equal(accepted.evidence[0].needs_review,true);
 const base=emptyResult('yelp');base.values.name='Original';const merged=mergeSamePlatform(base,accepted);
 assert.equal(merged.values.name,'Original');assert.equal(merged.conflicts[0].alternative,'Fixture');
});
for(const browserFixture of [false,true,'vision']) test(`submission, JSON persistence and browser fallback=${browserFixture} (mock API)`, async () => {
 const dir=await mkdtemp(join(tmpdir(),'geo-audit-test-'));
 const child=spawn(process.execPath,['--import','./scripts/mock-openai.mjs','dist/backend/server.js'],{env:{...process.env,OPENAI_API_KEY:'test-only',GEO_API_TOKEN:'test-access-token',APIFY_ENABLED:'false',BROWSER_FIXTURE:String(Boolean(browserFixture)),VISION_FIXTURE:String(browserFixture==='vision'),VISION_FALLBACK:String(browserFixture==='vision'),BROWSER_FALLBACK:'true',AUDIT_DATA_DIR:dir,BROWSER_PROFILE_DIR:join(dir,'profiles'),BROWSER_SETTLE_TIMEOUT_MS:'0',PORT:'0',HOST:'127.0.0.1'},stdio:['ignore','pipe','pipe']});
 try {
  const address=await new Promise((resolve,reject)=>{child.stdout.on('data',chunk=>{const match=chunk.toString().match(/http:\/\/127\.0\.0\.1:(\d+)/);if(match)resolve(`http://127.0.0.1:${match[1]}`)});child.once('error',reject);child.once('exit',()=>reject(new Error('Server exited')));});
  let response=await fetch(`${address}/api/check`,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://other.example'},body:JSON.stringify({url:'https://fixture.example'})});assert.equal(response.status,403);
  response=await fetch(`${address}/api/check`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:'http://127.0.0.1'})});assert.equal(response.status,400);
  response=await fetch(`${address}/api/check`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:'https://fixture.example'})});assert.equal(response.status,202);
  const accepted=await response.json(); assert.match(accepted.result_url,/^\/results\?id=/);
  let job;
  for(let i=0;i<1500;i++){job=await (await fetch(`${address}/api/audits/${accepted.id}`)).json();if(job.status!=='running')break;await new Promise(r=>setTimeout(r,30));}
  assert.equal(job.status,'partial',JSON.stringify(job));assert.deepEqual(Object.keys(job.platforms),['official','google_maps','yelp','tripadvisor','opentable','uber_eats','doordash','toast','grubhub']);
  assert.ok(job.platforms.official);assert.equal(job.platforms.official.collection_method,'web_search');assert.match(job.platforms.official.status_note,/browser collection was not attempted/);assert.equal(job.platforms.toast.platform,'Toast');assert.equal(job.platforms.resy,undefined);
  for(const key of Object.keys(job.platforms)) {const saved=JSON.parse(await readFile(join(dir,job.id,`${key}.json`),'utf8'));
   if((browserFixture && key==='yelp') || (browserFixture==='vision' && key==='google_maps')) {
    assert.equal(saved.collection_method,browserFixture==='vision'?'vision':'browser');assert.equal(saved.values.name,'Fixture Restaurant');assert.equal(saved.values.review_count,'1.2K reviews');
    if(browserFixture==='vision')assert.equal(saved.evidence[0].scope,'screenshot');
    assert.equal((await fetch(`${address}/api/audits/${job.id}/screenshots/${key}-0.browser.png`)).status,200);
    assert.ok(saved.browser_attempts.length>0);
   } else if(key!=='official') {assert.equal(saved.status,key==='google_maps'?'partial':'blocked');assert.ok(Object.values(saved.values).every(v=>v===null));}
   assert.equal((await fetch(`${address}/api/audits/${job.id}/${key}.json`)).status,200);}
  const resultPage=await fetch(`${address}${accepted.result_url}`);assert.equal(resultPage.status,200);
  assert.match(await resultPage.text(),/id="audit-loader"/);
  const resultScript=await (await fetch(`${address}/js/results.js`)).text();
  assert.match(resultScript,/textContent/);assert.match(resultScript,/stop-audit/);
 } finally {child.kill();await once(child,'exit');await rm(dir,{recursive:true,force:true});}
});

