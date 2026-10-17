import {test} from 'node:test';
import assert from 'node:assert/strict';
import {allowedUrl,addSnapshot,exportSession} from '../extensions/google-maps-collector/session.mjs';
const snap=(id,data={},key='branch-a')=>({id,capturedAt:'2026-10-15T00:00:00Z',pane:'overview',url:`https://www.google.com/maps/place/Easy+Joy/data=!1s${key}!8m2`,data:{name:'Easy Joy',address:'145 Mulberry St, New York, NY',evidence:{},...data}});
test('extension accepts Maps only and requires an identified overview first',()=>{
  assert.equal(allowedUrl('https://www.google.com/maps/place/Easy'),true);
  assert.equal(allowedUrl('https://google.com.evil.example/maps'),false);
  assert.throws(()=>addSnapshot(null,snap('one',{address:''})),/概览/);
});
test('About observation can enrich an identified store without repeating its address',()=>{
  let s=addSnapshot(null,snap('one',{phone:'2125550100'}));
  s=addSnapshot(s,snap('two',{name:'',address:'',description:'A real page excerpt.',descriptionKind:'human_selected_page_text'}));
  const result=exportSession(s);
  assert.equal(result.platforms.google_maps.fields.description.value,'A real page excerpt.');
  assert.equal(result.platforms.google_maps.fields.contact.value.phone,'2125550100');
  assert.equal(result.platforms.google_maps.fields.specialties.status,'not_collected');
});
test('same-name different branch is rejected even when text happens to match',()=>{
  const s=addSnapshot(null,snap('one'));
  assert.throws(()=>addSnapshot(s,snap('two',{},'branch-b')),/另一门店/);
});
test('an overview search URL can acquire its stable place key before About capture',()=>{
  let s=addSnapshot(null,{...snap('one'),url:'https://www.google.com/maps/search/Easy+Joy'});
  s=addSnapshot(s,snap('two'));
  s=addSnapshot(s,snap('three',{address:'',description:'About text'}));
  assert.equal(s.restaurant.key,'maps:branch-a');
  assert.equal(exportSession(s).platforms.google_maps.fields.description.value,'About text');
});
test('different description excerpts are variants, while menu and About supplement separate fields',()=>{
  let s=addSnapshot(null,snap('one',{description:'Old description'}));
  s=addSnapshot(s,snap('two',{description:'Different description',dishes:['Dumplings']}));
  const r=exportSession(s);
  assert.equal(r.conflicts.length,0);
  assert.equal(r.descriptionVariants.length,2);
  assert.equal(r.platforms.google_maps.fields.description.value,'Old description');
  assert.deepEqual(r.platforms.google_maps.fields.specialties.value,['Dumplings']);
});
