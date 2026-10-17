import {test} from 'node:test';
import assert from 'node:assert/strict';
import {choose,sameBranch} from '../restaurant_collector/match.mjs';
import {makeResult,markdown} from '../restaurant_collector/cli.mjs';
const store = (address='145 Mulberry Street, New York, NY 10013') => ({name:'Easy Joy',address,phone:'(212) 555-0100',url:'https://www.yelp.com/biz/example',description:'',dishes:[],evidence:{}});
test('one name typo and one house-number typo retain the correct nearby business', () => {
  const result = choose('Easy Jiy','146 Mulbery St, New York, NY',[store(),{...store(),name:'Other Restaurant'}]);
  assert.equal(result.status,'matched');
  assert.equal(result.selected.name,'Easy Joy');
});
test('platform title suffixes and Chinese aliases do not hide a short core name', () => {
  assert.equal(choose('Easy Jiy','146 Mulberry St, New York, NY',[
    {...store(),name:'Easy Joy (Hot Pot, BBQ Skewers, Dim Sum) 意中人火锅烧烤点心'}]).status,'matched');
});
test('name match alone does not choose a distant branch', () => {
  assert.equal(choose('Easy Joy','145 Mulberry St, New York, NY',[store('900 Sunset Blvd, Los Angeles, CA')]).selected,null);
});
test('the same street and house number in another city is not a match', () => {
  assert.equal(choose('Easy Joy','145 Mulberry St, New York, NY',[store('145 Mulberry St, Newark, NJ')]).selected,null);
});
test('a broad city query with same-name branches requires clarification', () => {
  assert.equal(choose('Easy Joy','New York, NY',[store(),store('190 Mulberry St, New York, NY 10013')]).status,'ambiguous');
});
test('wrong brand is not selected merely because it occupies the same address', () => {
  assert.equal(choose('Easy Joy','145 Mulberry St, New York, NY',[{...store(),name:'Pizza Palace'}]).selected,null);
});
test('phone formatting is tolerated but conflicting cross-platform house numbers are rejected', () => {
  assert.equal(sameBranch(store(),{...store(),phone:'+1 212 555 0100'}),true);
  assert.equal(sameBranch(store(),store('146 Mulberry St, New York, NY 10013')),false);
});
test('conflicting platform branches produce no merged restaurant', () => {
  const result = makeResult({}, {google_maps:{status:'matched',selected:store()},yelp:{status:'matched',selected:store('146 Mulberry St, New York, NY 10013')}},'now');
  assert.equal(result.status,'cross_platform_conflict');
  assert.equal(result.restaurant,null);
  assert.equal(result.platforms.yelp.fields,undefined);
});
test('missing dishes and description stay unknown and are shown in the readable report', () => {
  const result = makeResult({name:'Easy Joy',location:'NY'}, {google_maps:{status:'matched',selected:store()},yelp:{status:'failed',error:'HTTP 403'}},'now');
  assert.equal(result.status,'partial');
  assert.equal(result.platforms.google_maps.fields.specialties.value,null);
  assert.equal(result.platforms.google_maps.fields.description.status,'not_collected');
  assert.match(markdown(result),/未采集到/);
});
