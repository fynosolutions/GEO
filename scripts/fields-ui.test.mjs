import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {chromium} from 'playwright';
test('new fields, failed platforms and JSON downloads render',async()=>{
 const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chromium',headless:true});
 try{const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://geo.test/**',async route=>{const path=new URL(route.request().url()).pathname;
 if(path==='/api/session')return route.fulfill({json:{authenticated:true}});
 if(path.startsWith('/api/audits/'))return route.fulfill({json:{status:'partial',input:{name:'Fixture'},output_file:'out/Fixture.json',filename:'Fixture.json',records:[{platform:'facebook',found:false,matched:false,name:null,rating_raw:'Not yet rated',error:'No Actor configured',hours:{monday:['09:00-17:00']}}]}});
 return route.fulfill({body:await readFile(path.startsWith('/js/')?'dist/public'+path:'dist/public/results.html'),contentType:path.endsWith('.js')?'text/javascript':'text/html'});});
 await page.goto('http://geo.test/results?id=11111111-1111-4111-8111-111111111111');await page.getByRole('cell',{name:'No Actor configured',exact:true}).waitFor();
 assert.equal(await page.locator('#comparison tr').count(),14);assert.equal(await page.getByRole('rowheader',{name:'rating_raw',exact:true}).count(),1);assert.equal(await page.getByRole('cell',{name:'Not yet rated',exact:true}).count(),1);assert.equal(await page.getByRole('link',{name:'Download Fixture.json'}).count(),1);assert.deepEqual(errors,[]);
 assert.equal(await page.locator('.provider-fields').count(),1);assert.ok((await page.locator('#comparison').textContent()).includes('monday'));assert.ok((await page.locator('#comparison').textContent()).includes('09:00-17:00'));assert.ok(!(await page.locator('#comparison').textContent()).includes('{'));assert.ok(!(await page.locator('#comparison').textContent()).includes('['));
 assert.equal(await page.locator('#comparison tbody tr').first().locator('small').textContent(),'No Actor configured');
 assert.ok((await page.locator('#comparison').textContent()).includes('matched: false'));
 }finally{await browser.close();}
});

test('profile results use their own fields and Stop cancels the current audit',async()=>{
 const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chromium',headless:true});
 try{
  const page=await browser.newPage();let stopped=false,cancelCalls=0;const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('http://geo.test/**',async route=>{
   const path=new URL(route.request().url()).pathname;
   if(path==='/api/session')return route.fulfill({json:{authenticated:true}});
   if(path.endsWith('/cancel')){cancelCalls++;stopped=true;return route.fulfill({status:202,json:{status:'cancelling'}});}
   if(path.startsWith('/api/audits/'))return route.fulfill({json:{status:stopped?'cancelled':'running',input:{name:'Fixture'},records:[{platform:'yelp',rating:4.5,review_count:20},{platform:'resy',followers:null,posts:null},{platform:'instagram',followers:1234,posts:30}]}});
   return route.fulfill({body:await readFile(path.startsWith('/js/')?'dist/public'+path:'dist/public/results.html'),contentType:path.endsWith('.js')?'text/javascript':'text/html'});
  });
  await page.goto('http://geo.test/results?id=11111111-1111-4111-8111-111111111111');
  await page.getByRole('button',{name:'Stop collection'}).waitFor();
  assert.equal(await page.locator('#profiles').getByText('Followers',{exact:true}).count(),1);
  assert.equal(await page.locator('#profiles').getByText('Rating',{exact:true}).count(),0);
  assert.equal(await page.locator('#comparison').getByText('Followers',{exact:true}).count(),0);
  await page.getByRole('button',{name:'Stop collection'}).click();
  await page.getByText('Collection stopped.',{exact:true}).waitFor();
  assert.equal(cancelCalls,1);assert.equal(await page.locator('#stop-audit').isVisible(),false);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('platform picker offers ten platforms in two separate categories',async()=>{
 const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chromium',headless:true});
 try{
  const page=await browser.newPage();
  await page.route('http://geo.test/**',async route=>{
   const path=new URL(route.request().url()).pathname;
   return route.fulfill({body:await readFile(path.startsWith('/js/')?'dist/public'+path:'dist/public/index.html'),contentType:path.endsWith('.js')?'text/javascript':'text/html'});
  });
  await page.goto('http://geo.test/');
  assert.equal(await page.locator('input[name="platforms"]:checked').count(),10);
  assert.equal(await page.getByRole('group',{name:'Profiles · followers and posts'}).locator('input[name="platforms"]').count(),2);
  assert.equal(await page.getByRole('group',{name:'Listings · ratings and reviews'}).locator('input[name="platforms"]').count(),8);
 }finally{await browser.close();}
});
