import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.use(cors());

let browser;
async function getBrowser() {
  if (browser && browser.process() !== null) return browser;
  browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-zygote'
    ]
  });
  return browser;
}

// Existing static HTML proxy (kept for fast sites)
app.get('/api/fetch', async (req, res) => {
  const url = req.query.url;
  if (!url || !/^https?:\/\//i.test(url)) {
    return res.status(400).json({ ok: false, error: 'Invalid or missing URL' });
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-CA,en;q=0.9'
      },
      redirect: 'follow',
      signal: controller.signal
    });
    clearTimeout(timeout);
    const html = await response.text();
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ ok: true, status: response.status, url, html, fetchedAt: new Date().toISOString(), rendered: false });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'Fetch failed' });
  }
});

// New Puppeteer endpoint for rendered pages
app.get('/api/render', async (req, res) => {
  const url = req.query.url;
  const waitSelector = req.query.selector || '';
  const waitMs = Math.min(parseInt(req.query.waitMs || '8000', 10), 20000);
  const userAgent =
    req.query.ua ||
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

  if (!url || !/^https?:\/\//i.test(url)) {
    return res.status(400).json({ ok: false, error: 'Invalid or missing URL' });
  }

  let page;
  try {
    const br = await getBrowser();
    page = await br.newPage();

    await page.setRequestInterception(true);
    page.on('request', (reqInt) => {
      const type = reqInt.resourceType();
      const blocked = ['image', 'media', 'font'];
      if (blocked.includes(type)) return reqInt.abort();
      reqInt.continue();
    });

    await page.setUserAgent(userAgent);
    await page.setViewport({ width: 1280, height: 1024, deviceScaleFactor: 1 });

    page.setDefaultNavigationTimeout(15000);
    page.setDefaultTimeout(15000);

    const resp = await page.goto(url, { waitUntil: ['domcontentloaded', 'networkidle2'] });

    const selToWait =
      waitSelector ||
      [
        'meta[property="product:price:amount"]',
        'meta[property="og:price:amount"]',
        '[itemprop="price"]',
        '[class*="price"]',
        '[id*="price"]',
        '[data-price]'
      ].join(',');

    try {
      await page.waitForSelector(selToWait, { timeout: waitMs });
    } catch {}

    const html = await page.content();

    res.setHeader('Cache-Control', 'no-store');
    return res.json({
      ok: true,
      status: resp?.status() ?? 200,
      url,
      fetchedAt: new Date().toISOString(),
      rendered: true,
      html
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'Render failed' });
  } finally {
    if (page) {
      try { await page.close(); } catch {}
    }
  }
});

async function closeBrowser() {
  if (browser) {
    try { await browser.close(); } catch {}
    browser = null;
  }
}
process.on('SIGINT', async () => { await closeBrowser(); process.exit(0); });
process.on('SIGTERM', async () => { await closeBrowser(); process.exit(0); });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server with Puppeteer at http://localhost:${PORT}`);
});
