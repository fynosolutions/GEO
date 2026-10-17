import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {inferPane,parseMenuText,parseAboutText,normalizeCapture,canonicalJson,hashInputs} from '../extensions/google-maps-collector/content.mjs';
import {addSnapshot,exportSession,listingKey} from '../extensions/google-maps-collector/session.mjs';
const url=mode=>`https://www.google.com/maps/place/Restaurant/data=!1sREGION!3m6!1sSTORE!10e${mode}!16sABC`;
const snap=(id,pane,data,category='')=>({id,url:url(pane==='menu'?9:pane==='about'?1:0),capturedAt:'2026-10-15T00:00:00Z',pane,menuCategory:category,data:{name:'Restaurant',address:'1 Main St',evidence:{},...data}});
test('current restaurant key wins over region/search-context keys',()=>{
  assert.equal(listingKey(url(9)),'maps:STORE');
  assert.equal(inferPane(url(9),['Overview']),'menu');
  assert.equal(inferPane(url(1),['Overview']),'about');
});
test('priced menu preserves names, descriptions and raw price by category',()=>{
  const menu=parseMenuText('Steamed Salmon Lunch\n1 Piece of Seasoned Salmon\n$13.99\nHanger Steak Lunch\nOur house marinade\n$10.99',{category:'Lunch menu'});
  assert.equal(menu.items.length,2);assert.equal(menu.items[0].name,'Steamed Salmon Lunch');
  assert.equal(menu.items[0].price,'$13.99');assert.equal(menu.items[1].description,'Our house marinade');
});
test('selected About tab overrides a stale Menu URL and removes menu data',()=>{
  assert.equal(inferPane(url(9),['About']),'about');
  assert.equal(inferPane(url(9),['关于']),'about');
  const data=normalizeCapture({menuCategory:'About',menuText:'Amenities\nRestroom',menu:{category:'About',items:[]},aboutText:'Amenities\nRestroom',evidence:{}},'about');
  assert.equal(data.menu,undefined);assert.equal(data.menuCategory,undefined);
  assert.equal(data.attributes.sections[0].category,'Amenities');
});
test('About attributes retain availability and never masquerade as a merchant introduction',()=>{
  const raw='Accessibility\n\ue5ca\nWheelchair accessible entrance\nService options\n\ue5cd\nDelivery';
  const data=normalizeCapture({description:raw,evidence:{}},'about');
  assert.equal(data.description,'');assert.equal(data.attributes.sections.length,2);
  assert.equal(data.attributes.sections[1].items[0].availability,'no');
});
test('a dish named Soup is not deleted because its category is also Soup',()=>{
  assert.equal(parseMenuText('Soup\nDaily broth\n$5.00',{category:'Soup'}).items[0].name,'Soup');
});
test('reservation banner and category navigation do not become the first dish',()=>{
  const raw='Overview\nMenu\nReviews\nAbout\nLunch Menu\nSoups/Sopas\nSauces\nSecure your spot\nSee tables and times\n\ue8f8\nReserve a table\nSteamed Salmon Lunch\n1 Piece of Seasoned Salmon\n$13.99\nHanger Steak Lunch\nHouse marinade\n$10.99';
  const data=normalizeCapture({menuText:raw,menuCategories:['Lunch Menu','Soups/Sopas','Sauces'],evidence:{}},'menu','Lunch Menu');
  assert.equal(data.menu.items.length,2);
  assert.deepEqual(data.menu.items[0],{name:'Steamed Salmon Lunch',description:'1 Piece of Seasoned Salmon',price:'$13.99',parseStatus:'parsed',rawText:'Steamed Salmon Lunch\n1 Piece of Seasoned Salmon\n$13.99'});
  assert.equal(data.menu.rawText,raw);
  const old={...data,menu:{...data.menu,items:[{name:'Secure your spot',price:'$13.99',parseStatus:'needs_review'}]}};
  assert.equal(normalizeCapture(old,'menu','Lunch Menu').menu.items[0].name,'Steamed Salmon Lunch');
});
test('UI filtering does not remove prose mentioning tables or change Soup dishes',()=>{
  const menu=parseMenuText('Soup\nMade for sharing at your table\n$5.00\nReservation Special\nReserve a table for a dinner with this dish\n$12.00',{category:'Soup'});
  assert.equal(menu.items[0].name,'Soup');
  assert.equal(menu.items[1].description,'Reserve a table for a dinner with this dish');
});
test('a targeted merchant description survives alongside About attributes',()=>{
  const data=normalizeCapture({description:'A seafood restaurant.',aboutText:'Amenities\nRestroom',evidence:{}},'about');
  assert.equal(data.description,'A seafood restaurant.');assert.equal(data.attributes.sections.length,1);
});
test('old manual menu selections in description are repaired without description conflicts',()=>{
  let session=addSnapshot(null,snap('one','overview',{}));
  session=addSnapshot(session,snap('two','about',{description:'Amenities\nRestroom'}));
  session=addSnapshot(session,snap('three','menu',{description:'Salmon\nGrilled\n$13.99'},'Lunch menu'));
  session=addSnapshot(session,snap('four','menu',{description:'Soup\nDaily\n$5.00'},'Soup'));
  const result=exportSession(session);const f=result.platforms.google_maps.fields;
  assert.equal(result.conflicts.length,0);assert.equal(f.description.value,null);
  assert.equal(f.attributes.value[0].category,'Amenities');assert.equal(f.menu.value.length,2);
  assert.equal(f.specialties.value,null);
});
test('same category repeated capture deduplicates items while different categories preserve different prices',()=>{
  let session=addSnapshot(null,snap('one','overview',{}));
  for(const [id,category,price] of [['two','Lunch menu','$10.00'],['three','Lunch menu','$10.00'],['four','Dinner','$20.00']])
    session=addSnapshot(session,snap(id,'menu',{description:`Steak\n${price}`},category));
  const r=exportSession(session);assert.equal(r.conflicts.length,0);assert.equal(r.platforms.google_maps.fields.menu.value.length,2);
  assert.equal(r.platforms.google_maps.fields.menu.value[0].items.length,1);
});
test('manual menu selection is preserved instead of being overwritten by full-pane automatic text',()=>{
  const data=normalizeCapture({menuText:'Wrong section\n$99.00',evidence:{}},'menu','Lunch menu','Salmon\n$13.99');
  assert.equal(normalizeCapture(data,'menu','Lunch menu').menu.items[0].name,'Salmon');
});
test('new content fingerprints survive Chrome storage property reordering',()=>{
  const s={id:'one',url:url(9),capturedAt:'now',pane:'menu',data:{name:'Restaurant',evidence:{name:'h1'}},hashAlgorithm:'sha256-canonical-json-v1'};
  s.sha256=createHash('sha256').update(canonicalJson(s)).digest('hex');
  const reordered=JSON.parse(canonicalJson(s));
  assert.equal(createHash('sha256').update(hashInputs(reordered)[0]).digest('hex'),s.sha256);
});
