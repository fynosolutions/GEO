import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { collectApify, type Entry } from './apify.js';
import { collectRestaurant, readVerifiedProviders, safeName } from './collection.js';
import { conciseError } from './errors.js';
import type { BatchStore } from './batch.js';
import { createBatchOutputDirectory } from './output.js';

export const introductionPlatforms = ['google_maps', 'yelp', 'tripadvisor'] as const;
type Platform = typeof introductionPlatforms[number];
type Row = Record<string, unknown>;

export type IntroductionRecord = {
  platform: Platform;
  categories: string[] | null;
  description: string | null;
  attributes: string[] | null;
  highlights: string[] | null;
  photo_count: number | null;
  url: string | null;
  fetched_at: string;
  error: string | null;
};
type StoreResult = {
  id: string;
  name: string;
  status: string;
  records: IntroductionRecord[];
  filename?: string;
  output_file?: string;
};
export type IntroductionProgress = { stores: StoreResult[] };

export function selectIntroductionPlatforms(value: unknown): Platform[] {
  if (value === undefined) return [...introductionPlatforms];
  const platforms = introductionPlatforms.filter(platform => Array.isArray(value) && value.includes(platform));
  if (!Array.isArray(value) || !platforms.length || value.some(p => !platforms.includes(p))) {
    throw Error('Select Google Maps, Yelp or Tripadvisor for introduction collection.');
  }
  return platforms;
}

const row = (value: unknown): Row =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
const original = (...values: unknown[]) =>
  values.find((value): value is string => typeof value === 'string' && !!value.trim()) ?? null;
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const labels = (...values: unknown[]) => {
  const strings = values.filter((value): value is string => typeof value === 'string' && !!value.trim());
  return strings.length ? strings : null;
};
const count = (...values: unknown[]) =>
  values.find((value): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) ?? null;

function emptyRecord(platform: Platform, error: string | null, fetched_at = new Date().toISOString()): IntroductionRecord {
  return { platform, categories: null, description: null, attributes: null, highlights: null, photo_count: null, url: null, fetched_at, error };
}

export function mapIntroduction(platform: Platform, item: unknown, url: string, fetched_at: string): IntroductionRecord {
  const raw = row(row(item).restaurant ?? item);
  const record = { ...emptyRecord(platform, null, fetched_at), url };
  if (platform === 'google_maps') {
    record.categories = labels(...new Set([...list(raw.categories), raw.categoryName]));
    record.description = original(raw.ownerDescription, raw.description);
    // Google returns the labels as keys and availability separately as booleans.
    const about = Object.values(row(raw.additionalInfo)).flatMap(group => list(group).flatMap(entry =>
      Object.entries(row(entry)).filter(([, availability]) => typeof availability === 'boolean').map(([label]) => label)));
    record.attributes = labels(...about, ...list(raw.placesTags).map(tag => original(tag, row(tag).title)));
    record.highlights = reviewHighlights(raw.reviewsTags);
    record.photo_count = count(raw.imagesCount);
  } else if (platform === 'yelp') {
    record.categories = labels(...list(raw.categories).map(category => original(category, row(category).title)));
    record.description = original(row(raw.aboutTheBusiness).specialties, row(raw.about).specialties, raw.description, raw.about, row(raw.aboutTheBusiness).history, raw.history);
    record.attributes = labels(...list(raw.amenitiesAndMore), ...list(raw.amenities).flatMap(entry => Object.values(row(entry))), ...list(raw.businessHighlights));
    record.highlights = reviewHighlights(raw.reviewHighlights);
    record.photo_count = count(raw.photoCount, raw.mediaCount);
  } else {
    record.categories = labels(...list(raw.cuisines), ...list(raw.establishmentTypes), ...list(raw.subcategories));
    record.description = original(raw.description);
    record.attributes = labels(...list(raw.features), ...list(raw.dietaryRestrictions), ...list(raw.mealTypes), ...list(raw.dishes), ...list(raw.ownersTopReasons));
    record.highlights = reviewHighlights(raw.reviewTags);
    record.photo_count = count(raw.photoCount);
  }
  const unavailable = (['categories', 'description', 'attributes', 'photo_count'] as const).filter(key => record[key] === null);
  if (unavailable.length) record.error = `Unavailable public fields: ${unavailable.join(', ')}.`;
  return record;
}

function reviewHighlights(value: unknown) {
  return labels(...list(value).map(entry => {
    const tag = row(entry);
    const text = original(entry, tag.title, tag.text);
    const total = count(tag.count, tag.reviews);
    return text && total !== null ? `${text} · ${total}` : text;
  }));
}

export async function collectIntroductions(
  id: string,
  targets: BatchStore[],
  platforms: Platform[],
  progress: IntroductionProgress,
  signal: AbortSignal,
  onProgress: () => Promise<void>,
  options: { batch?: boolean; apify?: typeof collectApify } = {},
) {
  const root = resolve(process.env.OUTPUT_DIR || 'out', 'introductions');
  const directory = options.batch
    ? await createBatchOutputDirectory(join(root, 'batches'), 'Collect Introduction')
    : root;
  if (!options.batch) await mkdir(directory, { recursive: true });
  const config = JSON.parse(await readFile(process.env.APIFY_CONFIG_FILE || 'config/apify.json', 'utf8')) as Record<string, Entry>;
  const google = config.google_maps;
  if (!google?.actor) throw Error('No Google Maps Actor configured.');
  const googleProfile = { ...google, input: { ...row(google.input), scrapePlaceDetailPage: true, maxReviews: 0, maxImages: 0 } };
  const apify = options.apify ?? collectApify;
  const provider: typeof collectApify = (platform, target, runSignal, transport) =>
    apify(platform, target, runSignal, transport, {
      maxChargeUsd: null,
      entry: platform === 'google_maps' ? googleProfile : undefined,
    });
  const filenames = new Set<string>();
  for (const target of targets) {
    const { id: storeId, ...input } = target;
    const store: StoreResult = { id: storeId, name: input.name || input.place_id!, status: 'running', records: [] };
    progress.stores.push(store);
    await onProgress();
    try {
      signal.throwIfAborted();
      const result = await collectRestaurant({ ...input, platforms }, signal, undefined, {
        apify: provider,
        outputDirectory: join(process.env.COLLECTION_DATA_DIR || '.local/collections', 'introduction-staging', id, storeId),
      });
      store.name = result.name;
      const verified = await readVerifiedProviders(result.directory, result.records);
      store.records = platforms.map(platform => {
        const listing = result.records.find(record => record.platform === platform);
        const raw = verified[platform];
        if (raw?.items.length === 1 && listing?.url) return mapIntroduction(platform, raw.items[0], listing.url, raw.collected_at);
        return emptyRecord(platform, listing?.matched ? 'The verified listing details were unavailable.' : listing?.error || 'Collection did not complete.', listing?.fetched_at);
      });
    } catch (error) {
      store.records = platforms.map(platform => emptyRecord(platform, signal.aborted ? 'Cancelled.' : conciseError(error)));
    }
    const base = safeName(store.name);
    let filename = `${base}.json`;
    for (let suffix = 1; filenames.has(filename.toLowerCase()); suffix++) {
      filename = `${base}--${storeId}-${suffix}.json`;
    }
    filenames.add(filename.toLowerCase());
    const file = join(directory, filename);
    const temp = `${file}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(store.records, null, 2));
    await rename(temp, file);
    store.filename = filename;
    store.output_file = file;
    store.status = signal.aborted ? 'cancelled' : !store.records.some(record => record.url) ? 'failed' : store.records.some(record => record.error) ? 'partial' : 'completed';
    await onProgress();
  }
}
