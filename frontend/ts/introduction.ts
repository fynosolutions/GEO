import { ensureAuthenticated } from './auth.js';

type IntroductionRecord = {
  platform: string;
  categories: string[] | null;
  description: string | null;
  attributes: string[] | null;
  highlights: string[] | null;
  photo_count: number | null;
  url: string | null;
  fetched_at: string;
  error: string | null;
};
type Store = { id: string; name: string; status: string; filename?: string; records: IntroductionRecord[] };
type Job = { status: string; error: string | null; input: { stores: unknown[] }; introduction?: { stores: Store[] } };
const platformNames: Record<string, string> = { google_maps: 'Google Maps', yelp: 'Yelp', tripadvisor: 'Tripadvisor' };
const id = new URLSearchParams(location.search).get('id') || '';
const endpoint = `/api/audits/${encodeURIComponent(id)}`;
const status = document.querySelector<HTMLParagraphElement>('#introduction-status')!;
const stop = document.querySelector<HTMLButtonElement>('#stop-introduction')!;
const results = document.querySelector<HTMLDivElement>('#introduction-results')!;
const active = (state: string) => state === 'running' || state === 'cancelling';

function element(tag: string, text?: string) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderStore(store: Store) {
  const section = element('section');
  section.append(element('h2', store.name));
  if (!store.filename) {
    section.append(element('p', 'Collecting…'));
    return section;
  }
  const download = document.createElement('a');
  download.href = `${endpoint}/stores/${encodeURIComponent(store.id)}.json`;
  download.download = store.filename;
  download.textContent = 'Download JSON';
  section.append(download);
  for (const record of store.records) {
    const panel = document.createElement('details');
    panel.className = 'result-section';
    panel.open = true;
    panel.append(element('summary', platformNames[record.platform] || record.platform));
    const body = element('div');
    body.className = 'result-section-body';
    const fields = element('dl');
    const entries = [
      ['Categories', record.categories], ['Description', record.description], ['Attributes', record.attributes],
      ['Highlights', record.highlights], ['Photos', record.photo_count], ['Fetched at', record.fetched_at],
    ] as const;
    for (const [label, value] of entries) {
      const details = element('dd');
      if (Array.isArray(value)) {
        const list = element('ul');
        for (const entry of value) list.append(element('li', entry));
        details.append(list);
      } else details.textContent = String(value ?? 'Unavailable');
      fields.append(element('dt', label), details);
    }
    if (record.url && /^https?:\/\//i.test(record.url)) {
      const source = document.createElement('a');
      source.href = record.url;
      source.textContent = 'Open source';
      body.append(source);
    }
    if (record.error) body.append(element('p', record.error));
    body.append(fields);
    panel.append(body);
    section.append(panel);
  }
  return section;
}

let previous = '';
async function refresh() {
  const response = await fetch(endpoint, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw Error('Could not load this introduction collection.');
  const job = await response.json() as Job;
  if (!job.introduction) throw Error('Introduction collection not found.');
  const stores = job.introduction.stores;
  status.textContent = `${job.status[0].toUpperCase() + job.status.slice(1)} · ${stores.filter(store => store.filename).length} of ${job.input.stores.length} restaurants processed.${job.error ? ' ' + job.error : ''}`;
  stop.hidden = !active(job.status);
  stop.disabled = job.status === 'cancelling';
  const snapshot = JSON.stringify(stores);
  if (snapshot !== previous) {
    results.replaceChildren(...stores.map(renderStore));
    previous = snapshot;
  }
  if (active(job.status)) window.setTimeout(() => void refresh().catch(showError), 1500);
}

function showError(error: unknown) {
  status.textContent = error instanceof Error ? error.message : 'Could not connect to the server.';
}

stop.addEventListener('click', async () => {
  stop.disabled = true;
  try {
    const response = await fetch(`${endpoint}/cancel`, { method: 'POST', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw Error('Could not stop collection.');
  } catch (error) {
    stop.disabled = false;
    showError(error);
  }
});

if (!/^[a-f0-9-]{36}$/.test(id)) status.textContent = 'Missing introduction collection ID.';
else void ensureAuthenticated().then(refresh).catch(showError);
