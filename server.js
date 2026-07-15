const express = require('express');
const axios = require('axios');
const dayjs = require('dayjs');
const customParse = require('dayjs/plugin/customParseFormat');
const isSameOrAfter = require('dayjs/plugin/isSameOrAfter');

dayjs.extend(customParse);
dayjs.extend(isSameOrAfter);

const app = express();
app.use(express.json());

const DEFAULT_LIMIT = 20;

function parsePortugueseRelativeDate(text) {
  if (!text) return null;
  const t = text.trim().toLowerCase();
  try {
    if (t.includes('hoje')) return dayjs().startOf('day');
    if (t.includes('ontem')) return dayjs().subtract(1, 'day').startOf('day');

    const mDays = t.match(/(\d+)\s*dias?/);
    if (mDays) return dayjs().subtract(parseInt(mDays[1], 10), 'day').startOf('day');

    const mHours = t.match(/(\d+)\s*hora/);
    if (mHours) return dayjs().subtract(parseInt(mHours[1], 10), 'hour');

    const mDate = t.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
    if (mDate) {
      const parsed = dayjs(mDate[1], ['DD/MM/YYYY', 'D/M/YYYY', 'DD/MM/YY', 'D/M/YY'], true);
      return parsed.isValid() ? parsed.startOf('day') : null;
    }

    const MONTHS = { 'jan':0,'fev':1,'mar':2,'abr':3,'mai':4,'jun':5,'jul':6,'ago':7,'set':8,'out':9,'nov':10,'dez':11 };
    const mPt = t.match(/(\d{1,2})\s*de\s*(\w+)/);
    if (mPt) {
      const monthIdx = MONTHS[mPt[2].substring(0,3)];
      if (monthIdx !== undefined) {
        const d = parseInt(mPt[1], 10);
        const now = dayjs();
        const year = monthIdx > now.month() ? now.year() - 1 : now.year();
        const parsed = dayjs(new Date(year, monthIdx, d));
        return parsed.isValid() ? parsed.startOf('day') : null;
      }
    }
  } catch (e) {
    console.log(`[WARN] Erro ao parsear data: ${text}`);
  }
  return null;
}

async function fetchViaJina(url) {
  const jinaUrl = `https://r.jina.ai/${encodeURIComponent(url)}`;
  console.log(`[FETCH] ${jinaUrl}`);
  const resp = await axios.get(jinaUrl, {
    timeout: 120000,
    headers: {
      'Accept': 'text/plain, text/markdown, */*',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });
  return resp.data;
}

function parseListingsFromMarkdown(md) {
  const results = [];
  const lines = md.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const headingMatch = lines[i].match(/^##\s+\[([^\]]+)\]\(([^)]+?)(?:\s+"[^"]*")?\)\s*$/);
    if (!headingMatch) continue;

    const title = headingMatch[1].trim();
    let url = headingMatch[2].trim();

    if (!/\d{6,}/.test(url)) continue;

    i++;

    const blockLines = [];
    while (i < lines.length && !lines[i].startsWith('## ')) {
      blockLines.push(lines[i]);
      i++;
    }
    i--;

    const block = blockLines.join('\n').trim();

    if (/publicidade/i.test(block)) continue;

    const blines = block.split('\n').map(l => l.trim()).filter(Boolean);

    let price = null;
    const priceIdx = blines.findIndex(l => /^###\s/.test(l));
    if (priceIdx >= 0) {
      const pm = blines[priceIdx].match(/###\s*(R?\$?\s*[\d\s.,]+)/);
      if (pm) price = pm[1].trim();
    }

    let dateText = null;
    const dateIdx = blines.findIndex(l => /\b(Hoje|Ontem|\d{1,2}\s*de\s*\w+|há\s+\d+)/i.test(l));
    if (dateIdx >= 0) dateText = blines[dateIdx];

    let location = null;
    if (priceIdx >= 0) {
      const start = priceIdx + 1;
      const end = dateIdx >= 0 ? dateIdx : blines.length;
      const locLines = blines.slice(start, end).filter(l => {
        if (/^(publicidade|Chat$|!\[|Adicionar|Ir para|Patrocinado|Destaque|\*$|Slide|Histórico|Reduziu|Aceita|Avaliações|Online|Localiza)/i.test(l)) return false;
        return l.length > 2;
      });
      if (locLines.length > 0) location = locLines[locLines.length - 1];
    }

    let image = null;
    const imgMatch = block.match(/!\[[^\]]*\]\(([^)]+)\)/);
    if (imgMatch) image = imgMatch[1];

    results.push({ title, price, link: url, location, date_text: dateText, image });
  }

  return results;
}

async function runScraper(url, maxItems, dateFrom) {
  console.log(`[1] Fetching via r.jina.ai: ${url}`);
  const markdown = await fetchViaJina(url);
  const kb = (markdown.length / 1024).toFixed(1);
  console.log(`[2] Markdown recebido: ${kb}KB`);

  const rawItems = parseListingsFromMarkdown(markdown);
  console.log(`[3] Itens brutos: ${rawItems.length}`);

  const normalized = [];
  for (let i = 0; i < rawItems.length; i++) {
    const it = rawItems[i];
    try {
      const parsedDate = it.date_text ? parsePortugueseRelativeDate(it.date_text) : null;

      let priceNum = null;
      if (it.price) {
        const match = it.price.match(/([\d\s.,]+)/);
        if (match) priceNum = parseFloat(match[1].replace(/\./g, '').replace(',', '.').replace(/\s/g, ''));
      }

      normalized.push({
        id: i + 1,
        title: it.title,
        price_text: it.price,
        price: priceNum,
        link: it.link,
        location: it.location,
        image: it.image,
        date_text: it.date_text,
        date_parsed: parsedDate ? parsedDate.format('YYYY-MM-DD') : null,
        scraped_at: dayjs().format('YYYY-MM-DD HH:mm:ss')
      });
    } catch (err) {
      console.error(`[ERRO] Falha ao processar item ${i}:`, err.message);
    }
  }

  let filtered = normalized;
  if (dateFrom) {
    filtered = normalized.filter(x => {
      if (!x.date_parsed) return false;
      return dayjs(x.date_parsed).isSameOrAfter(dateFrom, 'day');
    });
  }

  const seen = new Set();
  const final = [];
  for (const item of filtered) {
    if (!seen.has(item.link)) {
      seen.add(item.link);
      final.push(item);
    }
  }

  console.log(`[4] Final: ${final.length} itens`);
  return final.slice(0, maxItems);
}

app.get('/scrape', async (req, res) => {
  req.setTimeout(180000);
  console.log(`\n--- /scrape ---`);

  const { url, date_from, limit } = req.query;
  if (!url) return res.status(400).json({ error: 'URL obrigatória' });

  const maxItems = parseInt(limit || DEFAULT_LIMIT);
  let dateFromObj = null;
  if (date_from) {
    dateFromObj = dayjs(date_from, ['YYYY-MM-DD', 'DD/MM/YYYY'], true);
  }

  try {
    const items = await runScraper(url, maxItems, dateFromObj);
    res.json({ success: true, count: items.length, items });
  } catch (err) {
    console.error('[ERRO API]', err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => res.json({ status: 'API Online (r.jina.ai)' }));
app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API rodando na porta ${PORT} (via r.jina.ai)`);
});
