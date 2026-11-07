import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {chromium} from 'playwright';

test('restaurant list mode supports text/file input, selected platforms and excludes single-target/menu fields',async()=>{
 const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||undefined});
 try{
  const page=await browser.newPage(),submissions=[];
  await page.route('http://geo.test/**',async route=>{
   const path=new URL(route.request().url()).pathname;
   if(path==='/api/session')return route.fulfill({json:{authenticated:true}});
   if(path==='/api/check'){submissions.push(route.request().postDataJSON());return route.fulfill({status:400,json:{message:'Fixture received.'}});}
   return route.fulfill({body:await readFile(path.startsWith('/js/')?'dist/public'+path:'dist/public/index.html'),contentType:path.endsWith('.js')?'text/javascript':'text/html'});
  });
  await page.goto('http://geo.test/');await page.locator('#input-kind').selectOption('batch');
  assert.equal(await page.locator('#single-target').isVisible(),false);assert.equal(await page.locator('#collect-menus').isDisabled(),true);
  for(const box of await page.locator('input[name=platforms]').all())await box.uncheck();await page.getByLabel('Yelp',{exact:true}).check();
  const list='First Cafe | 1 Main St\nSecond Cafe | 2 Main St';await page.locator('#stores-input').fill(list);
  await page.locator('#submit-button').click();await page.getByText('Fixture received.',{exact:true}).waitFor();
  assert.deepEqual(submissions[0],{stores:list,platforms:['yelp']});
  const json='[{"place_id":"fixture-place"}]';
  await page.locator('#stores-file').setInputFiles({name:'stores.json',mimeType:'application/json',buffer:Buffer.from(json)});
  await page.waitForFunction(value=>document.querySelector('#stores-input').value===value,json);
  await page.locator('#submit-button').click();await page.waitForFunction(()=>!document.querySelector('#submit-button').disabled);
  assert.equal(submissions.at(-1).stores,json);
 }finally{await browser.close();}
});

test('batch results preview each store and expose restaurant JSON downloads',async()=>{
 const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||undefined});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const stores=['First Cafe','Second Cafe'].map((name,index)=>({id:'store-'+index,input:{name},filename:name+'.json',output_file:'out/'+name+'.json',status:'partial',error:null,records:[{platform:'yelp',found:true,matched:true,name,rating:4.5},{platform:'instagram',found:false,matched:false,error:'No public listing for the target restaurant was found in the returned search results. This does not confirm whether the restaurant has registered an account on this platform.'}]}));
  await page.route('http://geo.test/**',async route=>{
   const path=new URL(route.request().url()).pathname;
   if(path==='/api/session')return route.fulfill({json:{authenticated:true}});
   if(path.startsWith('/api/audits/'))return route.fulfill({json:{status:'partial',input:{stores:stores.map(s=>s.input)},records:[],batch:{total:2,completed:2,current_store_id:null,stores,output_files:{'store-0':'out/First Cafe.json','store-1':'out/Second Cafe.json'}}}});
   return route.fulfill({body:await readFile(path.startsWith('/js/')?'dist/public'+path:'dist/public/results.html'),contentType:path.endsWith('.js')?'text/javascript':'text/html'});
  });
  await page.goto('http://geo.test/results?id=11111111-1111-4111-8111-111111111111');
  await page.getByRole('link',{name:'Download First Cafe.json'}).waitFor();
  assert.equal(await page.getByRole('link',{name:'Download Second Cafe.json'}).count(),1);assert.equal(await page.locator('#batch-store option').count(),2);
  assert.equal(await page.locator('#evidence-list a').first().getAttribute('href'),'/api/audits/11111111-1111-4111-8111-111111111111/stores/store-0.json');
  assert.ok((await page.locator('#comparison').textContent()).includes('First Cafe'));
  await page.locator('#batch-store').selectOption('store-1');await page.getByRole('cell',{name:'Second Cafe',exact:true}).waitFor();
  assert.deepEqual(errors,[]);assert.ok((await page.locator('#batch-summary').textContent()).includes('2 of 2'));assert.ok((await page.locator('#profiles').textContent()).includes('No matching public listing was found.'));assert.ok(!(await page.locator('#profiles').textContent()).includes('registered an account'));
 }finally{await browser.close();}
});
