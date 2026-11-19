import {readFile, readdir, mkdir, writeFile, rename, rm} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import {randomUUID} from 'node:crypto';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const destination = join(root, 'samples/step1-names/names.json');
const reservations = new Set(['opentable', 'resy']);
const comparable = name => name.toLowerCase().replace(/[\p{P}\s]/gu, '');
const hasChinese = name => /\p{Script=Han}/u.test(name);

async function readJson(path) {
  return JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/u, ''));
}

export function buildNames(datasets, stores) {
  if (datasets.length === 0) throw new Error('Input directory contains no restaurant JSON files.');
  const platforms = [];
  const byPlace = new Map();
  for (const {file, records} of datasets) {
    if (!Array.isArray(records) || records.length === 0) {
      throw new Error(`Expected a non-empty platform array in ${file}.`);
    }
    const seen = new Set();
    for (const record of records) {
      if (!record || typeof record.platform !== 'string' || !record.platform.trim() || seen.has(record.platform)) {
        throw new Error(`Invalid or duplicate platform in ${file}.`);
      }
      seen.add(record.platform);
      if (!platforms.includes(record.platform)) platforms.push(record.platform);
    }
    const google = records.find(record => record.platform === 'google_maps');
    if (!google?.found || google.matched !== true || typeof google.name !== 'string' || !google.name.trim()) {
      throw new Error(`Missing verified Google name in ${file}.`);
    }
    const placeId = new URL(google.url).searchParams.get('query_place_id');
    if (!placeId || byPlace.has(placeId)) {
      throw new Error(`Missing or duplicate Google place ID in ${file}.`);
    }
    byPlace.set(placeId, {google, records});
  }
  if (new Set(stores.map(store => store.store)).size !== stores.length ||
      new Set(stores.map(store => store.place_id)).size !== stores.length) {
    throw new Error('Duplicate store identifiers in stores.json.');
  }
  const selectedStores = stores.filter(store => byPlace.has(store.place_id));
  const knownPlaces = new Set(stores.map(store => store.place_id));
  const newStores = [...byPlace].filter(([placeId]) => !knownPlaces.has(placeId))
    .map(([placeId, data]) => ({store: data.google.name, place_id: placeId}));
  const labels = [...selectedStores, ...newStores].map(store => store.store);
  for (const store of newStores) {
    const duplicated = labels.filter(label => label === store.store).length > 1;
    selectedStores.push({
      ...store,
      store: duplicated ? `${store.store} (${store.place_id})` : store.store,
    });
  }
  if (new Set(selectedStores.map(store => store.store)).size !== selectedStores.length) {
    throw new Error('Generated store identifiers conflict. Assign distinct labels in stores.json.');
  }
  const rows = [];
  for (const store of selectedStores) {
    const data = byPlace.get(store.place_id);
    const chineseName = data.google.name.match(/\p{Script=Han}+/gu)?.join(' ') ?? null;
    for (const platform of platforms) {
      const record = data.records.find(item => item.platform === platform);
      const verified = record?.found === true && record.matched === true &&
        typeof record.name === 'string' && record.name.trim().length > 0;
      const row = {
        store: store.store,
        platform,
        name: verified ? record.name : null,
        has_chinese: verified ? hasChinese(record.name) : null,
        google_chinese_name: chineseName,
        same_as_google: verified ? comparable(record.name) === comparable(data.google.name) : null,
      };
      if (!verified) {
        const reason = record?.error?.trim() || 'No verified platform name is available in the input data.';
        row.note = reservations.has(platform)
          ? `Reservation platform deferred under Issue #19. Batch result: ${reason}`
          : reason;
      }
      rows.push(row);
    }
  }
  return rows;
}

export async function generateNames(inputDirectory, outputFile = destination) {
  const stores = await readJson(new URL('./stores.json', import.meta.url));
  const entries = (await readdir(inputDirectory, {withFileTypes: true}))
    .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
    .sort((a, b) => a.name.localeCompare(b.name));
  const datasets = await Promise.all(entries.map(async entry => ({
    file: entry.name,
    records: await readJson(join(inputDirectory, entry.name)),
  })));
  const rows = buildNames(datasets, stores);
  await mkdir(dirname(outputFile), {recursive: true});
  const temporary = `${outputFile}.${randomUUID()}.tmp`;
  try {
    const text = '[\n' + rows.map(row => '  ' + JSON.stringify(row)).join(',\n') + '\n]\n';
    await writeFile(temporary, text, {encoding: 'utf8', flag: 'wx'});
    await rename(temporary, outputFile);
  } finally {
    await rm(temporary, {force: true});
  }
  return rows;
}

async function main() {
  const {values} = parseArgs({options: {
    input: {type: 'string'},
    help: {type: 'boolean', short: 'h'},
  }});
  if (values.help) {
    console.log('Usage: node scripts/check/step1-names/generate.mjs --input "<batch directory>"');
    console.log('Relative input paths resolve from the repository root. Output: samples/step1-names/names.json');
    return;
  }
  if (!values.input?.trim()) throw new Error('Supply a batch directory with --input.');
  const rows = await generateNames(resolve(root, values.input));
  console.log(`Generated ${rows.length} records for ${new Set(rows.map(row => row.store)).size} stores.`);
  console.log(`Same: ${rows.filter(row => row.same_as_google === true).length}; different: ${rows.filter(row => row.same_as_google === false).length}; unavailable: ${rows.filter(row => row.name === null).length}.`);
  console.log(destination);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
