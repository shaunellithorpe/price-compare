# Price Compare (HTML + JavaScript + Node)

Compare item prices across multiple store pages and highlight the lowest price per item.

This project contains **two server modes**:

- **Lite** (`server.js`): fast HTML fetch proxy (no JS execution). Good for sites that render prices on the server.
- **Puppeteer** (`server-puppeteer.js`): headless Chromium rendering for SPA/client-rendered prices, plus the lite `/api/fetch` endpoint. The frontend will try the lite proxy first, then **fallback** to the rendered endpoint automatically.

## Getting Started

```bash
npm install
# For SPA-heavy sites (recommended)
npm start
# For simple/static sites only
npm run start:lite
```

Then open: `http://localhost:3000/`

## Configure Your Items

In the app UI, open **“Configure items and selectors”**, paste/edit the JSON, and click **Apply Config**.

This repo ships with a default **CAD** config for a single item (Large Grade A Eggs) across Canadian stores (No Frills, Walmart, Independent, Co‑op/Leduc). Each offer can include an optional `selector` to speed up/guide price extraction.

Example entry:

```json
{
  "store": "No Frills",
  "url": "https://www.nofrills.ca/en/large-grade-a-eggs/p/20812144001_EA",
  "selector": "meta[property='product:price:amount']"
}
```

### Notes
- If a price isn’t detected, provide a more precise selector (inspect the element in DevTools).
- The frontend compares numeric amounts **as-is**. If you mix currencies within one item, add a conversion step first.
- Respect each site’s **Terms of Service**. Prefer official APIs where available.

## How It Works

- **Frontend** fetches HTML via `/api/fetch`. If price extraction fails, it falls back to `/api/render` (Puppeteer) for fully rendered HTML.
- **Extraction Pipeline** (in `public/app.js`):
  1. Custom `selector` (if provided)
  2. `application/ld+json` (schema.org Product → offers → price)
  3. Common meta tags (`product:price:amount`, `og:price:amount`, `itemprop="price"`)
  4. Heuristic scan for price-like text
- The **lowest price** card is highlighted automatically per item.

## Deploying

- Node 18+ is required.
- Puppeteer downloads Chromium on install. In minimal environments, prefer Debian-based images (e.g., `node:18-bullseye`).
- Consider adding caching and rate-limiting for production stability.

## Scripts

- `npm start` → `server-puppeteer.js` (includes `/api/fetch` and `/api/render`)
- `npm run start:lite` → `server.js` (only `/api/fetch`)
