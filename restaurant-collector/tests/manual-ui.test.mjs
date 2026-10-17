import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const modulePath=process.env.GEO_PLAYWRIGHT_MODULE;
test('manual popup preserves a capture across reload, exports it, and importer detects tampering', {skip:!modulePath},async()=>{
  const {chromium}=await import(modulePath);
  const browser=await chromium.launch({headless:true,chromiumSandbox:true,...(process.env.GEO_BROWSER_EXECUTABLE ? {executablePath:process.env.GEO_BROWSER_EXECUTABLE} : {})});
  const dir=await mkdtemp(path.join(tmpdir(),'geo-manual-ui-'));
  try{
    const page=await browser.newPage({acceptDownloads:true});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('http://localhost:8765/**',async route=>{
      const name=new URL(route.request().url()).pathname.slice(1) || 'popup.html';
      const body=await readFile(new URL(`../extensions/google-maps-collector/${name}`,import.meta.url));
      await route.fulfill({body,contentType:name.endsWith('.mjs') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html'});
    });
    // Mock only Chrome's extension transport; popup code, browser storage,
    // downloaded file and Node import/validation all run unchanged.
    await page.addInitScript(()=>{
      const url='https://www.google.com/maps/place/Fixture/data=!1sfixture-store!8m2';
      window.chrome={tabs:{query:async()=>[{id:1,url}]},scripting:{executeScript:async input=>[{result:input.args ?
        {name:'Fixture Restaurant',address:'1 Main St, New York, NY',phone:'2125550100',website:'https://example.org',description:'',dishes:[],evidence:{name:'h1',address:'visible_address',phone:'visible_phone'},...(window.fixtureData || {})} :
        {url:window.fixtureUrl || url,title:'Fixture Restaurant - Google Maps',selection:'Fixture merchant introduction.'}}]},
        storage:{local:{get:async()=>({session:JSON.parse(localStorage.getItem('session') || 'null')}),set:async({session})=>localStorage.setItem('session',JSON.stringify(session)),remove:async()=>localStorage.removeItem('session')}}};
    });
    await page.goto('http://localhost:8765/popup.html');
    await page.getByRole('button',{name:'采集当前页',exact:true}).click();
    await page.getByText('已保存 1 份页面观察。',{exact:true}).waitFor();
    await page.reload();
    assert.match(await page.locator('#preview').innerText(),/Fixture Restaurant/);
    await page.locator('summary').click();
    await page.getByRole('button',{name:'保存选中文字',exact:true}).click();
    await page.getByText('已保存 2 份页面观察。',{exact:true}).waitFor();
    assert.match(await page.locator('#preview').innerText(),/Fixture merchant introduction/);
    const downloadPromise=page.waitForEvent('download');
    await page.getByRole('button',{name:'导出 JSON',exact:true}).click();
    const download=await downloadPromise;const file=path.join(dir,'capture.json');await download.saveAs(file);
    const json=JSON.parse(await readFile(file,'utf8'));
    assert.equal(json.platforms.google_maps.fields.description.value,'Fixture merchant introduction.');
    let run=spawnSync(process.execPath,['restaurant_collector/import-manual.mjs','--input',file,'--output',path.join(dir,'report')],{encoding:'utf8'});
    assert.equal(run.status,0,run.stderr);
    assert.match(await readFile(path.join(dir,'report/report.md'),'utf8'),/Fixture merchant introduction/);
    json.snapshots[0].data.name='Altered';
    const {writeFile}=await import('node:fs/promises');await writeFile(file,JSON.stringify(json));
    run=spawnSync(process.execPath,['restaurant_collector/import-manual.mjs','--input',file],{encoding:'utf8'});
    assert.equal(run.status,1);assert.match(run.stderr,/指纹/);
    // Reproduce an About tab whose URL still contains the previous Menu mode.
    await page.evaluate(()=>{
      window.fixtureUrl='https://www.google.com/maps/place/Fixture/data=!1sfixture-store!10e9!16sABC';
      window.fixtureData={selectedTabs:['About'],menuCategory:'About',aboutText:'Amenities\nRestroom'};
    });
    await page.locator('#pane').selectOption('about');
    await page.locator('#pane').selectOption('auto');
    await page.getByText('识别栏目：About 设施与服务',{exact:true}).waitFor();
    assert.equal(await page.locator('#menu-category-field').isVisible(),false);
    assert.equal(await page.locator('#menu-category').inputValue(),'');
    await page.getByRole('button',{name:'采集当前页',exact:true}).click();
    await page.getByText('已保存 3 份页面观察。',{exact:true}).waitFor();
    const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('session')));
    assert.equal(stored.snapshots.at(-1).pane,'about');
    assert.equal(stored.snapshots.at(-1).menuCategory,'');
    assert.equal(stored.snapshots.at(-1).data.menu,undefined);
    assert.equal(stored.snapshots.at(-1).data.attributes.sections[0].category,'Amenities');
    assert.deepEqual(errors,[]);
  }finally{await browser.close();await rm(dir,{recursive:true,force:true});}
});
