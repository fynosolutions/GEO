import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {chromium} from 'playwright';
test('new fields, failed platforms and JSON downloads render',async()=>{
 const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chromium',headless:true});
 try{const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://geo.test/**',async route=>{const path=new URL(route.request().url()).pathname;
 if(path==='/api/session')return route.fulfill({json:{authenticated:true}});
 if(path.startsWith('/api/audits/'))return route.fulfill({json:{status:'partial',input:{name:'Fixture'},output_file:'out/Fixture.json',filename:'Fixture.json',records:[{platform:'facebook',found:false,name:null,error:'No Actor configured',hours:{monday:['09:00-17:00']}}]}});
 return route.fulfill({body:await readFile(path.startsWith('/js/')?'dist/public'+path:'dist/public/results.html'),contentType:path.endsWith('.js')?'text/javascript':'text/html'});});
 await page.goto('http://geo.test/results?id=11111111-1111-4111-8111-111111111111');await page.getByText('No Actor configured',{exact:true}).waitFor();
 assert.equal(await page.locator('#comparison tr').count(),13);assert.equal(await page.getByRole('link',{name:'Download Fixture.json'}).count(),1);assert.deepEqual(errors,[]);
 assert.equal(await page.locator('.provider-fields').count(),1);assert.ok((await page.locator('#comparison').textContent()).includes('monday'));assert.ok((await page.locator('#comparison').textContent()).includes('09:00-17:00'));assert.ok(!(await page.locator('#comparison').textContent()).includes('{'));assert.ok(!(await page.locator('#comparison').textContent()).includes('['));
 }finally{await browser.close();}
});
