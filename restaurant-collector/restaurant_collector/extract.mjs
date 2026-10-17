// Runs inside a browser document; deliberately has no external dependencies.
export function extractDocument(platform) {
  const text = el => el?.innerText?.replace(/\s+/g,' ').trim() || '';
  const nodes = [];
  function visit(value) {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== 'object') return;
    const types = [value['@type']].flat();
    if (types.some(t => ['Restaurant','FoodEstablishment','LocalBusiness'].includes(t))) nodes.push(value);
    if (value['@graph']) visit(value['@graph']);
    if (value.mainEntity) visit(value.mainEntity);
  }
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try { visit(JSON.parse(script.textContent)); } catch { /* A malformed script is not evidence. */ }
  }
  const h1 = text(document.querySelector('h1'));
  const matching = nodes.filter(n => String(n.name || '').toLowerCase() === h1.toLowerCase());
  // Never take an arbitrary restaurant entity from a list of branches.
  const node = matching.length === 1 ? matching[0] : nodes.length === 1 ? nodes[0] : {};
  const address = typeof node.address === 'string' ? node.address : node.address ?
    ['streetAddress','addressLocality','addressRegion','postalCode'].map(k => node.address[k]).filter(Boolean).join(', ') : '';
  function from(selector, attr) {
    const el = document.querySelector(selector);
    return attr ? el?.getAttribute(attr) || '' : text(el);
  }
  let name = h1 || node.name || '';
  let fullAddress = address;
  let phone = node.telephone || '';
  let website = '';
  let description = node.description || '';
  let descriptionKind = description ? 'structured_page_description' : null;
  const visible = el => !!el && (el.getClientRects().length > 0) && getComputedStyle(el).visibility !== 'hidden';
  const selectedTabs=[...document.querySelectorAll('[role="tab"][aria-selected="true"]')].filter(visible).map(el=>el.getAttribute('aria-label')||text(el));
  const categoryNames=[...document.querySelectorAll('[role="tab"],button[aria-pressed="true"],[role="button"][aria-pressed="true"]')].filter(visible)
    .map(el=>el.getAttribute('aria-label')||text(el)).filter(s=>s && s.length<100);
  const primary=/^(overview|menu|about|reviews|photos|updates|概览|菜单|简介|关于|评价|评论|照片)(?:\s+(of|for)\b.*)?$/i;
  const selectedCategories=selectedTabs.filter(s=>!primary.test(s));
  const menuCategory=selectedCategories.at(-1)||(selectedTabs.length>1 && /^(overview|概览)$/i.test(selectedTabs.at(-1))?selectedTabs.at(-1):'');
  const main=[...document.querySelectorAll('[role="tabpanel"],[role="main"]')].filter(visible).find(el=>el.getAttribute('role')==='tabpanel') || [...document.querySelectorAll('[role="main"]')].find(visible);
  const paneText=main?.innerText?.trim()||'';
  const menuCards=[...document.querySelectorAll('[data-testid="menu-item"],[data-item-id^="menu:"],[role="listitem"]')].filter(visible)
    .map(el=>el.innerText?.trim()||'').filter(s=>/\$\s*\d/.test(s));
  if (platform === 'google_maps') {
    fullAddress ||= from('[data-item-id="address"]','aria-label').replace(/^(Address|地址)[:：]\s*/i,'');
    phone ||= from('[data-item-id^="phone:tel:"]','aria-label').replace(/^(Phone|电话)[:：]\s*/i,'');
    website = from('a[data-item-id="authority"]','href');
    const summary = from('.PYvSYb') || from('[data-testid="editorial-summary"]');
    if (!description && summary) { description = summary; descriptionKind = 'platform_summary'; }
    const ownerDescription = [...document.querySelectorAll('[data-testid="business-description"], .WeS02d .PYvSYb, [aria-label="From the business"]')]
      .find(visible);
    if (ownerDescription && text(ownerDescription)) {
      description = text(ownerDescription); descriptionKind = 'business_description';
    }
  } else {
    fullAddress ||= from('address');
    phone ||= from('a[href^="tel:"]','href').replace(/^tel:/,'');
    const site = [...document.querySelectorAll('a[href]')].find(a => a.href.includes('/biz_redir?'));
    if (site) { try { website = new URL(site.href).searchParams.get('url') || ''; } catch {} }
    const heading = [...document.querySelectorAll('h2,h3')].find(h => /^About the Business$/i.test(text(h)));
    const section = heading?.closest('section');
    const paras = section ? [...section.querySelectorAll('p')].map(text).filter(Boolean) : [];
    if (paras.length) { description = paras.join('\n'); descriptionKind = 'about_the_business'; }
  }
  // Only explicitly named "Popular dishes" / "Signature dishes" sections qualify.
  // Categories, reviews, image OCR and ordinary menu items are never promoted to specialties.
  const dishHeading = [...document.querySelectorAll('h2,h3')].find(h => /^(Popular dishes|Signature dishes|特色菜|招牌菜)$/i.test(text(h)));
  const dishSection = dishHeading?.closest('section') || dishHeading?.parentElement;
  const dishes = dishSection ? [...new Set([...dishSection.querySelectorAll('h3,h4,[data-testid="dish-name"]')]
    .filter(e => e !== dishHeading && visible(e)).map(text).filter(s => s && s.length < 120))].slice(0,20) : [];
  return {
    name, address:fullAddress, phone, website, description, descriptionKind, dishes,
    selectedTabs,menuCategory,menuCategories:[...new Set(categoryNames)],
    menuText:(menuCards.length?menuCards.join('\n'):paneText).slice(0,40000),aboutText:paneText.slice(0,40000),
    coverageNotes:/You're seeing a limited view of Google Maps/i.test(text(document.body)) ?
      ['Google Maps 返回有限视图，简介与特色菜等栏目可能未展示。'] : [],
    evidence:{name:h1 ? 'h1' : 'JSON-LD.name',address:address ? 'JSON-LD.address' : 'visible_address',
      phone:node.telephone ? 'JSON-LD.telephone' : 'visible_phone',description:descriptionKind,
      specialties:dishes.length ? text(dishHeading) : null},
  };
}
