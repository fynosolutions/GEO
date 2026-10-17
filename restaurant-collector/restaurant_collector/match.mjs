export function normalize(value = '') {
  return value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\b(street|avenue|road|boulevard|suite)\b/g, x => ({street:'st',avenue:'ave',road:'rd',boulevard:'blvd',suite:'ste'})[x])
    .replace(/\b(united states|usa)\b/g, '').replace(/\s+/g, ' ').trim();
}
export function similarity(a, b) {
  a = normalize(a); b = normalize(b);
  if (!a || !b) return 0;
  let row = Array.from({length:b.length + 1}, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j-1]+1, row[j]+1, row[j-1]+(a[i-1] === b[j-1] ? 0 : 1));
    row = next;
  }
  return 1 - row[b.length] / Math.max(a.length,b.length);
}
function locationScore(query, address) {
  const q = normalize(query), a = normalize(address);
  if (!q || !a) return 0;
  const tokens = q.split(' ').filter(t => !/^\d+$/.test(t));
  // User locations are often shorter than full postal addresses. Compare each token,
  // while keeping the door number separate so a one-digit typo remains tolerable.
  const actual = a.split(' ');
  // A street typo is tolerable; an explicitly different city/state must not
  // inherit a high score from a same-named street in another region.
  const locality = query.split(',').slice(1).join(' ');
  const localityTokens = normalize(locality).split(' ').filter(t => t && !/^\d+$/.test(t));
  if (localityTokens.some(t => Math.max(...actual.map(x => similarity(t,x))) < .75)) return 0;
  const words = tokens.length ? tokens.reduce((s,t) => s + Math.max(...actual.map(x => similarity(t,x))), 0) / tokens.length : 0;
  const number = q.match(/^\d+[a-z]?\b/)?.[0];
  const other = a.match(/^\d+[a-z]?\b/)?.[0];
  if (!number) return words;
  const house = number === other ? 1 : other && number.length === other.length && similarity(number,other) >= (number.length-1)/number.length ? .7 : 0;
  return .8 * words + .2 * house;
}
export function rankCandidates(name, location, candidates) {
  return candidates.map(c => {
    const input = normalize(name);
    const words = normalize(c.name).split(' ');
    const width = input.split(' ').length;
    // Platform titles often append cuisine tags or a translated name. Compare
    // the user name to contiguous words without discarding location safeguards.
    const windows = input.length >= 4 ? words.map((_,i) => words.slice(i,i+width).join(' ')) : [];
    const nameScore = Math.max(similarity(name,c.name),...windows.map(w => .98 * similarity(input,w)));
    const addressScore = locationScore(location, c.address);
    return {...c, match:{nameScore, addressScore, score:.55*nameScore+.45*addressScore}};
  }).sort((a,b) => b.match.score-a.match.score);
}
export function choose(name, location, candidates) {
  const ranked = rankCandidates(name,location,candidates);
  const top = ranked[0];
  if (!top || top.match.nameScore < .65 || top.match.addressScore < .65 || top.match.score < .78)
    return {status:'not_found', selected:null, candidates:ranked.slice(0,3)};
  if (ranked[1] && top.match.score-ranked[1].match.score < .06)
    return {status:'ambiguous', selected:null, candidates:ranked.slice(0,3)};
  return {status:'matched', selected:top, candidates:[]};
}
export function sameBranch(a,b) {
  const pa = (a.phone || '').replace(/\D/g,'').replace(/^1(?=\d{10}$)/,'');
  const pb = (b.phone || '').replace(/\D/g,'').replace(/^1(?=\d{10}$)/,'');
  const na = normalize(a.address).match(/^\d+[a-z]?\b/)?.[0];
  const nb = normalize(b.address).match(/^\d+[a-z]?\b/)?.[0];
  return similarity(a.name,b.name) >= .7 && !!na && na === nb &&
    (similarity(a.address,b.address) >= .85 || locationScore(a.address,b.address) >= .95) &&
    !(pa && pb && pa !== pb);
}
