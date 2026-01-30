// ---------- Configuration ----------
// Default config pre-wired for Shaun's Eggs across Canadian stores (CAD)
const DEFAULT_CONFIG = {
  currency: "CAD",
  items: [
    {
      id: "eggs",
      name: "Large Grade A Eggs (12 ct)",
      offers: [
        {
          store: "No Frills",
          url: "https://www.nofrills.ca/en/large-grade-a-eggs/p/20812144001_EA",
          selector: "meta[property='product:price:amount']"
        },
        {
          store: "Walmart",
          url: "https://www.walmart.ca/en/ip/Great-Value-Large-Eggs/10052944?classType=REGULAR&athbdg=L1200&from=/search",
          selector: "meta[property='og:price:amount']"
        },
        {
          store: "Independent",
          url: "https://www.yourindependentgrocer.ca/en/large-grade-a-eggs/p/20812144001_EA",
          selector: "meta[property='product:price:amount']"
        },
        {
          store: "Co-op (Leduc)",
          url: "https://www.shop.crs/leduc#/product/134084",
          selector: "[class*='price'], [id*='price']"
        }
      ]
    }
  ]
};

// Note: For meta tags, just use a normal selector like 'meta[property="product:price:amount"]'.
// We'll handle the ::content attribute internally if the node is a <meta>.

const itemsContainer = document.getElementById('itemsContainer');
const refreshAllBtn = document.getElementById('refreshAll');
const lastUpdatedEl = document.getElementById('lastUpdated');
const configInput = document.getElementById('configInput');
const applyConfigBtn = document.getElementById('applyConfig');

let APP_CONFIG = structuredClone(DEFAULT_CONFIG);

// Populate config JSON textarea
configInput.value = JSON.stringify(APP_CONFIG, null, 2);

applyConfigBtn.addEventListener('click', () => {
  try {
    const obj = JSON.parse(configInput.value);
    if (!obj || !Array.isArray(obj.items)) throw new Error("Missing 'items' array");
    APP_CONFIG = obj;
    renderAll();
  } catch (e) {
    alert('Invalid JSON: ' + e.message);
  }
});

refreshAllBtn.addEventListener('click', () => {
  renderAll(true);
});

function renderAll(force = false) {
  itemsContainer.innerHTML = '';
  const fragment = document.createDocumentFragment();

  APP_CONFIG.items.forEach(item => {
    const section = document.createElement('section');
    section.className = 'item';
    section.id = `item-${item.id}`;

    const h2 = document.createElement('h2');
    h2.textContent = item.name;
    section.appendChild(h2);

    const grid = document.createElement('div');
    grid.className = 'store-grid';
    section.appendChild(grid);

    fragment.appendChild(section);

    if (Array.isArray(item.offers)) {
      item.offers.forEach((offer) => {
        const card = createStoreCard(offer);
        grid.appendChild(card);
        fetchPrice(offer, card, { force }).catch(() => {});
      });
    }
  });

  itemsContainer.appendChild(fragment);
  lastUpdatedEl.textContent = `Last updated: ${new Date().toLocaleString()}`;
}

function createStoreCard(offer) {
  const card = document.createElement('div');
  card.className = 'store-card';
  card.dataset.store = offer.store;

  const header = document.createElement('div');
  header.className = 'store-header';

  const name = document.createElement('div');
  name.className = 'store-name';
  name.textContent = offer.store;

  const link = document.createElement('a');
  link.href = offer.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'Open';

  header.appendChild(name);
  header.appendChild(link);

  const status = document.createElement('div');
  status.className = 'status';
  status.textContent = 'Fetching…';

  const priceEl = document.createElement('div');
  priceEl.className = 'price';
  priceEl.textContent = '—';

  card.appendChild(header);
  card.appendChild(status);
  card.appendChild(priceEl);

  return card;
}

async function fetchPrice(offer, card, { force = false } = {}) {
  const statusEl = card.querySelector('.status');
  const priceEl = card.querySelector('.price');

  const parseAndRender = (html, sourceLabel) => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const { amount, currency, source } = extractPrice(doc, offer.selector);
    if (amount == null) return null;
    priceEl.textContent = formatCurrency(amount, currency || APP_CONFIG.currency);
    statusEl.textContent = source ? `${sourceLabel} via ${source}` : sourceLabel;
    card.dataset.amount = amount;
    card.dataset.currency = currency || APP_CONFIG.currency;
    card.classList.remove('best');
    priceEl.classList.remove('error');
    recalcBestForItem(card.closest('.item'));
    return { amount, currency };
  };

  try {
    statusEl.textContent = 'Fetching…';
    priceEl.textContent = '—';
    priceEl.classList.remove('error');
    card.classList.remove('best');

    // 1) Try fast static proxy
    const res1 = await fetch(`/api/fetch?url=${encodeURIComponent(offer.url)}${force ? `&t=${Date.now()}` : ''}`);
    const data1 = await res1.json();
    if (data1.ok) {
      const parsed = parseAndRender(data1.html, 'Detected (static)');
      if (parsed) return;
    }

    // 2) Fallback to Puppeteer render
    statusEl.textContent = 'Rendering page…';
    const params = new URLSearchParams({ url: offer.url, ...(offer.selector ? { selector: offer.selector } : {}) });
    const res2 = await fetch(`/api/render?${params.toString()}`);
    const data2 = await res2.json();
    if (data2.ok) {
      const parsed2 = parseAndRender(data2.html, 'Detected (rendered)');
      if (parsed2) return;
    }

    throw new Error((data2 && data2.error) || (data1 && data1.error) || 'Price not found');
  } catch (e) {
    statusEl.textContent = e.message || 'Failed';
    priceEl.textContent = 'Error';
    priceEl.classList.add('error');
    card.dataset.amount = '';
    card.dataset.currency = '';
    recalcBestForItem(card.closest('.item'));
  }
}

function recalcBestForItem(itemEl) {
  if (!itemEl) return;
  const cards = [...itemEl.querySelectorAll('.store-card')];
  cards.forEach(c => c.classList.remove('best'));

  const priced = cards
    .map(c => ({ el: c, amt: parseFloat(c.dataset.amount) }))
    .filter(x => Number.isFinite(x.amt));

  if (!priced.length) return;

  priced.sort((a, b) => a.amt - b.amt);
  priced[0].el.classList.add('best');
}

// ---------- Extraction helpers ----------

function extractPrice(doc, customSelector) {
  if (customSelector) {
    const { node, value } = selectValue(doc, customSelector);
    const parsed = parsePrice(value);
    if (parsed != null) return { amount: parsed, currency: detectCurrency(value, doc), source: 'custom selector' };
  }

  const ld = extractJSONLDProductPrice(doc);
  if (ld?.amount != null) {
    return { amount: ld.amount, currency: ld.currency, source: 'JSON-LD' };
  }

  const metaAmount =
    getMetaContent(doc, 'product:price:amount') ||
    getMetaContent(doc, 'og:price:amount') ||
    attrOf(doc.querySelector('meta[itemprop="price"]'), 'content') ||
    textOf(doc.querySelector('[itemprop="price"]'));

  const parsedMeta = parsePrice(metaAmount);
  if (parsedMeta != null) {
    const metaCurrency =
      getMetaContent(doc, 'product:price:currency') ||
      getMetaContent(doc, 'og:price:currency') ||
      attrOf(doc.querySelector('meta[itemprop="priceCurrency"]'), 'content') ||
      attrOf(doc.querySelector('[itemprop="priceCurrency"]'), 'content') ||
      textOf(doc.querySelector('[itemprop="priceCurrency"]'));
    return { amount: parsedMeta, currency: detectCurrency(metaAmount, doc) || normalizeCurrencyCode(metaCurrency), source: 'meta tags' };
  }

  const fallback = findPriceLikeText(doc);
  if (fallback?.amount != null) {
    return { amount: fallback.amount, currency: fallback.currency || detectCurrency(fallback.raw, doc), source: 'fallback text scan' };
  }

  return { amount: null, currency: null, source: null };
}

function selectValue(doc, selector) {
  let wantsContent = false;
  let sel = selector.trim();
  if (sel.endsWith('::content')) {
    wantsContent = true;
    sel = sel.replace(/::content$/, '');
  }
  const node = doc.querySelector(sel);
  if (!node) return { node: null, value: '' };
  const value = wantsContent || node.tagName === 'META'
    ? node.getAttribute('content') || ''
    : node.textContent || '';
  return { node, value: value.trim() };
}

function extractJSONLDProductPrice(doc) {
  const scripts = [...doc.querySelectorAll('script[type="application/ld+json"]')];
  for (const s of scripts) {
    let jsonText = s.textContent || '';
    if (!jsonText.trim()) continue;
    try {
      const data = JSON.parse(jsonText);
      const nodes = Array.isArray(data) ? data : [data];
      for (const node of nodes) {
        if (isOfType(node, 'Product')) {
          const offers = Array.isArray(node.offers) ? node.offers : node.offers ? [node.offers] : [];
          for (const off of offers) {
            let price = off?.price ?? off?.priceSpecification?.price ?? off?.lowPrice;
            let currency = off?.priceCurrency ?? off?.priceSpecification?.priceCurrency ?? off?.priceCurrency;
            const amount = parsePrice(price);
            if (amount != null) {
              return { amount, currency: normalizeCurrencyCode(currency) };
            }
          }
        }
      }
    } catch {}
  }
  return null;
}

function isOfType(obj, typeName) {
  const t = obj?.['@type'];
  if (!t) return false;
  return Array.isArray(t) ? t.includes(typeName) : t === typeName;
}

function getMetaContent(doc, propertyName) {
  const node = doc.querySelector(`meta[property="${propertyName}"]`);
  return node ? node.getAttribute('content') || '' : '';
}

function attrOf(node, attr) { return node ? node.getAttribute(attr) || '' : ''; }
function textOf(node) { return node ? node.textContent?.trim() || '' : ''; }

function findPriceLikeText(doc) {
  const containers = [
    '[class*="price"]',
    '[id*="price"]',
    '[data-price]',
    'div, span, p'
  ];
  const priceRegex = /(?:\$|€|£|¥|₹)\s*\d{1,3}(?:[.,\s]?\d{3})*(?:[.,]\d{2})?|\b\d+(?:[.,]\d{2})\s*(?:USD|CAD|EUR|GBP|JPY|INR)\b/i;

  for (const sel of containers) {
    const nodes = [...doc.querySelectorAll(sel)];
    for (const n of nodes) {
      const txt = (n.textContent || '').trim();
      if (!txt) continue;
      const m = txt.match(priceRegex);
      if (m) {
        const raw = m[0];
        const amount = parsePrice(raw);
        const currency = detectCurrency(raw, doc);
        if (amount != null) return { amount, currency, raw };
      }
    }
  }
  return null;
}

function parsePrice(input) {
  if (input == null) return null;
  const s = String(input).trim();
  if (!s) return null;

  const cleaned = s
    .replace(/[^\d.,-]/g, '')
    .replace(/\s+/g, '');

  if (!cleaned) return null;

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let normalized = cleaned;

  if (lastComma !== -1 && lastDot !== -1) {
    const last = Math.max(lastComma, lastDot);
    normalized = cleaned.slice(0, last).replace(/[.,]/g, '') + '.' + cleaned.slice(last + 1).replace(/[.,]/g, '');
  } else if (lastComma !== -1 && lastDot === -1) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else {
    normalized = cleaned.replace(/,/g, '');
  }

  const val = parseFloat(normalized);
  return Number.isFinite(val) ? val : null;
}

function detectCurrency(text, doc) {
  // Domain-based hints (helps distinguish $ as CAD on Canadian sites)
  try {
    const base = doc.querySelector('base')?.href || '';
    const canonical = doc.querySelector('link[rel="canonical"]')?.href || '';
    const any = canonical || base;
    const url = new URL(any || 'http://localhost');
    const host = url.hostname || '';
    const rules = [
      { test: /(?:nofrills|yourindependentgrocer|loblaws|provigo|realcanadiansuperstore)\./i, currency: 'CAD' },
      { test: /(?:walmart)\.ca$/i, currency: 'CAD' },
      { test: /(?:shop\.crs|coop|co-op)/i, currency: 'CAD' }
    ];
    for (const r of rules) { if (r.test.test(host)) return r.currency; }
  } catch {}

  if (text) {
    if (/€/.test(text)) return 'EUR';
    if (/£/.test(text)) return 'GBP';
    if (/¥/.test(text)) return 'JPY';
    if (/₹/.test(text)) return 'INR';
    if (/\$/.test(text)) return APP_CONFIG?.currency || 'USD';
  }

  const metaCurr =
    getMetaContent(doc, 'product:price:currency') ||
    getMetaContent(doc, 'og:price:currency') ||
    attrOf(doc.querySelector('meta[itemprop="priceCurrency"]'), 'content') ||
    attrOf(doc.querySelector('[itemprop="priceCurrency"]'), 'content') ||
    textOf(doc.querySelector('[itemprop="priceCurrency"]'));

  return normalizeCurrencyCode(metaCurr) || (APP_CONFIG?.currency || null);
}

function normalizeCurrencyCode(code) {
  if (!code) return null;
  const c = String(code).trim().toUpperCase();
  const list = ['USD','EUR','GBP','JPY','CAD','AUD','INR','CHF','SEK','NOK','DKK','NZD','CNY','MXN','BRL','ZAR'];
  return list.includes(c) ? c : null;
}

function formatCurrency(amount, currency = 'USD') {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

// Kick things off
renderAll();
