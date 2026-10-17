import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classifyGoogle,mergeObservations,navigateGoogle} from '../restaurant_collector/google.mjs';
test('Google limited view is not mislabeled as captcha or rate limit',()=>{
  assert.equal(classifyGoogle({body:"You're seeing a limited view of Google Maps."}).status,'limited_view');
  assert.equal(classifyGoogle({body:'Our systems have detected unusual traffic'}).status,'verification_required');
  assert.equal(classifyGoogle({url:'https://www.google.com/sorry/index'}).status,'verification_required');
  assert.equal(classifyGoogle({status:429}).status,'rate_limited');
  assert.equal(classifyGoogle({status:403}).status,'access_denied');
  assert.equal(classifyGoogle({url:'https://consent.google.com/'}).status,'consent_required');
});
test('pane results only enrich the same restaurant and retain the description origin',()=>{
  const base={name:'Easy Joy',description:'',dishes:[],evidence:{},coverageNotes:[]};
  const data={...base,description:'Merchant description',descriptionKind:'business_description',dishes:['Dumplings'],evidence:{description:'merchant section',specialties:'Popular dishes'}};
  const merged=mergeObservations(base,[{label:'about',data},{label:'other',data:{...data,name:'Wrong Branch',dishes:['Wrong dish']}}]);
  assert.equal(merged.description,'Merchant description');
  assert.deepEqual(merged.dishes,['Dumplings']);
  assert.equal(merged.evidence.description.pane,'about');
});
test('HTTP 429 stops without requesting manual verification or retrying',async()=>{
  let requests=0;
  const page={waitForTimeout:async()=>{},goto:async()=>{requests++;return {status:()=>429};},url:()=>'',locator:selector=>({innerText:async()=>'',count:async()=>0})};
  await assert.rejects(navigateGoogle(page,'https://www.google.com/maps',{interactive:true,confirm:async()=>assert.fail('must not prompt')}),e=>e.code==='rate_limited');
  assert.equal(requests,1);
});
test('interactive consent resumes only after explicit human action and reinspection',async()=>{
  let completed=false;
  const page={waitForTimeout:async()=>{},goto:async()=>({status:()=>200}),url:()=>completed ? 'https://www.google.com/maps' : 'https://consent.google.com/',locator:()=>({innerText:async()=>'',count:async()=>0})};
  const result=await navigateGoogle(page,'https://www.google.com/maps',{interactive:true,confirm:async()=>{completed=true;}});
  assert.equal(result.status,'available');
});
test('limited view gives interactive users an optional manual sign-in opportunity',async()=>{
  let prompted=false;
  const page={waitForTimeout:async()=>{},goto:async()=>({status:()=>200}),url:()=> 'https://www.google.com/maps',locator:()=>({innerText:async()=>"You're seeing a limited view of Google Maps",count:async()=>0})};
  const result=await navigateGoogle(page,'https://www.google.com/maps',{interactive:true,confirm:async()=>{prompted=true;}});
  assert.equal(prompted,true);
  assert.equal(result.status,'limited_view');
});
