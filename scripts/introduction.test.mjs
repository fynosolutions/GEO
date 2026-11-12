import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { test } from 'node:test';
import { collectIntroductions, mapIntroduction, selectIntroductionPlatforms } from '../dist/backend/introduction.js';
import { collectApify } from '../dist/backend/apify.js';

const timestamp = '2026-11-11T04:00:00.000Z';
const address = '145 Mulberry St, New York, NY 10013';
const googleUrl = 'https://www.google.com/maps/place/Fixture';
const yelpUrl = 'https://www.yelp.com/biz/fixture';
const tripUrl = 'https://www.tripadvisor.com/Restaurant_Review-g1-d2-Reviews-Fixture.html';

test('introductions preserve actor labels and keep missing review highlights null', () => {
  const google = mapIntroduction('google_maps', {
    categories: ['Hot pot restaurant'],
    categoryName: 'Hot pot restaurant',
    ownerDescription: 'Original\ntext.',
    additionalInfo: { Accessibility: [{ 'Wheelchair accessible restroom': true }, { 'Assistive hearing loop': false }], 'Popular for': [{ Dinner: true }], 'Dining options': [{ Dinner: true }] },
    placesTags: [{ title: 'Tag as displayed' }],
    reviewsTags: [{ title: 'dim sum', count: 120 }],
    imagesCount: 0,
  }, googleUrl, timestamp);
  assert.deepEqual(google, {
    platform: 'google_maps', categories: ['Hot pot restaurant'], description: 'Original\ntext.',
    attributes: ['Wheelchair accessible restroom', 'Assistive hearing loop', 'Dinner', 'Dinner', 'Tag as displayed'],
    highlights: ['dim sum · 120'], photo_count: 0, url: googleUrl, fetched_at: timestamp, error: null,
  });
  const yelp = mapIntroduction('yelp', {
    categories: ['Hot Pot'], aboutTheBusiness: { specialties: 'Store text' },
    amenities: [{ RestaurantsReservations: 'Takes Reservations', isEnabled: true }],
    businessHighlights: ['Private events'], mediaCount: 123,
  }, yelpUrl, timestamp);
  assert.deepEqual(yelp.attributes, ['Takes Reservations', 'Private events']);
  assert.equal(yelp.highlights, null);
  const trip = mapIntroduction('tripadvisor', {
    cuisines: ['Chinese'], features: ['Reservations'], dietaryRestrictions: ['Vegetarian friendly'],
    mealTypes: ['Dinner'], reviewTags: [{ text: 'dim sum', reviews: null }],
  }, tripUrl, timestamp);
  assert.deepEqual(trip.attributes, ['Reservations', 'Vegetarian friendly', 'Dinner']);
  assert.deepEqual(trip.highlights, ['dim sum']);
  assert.match(trip.error, /description, photo_count/);
  assert.throws(() => selectIntroductionPlatforms(['google_maps', 'facebook']));
});

test('introductions export one file per store and exclude a wrong-branch platform result', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'geo-introduction-'));
  const oldOutput = process.env.OUTPUT_DIR;
  const oldData = process.env.COLLECTION_DATA_DIR;
  process.env.OUTPUT_DIR = workspace;
  process.env.COLLECTION_DATA_DIR = join(workspace, 'diagnostics');
  const id = 'issue-13-fixture';
  try {
    const progress = { stores: [] };
    const calls = [];
    const apify = async (platform, target, _signal, _transport, options) => {
      calls.push({ platform, options });
      const business = { title: 'Fixture', address };
      const items = {
        google_maps: [{ ...business, url: googleUrl, placeId: 'ChIJFixture', categories: ['Hot Pot'], ownerDescription: 'Original Google', imagesCount: 3 }],
        _discovery: [{ organicResults: [{ url: yelpUrl }, { url: tripUrl }] }],
        yelp: [{ ...business, url: yelpUrl, aboutTheBusiness: { specialties: 'Original Yelp' } }],
        tripadvisor: [{ ...business, address: '400 Mulberry St, New York, NY 10013', webUrl: tripUrl, description: 'Wrong branch' }],
      }[platform];
      return { status: 'unverified', target, items, collected_at: timestamp };
    };
    await collectIntroductions(id, [
      { id: 'name-input', name: 'Fixture', address },
      { id: 'place-input', place_id: 'ChIJFixture' },
    ], selectIntroductionPlatforms(), progress, new AbortController().signal, async () => {}, { apify, batch: true });
    const batchRoot = join(workspace, 'introductions', 'batches');
    const [batchDirectory] = await readdir(batchRoot);
    assert.match(batchDirectory, /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z - Collect Introduction$/);
    assert.equal((await readdir(join(batchRoot, batchDirectory))).length, 2);
    for (const store of progress.stores) {
      assert.equal(basename(dirname(store.output_file)), batchDirectory);
      const records = JSON.parse(await readFile(store.output_file, 'utf8'));
      assert.deepEqual(records.map(record => record.platform), ['google_maps', 'yelp', 'tripadvisor']);
      assert.equal(records[0].description, 'Original Google');
      assert.equal(records[1].description, 'Original Yelp');
      assert.equal(records[2].description, null);
      assert.equal(records[2].url, null);
      assert.match(records[2].error, /matched:false/);
    }
    assert.equal(calls[0].options.entry.input.scrapePlaceDetailPage, true);
    assert.ok(calls.every(call => call.options.maxChargeUsd === null));
  } finally {
    if (oldOutput === undefined) delete process.env.OUTPUT_DIR; else process.env.OUTPUT_DIR = oldOutput;
    if (oldData === undefined) delete process.env.COLLECTION_DATA_DIR; else process.env.COLLECTION_DATA_DIR = oldData;
    await rm(workspace, { recursive: true, force: true });
  }
});

test('all six stores launch Apify without a charge cap or a local billing gate', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'geo-introduction-six-stores-'));
  const environment = {
    OUTPUT_DIR: workspace,
    COLLECTION_DATA_DIR: join(workspace, 'diagnostics'),
    APIFY_TOKEN: 'fixture',
    APIFY_ENABLED: 'true',
    APIFY_MAX_CHARGE_USD: '0.75',
  };
  const previous = Object.fromEntries(Object.keys(environment).map(key => [key, process.env[key]]));
  Object.assign(process.env, environment);
  try {
    const progress = { stores: [] };
    const launches = [];
    const apify = async (platform, target, signal, _transport, options) => {
      const business = { title: target.name, address };
      const profile = { categories: ['Hot Pot'], description: 'Original', photoCount: 3 };
      const items = {
        google_maps: [{ ...business, ...profile, url: googleUrl, imagesCount: 3, additionalInfo: { Amenities: [{ Groups: true }] } }],
        _discovery: [{ organicResults: [{ url: yelpUrl }, { url: tripUrl }] }],
        yelp: [{ ...business, ...profile, url: yelpUrl, amenitiesAndMore: ['Groups'] }],
        tripadvisor: [{ ...business, ...profile, webUrl: tripUrl, cuisines: ['Chinese'], features: ['Reservations'] }],
      }[platform];
      const transport = async (url, request) => {
        const requestUrl = new URL(url);
        if (request.method === 'POST') {
          launches.push(requestUrl);
          const id = `run-${launches.length}`;
          return Response.json({ data: { id, status: 'SUCCEEDED', defaultDatasetId: id, usageTotalUsd: 1 } });
        }
        assert.match(requestUrl.pathname, /^\/v2\/datasets\/run-\d+\/items$/);
        return Response.json(items);
      };
      return collectApify(platform, target, signal, transport, options);
    };
    const stores = Array.from({ length: 6 }, (_, i) => ({ id: `store-${i + 1}`, name: `Fixture ${i + 1}`, address }));
    await collectIntroductions('six-stores', stores, selectIntroductionPlatforms(), progress,
      new AbortController().signal, async () => {}, { apify, batch: true });
    assert.equal(launches.length, 24);
    assert.ok(launches.every(url => !url.searchParams.has('maxTotalChargeUsd')));
    assert.ok(progress.stores.every(store => store.status === 'completed'));
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await rm(workspace, { recursive: true, force: true });
  }
});
