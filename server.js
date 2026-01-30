import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Serve static files from /public
app.use(express.static(path.join(__dirname, 'public')));
app.use(cors());

// Simple HTML fetch proxy to avoid browser CORS errors
app.get('/api/fetch', async (req, res) => {
  const url = req.query.url;

  if (!url || !/^https?:\/\//i.test(url)) {
    return res.status(400).json({ ok: false, error: 'Invalid or missing URL' });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout

    // Fetch with a desktop UA + sensible headers
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-CA,en;q=0.9',
        'Cache-Control': 'no-cache'
      }
    });

    clearTimeout(timeout);
    const html = await response.text();

    res.setHeader('Cache-Control', 'no-store'); // avoid stale pages while testing
    return res.json({
      ok: true,
      status: response.status,
      url,
      fetchedAt: new Date().toISOString(),
      html,
      rendered: false
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err?.message || 'Fetch failed'
    });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Price Compare (lite) at http://localhost:${PORT}`);
});
