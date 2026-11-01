import test from 'node:test';import assert from 'node:assert/strict';import{readFile,mkdir}from'node:fs/promises';import{chromium}from'playwright';
test('main-field view hides empty/secondary rows, counts raw fields and toggles all fields',async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));const id='11111111-1111-4111-8111-111111111111';
 await page.route('http://geo.test/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/health')return route.fulfill({json:{fields:{name:'Name',address:'Address',average_spend:'Average spend',rating_max:'Rating max'}}});
  if(path.startsWith('/api/audits/'))return route.fulfill({json:{id,website_url:'https://example.com',status:'partial',merchant:{name:'Easy Joy',address:'145 Mulberry St'},platforms:{yelp:{platform:'Yelp',status:'blocked',values:{name:'Easy Joy',address:null,average_spend:null,rating_max:'5'},evidence:[],review_metadata:{},apify:{status:'unverified',actor:'fixture',note:'Fixture data',items:[{name:'Easy Joy',address:'145 Mulberry St, New York, NY 10013',phone:null,aggregatedRating:4.5,reviews:[{text:'Original text'}],extra:'<script>bad()</script>',flag:false}]}},toast:{platform:'Toast',status:'error',values:{},evidence:[],review_metadata:{},apify:{status:'skipped',actor:null,note:'No Actor configured',items:[]}}}}});
  const file=path.startsWith('/js/')||path.startsWith('/css/')?'dist/public'+path:'dist/public/results.html';
  return route.fulfill({body:await readFile(file),contentType:path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html'});
 });
 await page.goto(`http://geo.test/results?id=${id}`);await page.waitForFunction(()=>document.querySelector('#comparison tbody tr'));
 const headings=await page.locator('#comparison tbody th').allTextContents();assert.equal(headings.length,20);
 for(const field of ['name','official_website','price_range','review_themes']){assert.ok(headings.some(h=>h.startsWith(field)));assert.ok(headings.some(h=>h.startsWith('apify_'+field)));}
 const exactRow=(key)=>page.locator('#comparison tbody tr').filter({has:page.locator('th').filter({hasText:new RegExp('^'+key+'[0-9]')})});
 assert.equal(await exactRow('address').locator('td').textContent(),'—');
 assert.ok((await exactRow('apify_address').locator('td').textContent()).includes('145 Mulberry St, New York, NY 10013'));
 assert.equal(await page.locator('#comparison thead').getByText('Toast',{exact:true}).count(),0);
 assert.ok((await page.locator('#evidence-list').textContent()).includes('Toast'));
 await page.getByRole('button',{name:'Show unavailable platforms'}).click();await page.waitForFunction(()=>document.querySelector('#comparison thead')?.textContent.includes('Toast'));
 assert.equal(await page.locator('#comparison tbody tr').first().locator('td').last().textContent(),'—');
 assert.ok(!(await page.locator('#comparison').textContent()).includes('Average spend'));assert.equal(await page.locator('script:not([src])').count(),0);
 assert.deepEqual(errors,[]);await mkdir('.local',{recursive:true});await page.screenshot({path:'.local/main-fields-ui.png',fullPage:true});
 }finally{await browser.close();}
});
