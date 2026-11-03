import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { authenticated, sessionCookie } from '../dist/backend/auth.js';
const token = 'test-only-access-token';
test('sessions reject wrong, expired, tampered and rotated tokens',()=>{
 const cookie=sessionCookie(token,false,1000).split(';')[0];
 assert.equal(authenticated({headers:{cookie}},token,2000),true);
 assert.equal(authenticated({headers:{cookie}},token,1000+8*3600*1000),false);
 assert.equal(authenticated({headers:{cookie}},'rotated',2000),false);
 assert.equal(authenticated({headers:{cookie:cookie+'0'}},token,2000),false);
 assert.equal(authenticated({headers:{authorization:'Bearer wrong'}},token),false);
 assert.equal(authenticated({headers:{authorization:'Bearer '+token}},token),true);
 assert.equal(authenticated({headers:{authorization:'Bearer '+token}},''),false);
});
test('all API routes require authentication and browser sessions support downloads',async()=>{
 const child=spawn(process.execPath,['dist/backend/server.js'],{env:{...process.env,PORT:'0',HOST:'127.0.0.1',GEO_API_TOKEN:token,APIFY_TOKEN:''},stdio:['ignore','pipe','pipe']});
 try{
 const base=await new Promise((resolve,reject)=>{child.stdout.on('data',chunk=>{const match=String(chunk).match(/http:\/\/127\.0\.0\.1:\d+/);if(match)resolve(match[0]);});child.once('error',reject);child.once('exit',()=>reject(new Error('Server exited')));});
 const id='11111111-1111-4111-8111-111111111111';
 for(const [path,method]of [['/api/check','POST'],['/api/health','GET'],[`/api/audits/${id}`,'GET'],[`/api/audits/${id}/output.json`,'GET'],[`/api/audits/${id}/screenshots/yelp.png`,'GET'],[`/api/audits/${id}/cancel`,'POST']]) {
   assert.equal((await fetch(base+path,{method})).status,401);
   assert.equal((await fetch(base+path,{method,headers:{Authorization:'Bearer incorrect'}})).status,401);
 }
 assert.equal((await fetch(base+'/')).status,200);
 const denied=await fetch(base+'/api/session',{method:'POST',headers:{Authorization:'Bearer '+token,Origin:'https://other.example'}});assert.equal(denied.status,403);
 const login=await fetch(base+'/api/session',{method:'POST',headers:{Authorization:'Bearer '+token}});assert.equal(login.status,200);
 const cookie=login.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);assert.ok(!cookie.includes(token));
 const headers={Cookie:cookie.split(';')[0]};assert.equal((await fetch(base+'/api/health',{headers})).status,200);
 assert.equal((await fetch(`${base}/api/audits/${id}/output.json`,{headers})).status,404);
 assert.equal((await fetch(base+'/api/health?token='+token)).status,401);
 const {chromium}=await import('playwright');const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chromium',headless:true});
 try {
   const page=await browser.newPage();await page.goto(base);
   await page.locator('#website').fill('https://fixture.example');await page.locator('#submit-button').click();
   await page.getByLabel('Access token').fill('wrong');await page.getByRole('button',{name:'Unlock GEO'}).click();
   await page.getByText('Access denied. Check the token or server connection.').waitFor();
   await page.getByLabel('Access token').fill(token);await page.getByRole('button',{name:'Unlock GEO'}).click();
   await page.waitForFunction(()=>!document.querySelector('input[type=password]'));
   assert.equal((await page.request.get(base+'/api/health')).status(),200);
   assert.equal(await page.evaluate(()=>document.cookie),'');
   assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);
 }finally{await browser.close();}

 }finally{child.kill();await once(child,'exit');}
});

test('runtime guard enforces Node 24.14 minimum before application imports',async()=>{
 const {readFile}=await import('node:fs/promises');const {runInNewContext}=await import('node:vm');
 const source=await readFile(new URL('./check-runtime.mjs',import.meta.url),'utf8');
 for(const version of ['22.20.0','24.13.0','24.14.0','25.0.0']) {
   let rejected=false;runInNewContext(source,{process:{versions:{node:version},exit:()=>{rejected=true;}},console:{error:()=>{}}});
   assert.equal(rejected,['22.20.0','24.13.0'].includes(version));
 }
});
