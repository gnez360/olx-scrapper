const express = require('express');
const puppeteerExtra = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const puppeteer = require('puppeteer'); 
const dayjs = require('dayjs');
const customParse = require('dayjs/plugin/customParseFormat');

dayjs.extend(customParse);

// Habilita stealth
puppeteerExtra.use(StealthPlugin());

const app = express();
app.use(express.json());

// Configurações
const DEFAULT_LIMIT = 20;
const VIEWPORT = { width: 1280, height: 800 };

// Lista de user agents realistas (rotação evita bloqueios)
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17 Safari/605.1.15'
];

function getRandomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// Conversão de datas PT-BR
function parsePortugueseRelativeDate(text) {
  if (!text) return null;
  const t = text.trim().toLowerCase();

  if (t.includes('hoje')) return dayjs().startOf('day');
  if (t.includes('ontem')) return dayjs().subtract(1, 'day').startOf('day');

  const mDays = t.match(/(\d+)\s*dias?/);
  if (mDays) return dayjs().subtract(parseInt(mDays[1], 10), 'day').startOf('day');

  const mHours = t.match(/(\d+)\s*hora/);
  if (mHours) return dayjs().subtract(parseInt(mHours[1], 10), 'hour');

  const mDate = t.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
  if (mDate) {
    const parsed = dayjs(mDate[1], ['DD/MM/YYYY','D/M/YYYY','DD/MM/YY','D/M/YY'], true);
    return parsed.isValid() ? parsed.startOf('day') : null;
  }

  return null;
}

// ---------- FUNÇÃO PRINCIPAL DE SCRAPING ---------- //
async function extractListingsFromPage(page) {
  return await page.evaluate(() => {
    const results = [];
    const seen = new Set();
    
    const cards = document.querySelectorAll('.olx-adcard, [data-lurker_list_id], [data-lurker_dimension_listing_id]');
    
    cards.forEach((card) => {
      try {
        let link = null;
        let title = null;

        // Acha título
        const titleEl = card.querySelector('.olx-adcard__title, h2');
        if (titleEl) {
          const a = titleEl.closest('a');
          if (a) {
            link = a.href;
            title = titleEl.textContent.trim();
          }
        }

        if (!link || !title || seen.has(link)) return;
        seen.add(link);

        // Preço
        const priceEl = card.querySelector('.olx-adcard__price');
        const price = priceEl ? priceEl.textContent.trim() : 'Preço não informado';

        // Localização
        const locEl = card.querySelector('.olx-adcard__location');
        const location = locEl ? locEl.textContent.trim() : 'Localização não informada';

        // Data
        let dateText = null;
        const dateEl = card.querySelector('[class*="date"], time');
        if (dateEl) {
          dateText = dateEl.textContent.trim();
        }

        // Imagem
        const imgEl = card.querySelector('img[src]');
        const image = imgEl && !imgEl.src.includes('data:image') ? imgEl.src : null;

        results.push({ title, price, link, location, date_text: dateText, image });
      } catch (err) {}
    });

    return results;
  });
}

async function runScraper(url, maxItems, dateFromObj) {
  const browser = await puppeteerExtra.launch({
    headless: true,
    executablePath: puppeteer.executablePath(),
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage'
    ]
  });

  try {
    const page = await browser.newPage();

    await page.setViewport(VIEWPORT);
    await page.setUserAgent(getRandomUA());

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    // Scroll leve
    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 1.2));
      await page.waitForTimeout(1200);
    }

    const items = await extractListingsFromPage(page);

    // Normalização
    const normalized = items.map((it, index) => {
      const parsedDate = it.date_text ? parsePortugueseRelativeDate(it.date_text) : null;

      let priceNum = null;
      const match = it.price.match(/(\d{1,3}(?:\.\d{3})*(?:,\d+)?)/);
      if (match) priceNum = parseFloat(match[1].replace(/\./g, '').replace(',', '.'));

      return {
        id: index + 1,
        title: it.title,
        price_text: it.price,
        price: priceNum || null,
        link: it.link,
        location: it.location,
        image: it.image,
        date_text: it.date_text,
        date_parsed: parsedDate ? parsedDate.format('YYYY-MM-DD') : null,
        scraped_at: dayjs().format('YYYY-MM-DD HH:mm:ss')
      };
    });

    // Filtragem por data
    let filtered = normalized;
    if (dateFromObj) {
      filtered = filtered.filter(x => {
        if (!x.date_parsed) return true;
        return dayjs(x.date_parsed).isSameOrAfter(dateFromObj, 'day');
      });
    }

    // Remover duplicados por link
    const seen = new Set();
    const final = [];

    for (const item of filtered) {
      if (!seen.has(item.link)) {
        seen.add(item.link);
        final.push(item);
      }
    }

    return final.slice(0, maxItems);

  } finally {
    await browser.close();
  }
}

app.get('/scrape', async (req, res) => {
  const { url, date_from, limit } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Parâmetro url é obrigatório' });
  }

  const maxItems = Math.max(1, Math.min(300, parseInt(limit || DEFAULT_LIMIT, 10)));

  let dateFromObj = null;
  if (date_from) {
    dateFromObj = dayjs(date_from, ['YYYY-MM-DD', 'DD/MM/YYYY'], true);
    if (!dateFromObj.isValid()) dateFromObj = null;
  }

  try {
    const items = await runScraper(url, maxItems, dateFromObj);

    res.json({
      success: true,
      fetched: items.length,
      items
    });

  } catch (err) {
    console.error('Erro no scraping:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---------- SCRAPER OLX CUSTOM ---------- //
app.get('/scrape-olx', async (req, res) => {
  const { q, state = 'mg', category, limit = 20 } = req.query;

  if (!q) {
    return res.status(400).json({
      error: 'Parâmetro "q" é obrigatório'
    });
  }

  let url = `https://www.olx.com.br`;

  if (state !== 'all') url += `/estado-${state}`;
  if (category) url += `/${category}`;

  url += `?q=${encodeURIComponent(q)}&sf=1`;

  req.query.url = url;
  req.query.limit = limit;

  return await app._router.handle(req, res);
});

// ---------- HEALTH CHECK SUPER LEVE ---------- //
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'OLX Scraper API',
    timestamp: dayjs().toISOString()
  });
});

// ---------- ROOT ---------- //
app.get('/', (req, res) => {
  res.json({
    service: 'OLX Scraper API - otimizado',
    endpoints: ['/scrape', '/scrape-olx', '/health']
  });
});

// ---------- START ---------- //
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em ${PORT}`);
});
