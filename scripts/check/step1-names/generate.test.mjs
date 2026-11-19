import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {buildNames, generateNames} from './generate.mjs';

const google = (id, name) => ({
  platform: 'google_maps', found: true, matched: true, name,
  url: `https://www.google.com/maps/search/?query_place_id=${id}`,
});

test('compare full names, preserve Han text, and represent missing or rejected platforms', () => {
  const rows = buildNames([
    {file: 'renamed.json', records: [
      google('a', 'Test (Hot Pot) 小龙坎火锅'),
      {platform: 'yelp', found: true, matched: true, name: 'TEST HOTPOT 小龙坎火锅'},
      {platform: 'uber_eats', found: true, matched: true, name: 'Test 小龙坎火锅'},
    ]},
    {file: 'other.json', records: [
      google('b', 'Other'),
      {platform: 'yelp', found: true, matched: false, name: 'Wrong branch', error: 'Different address.'},
    ]},
  ], [{store: 'one', place_id: 'a'}, {store: 'two', place_id: 'b'}]);
  assert.equal(rows.length, 6);
  assert.equal(rows[1].same_as_google, true);
  assert.equal(rows[1].name, 'TEST HOTPOT 小龙坎火锅');
  assert.equal(rows[1].google_chinese_name, '小龙坎火锅');
  assert.equal(rows[2].same_as_google, false);
  assert.equal(rows[4].name, null);
  assert.equal(rows[4].has_chinese, null);
  assert.equal(rows[4].same_as_google, null);
  assert.equal(rows[4].google_chinese_name, null);
  assert.equal(rows[4].note, 'Different address.');
  assert.equal(rows[5].name, null);
  assert.ok(rows[5].note);
  assert.throws(() => buildNames([], [{store: 'missing', place_id: 'a'}]), /no restaurant JSON/);
  assert.throws(() => buildNames([
    {file: 'duplicate.json', records: [google('a', 'A'), google('a', 'A')]},
  ], [{store: 'one', place_id: 'a'}]), /duplicate platform/);
});

test('include every input store, allow subsets, and distinguish new same-name branches', () => {
  const stores = [{store: '020', place_id: 'known'}, {store: 'unused', place_id: 'missing'}];
  const datasets = [
    {file: 'known.json', records: [google('known', 'Known')]},
    ...Array.from({length: 10}, (_,index) => ({
      file: `new-${index}.json`,
      records: [google(`new-${index}`, index < 2 ? 'Same Name' : `Restaurant ${index}`)],
    })),
  ];
  const rows = buildNames(datasets, stores);
  assert.equal(rows.length, 11);
  assert.equal(new Set(rows.map(row => row.store)).size, 11);
  assert.equal(rows[0].store, '020');
  assert.equal(rows[1].store, 'Same Name (new-0)');
  assert.equal(rows[2].store, 'Same Name (new-1)');
  assert.equal(rows[3].store, 'Restaurant 2');
  assert.deepEqual(buildNames([datasets[0]], stores).map(row => row.store), ['020']);
});

test('failed batches preserve the previous output', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'geo-names-'));
  try {
    const input = join(directory, 'input');
    const output = join(directory, 'names.json');
    await mkdir(input);
    await writeFile(output, 'previous output');
    await writeFile(join(input, 'unverified.json'), JSON.stringify([
      {...google('new-store', 'New Store'), matched: false},
    ]));
    await assert.rejects(generateNames(input, output), /Missing verified Google/);
    assert.equal(await readFile(output, 'utf8'), 'previous output');
    await writeFile(join(input, 'malformed.json'), '{');
    await assert.rejects(generateNames(input, output), SyntaxError);
    assert.equal(await readFile(output, 'utf8'), 'previous output');
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});
