// server.js - VERSÃO CORRIGIDA
const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const dayjs = require('dayjs');
const customParse = require('dayjs/plugin/customParseFormat');

// Configurações de stealth para evitar bloqueios
puppeteer.use(StealthPlugin());
dayjs.extend(customParse);

const app = express();
app.use(express.json());

const DEFAULT_LIMIT = 20;
const VIEWPORT = { width: 1280, height: 800 };

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
    if (parsed.isValid()) return parsed.startOf('day');
  }

  return null;
}

async function extractListingsFromPage(page) {
  console.log('🔍 Iniciando extração de anúncios...');
  
  const items = await page.evaluate(() => {
    const results = [];
    const seen = new Set();

    console.log('🎯 Procurando anúncios...');

    // ESTRATÉGIA 1: Buscar por estrutura específica do OLX
    const listingCards = document.querySelectorAll('[data-lurker_list_id], [data-lurker_dimension_listing_id], .sc-12rk7z2-0, .sc-1fcmfeb-0, .sc-1fcmfeb-1');
    
    console.log(`📦 Encontrados ${listingCards.length} cards potenciais`);

    listingCards.forEach((card, index) => {
      try {
        // Encontrar link do anúncio
        let link = null;
        const linkSelectors = [
          'a[href*="/item/"]',
          'a[href*="/d/"]', 
          'a[href*="/anuncio/"]',
          'a'
        ];

        for (const selector of linkSelectors) {
          const linkEl = card.querySelector(selector);
          if (linkEl && linkEl.href && (linkEl.href.includes('/item/') || linkEl.href.includes('/d/'))) {
            link = linkEl.href;
            break;
          }
        }

        if (!link || seen.has(link)) return;
        seen.add(link);

        console.log(`📝 Processando card ${index + 1}: ${link}`);

        // Extrair título
        let title = null;
        const titleSelectors = [
          'h2',
          '.sc-1fcmfeb-2',
          '.sc-gGBfsJ',
          '.sc-1mb7w0y',
          '[class*="title"]',
          '[class*="Title"]'
        ];

        for (const selector of titleSelectors) {
          const titleEl = card.querySelector(selector);
          if (titleEl) {
            title = titleEl.textContent?.trim();
            if (title && title.length > 5 && title.length < 200) {
              console.log(`✅ Título encontrado: ${title.substring(0, 50)}...`);
              break;
            }
          }
        }

        // Extrair preço
        let price = null;
        const priceSelectors = [
          '.sc-ifAKCX',
          '.sc-1kn4z61',
          '.sc-1fcmfeb-3',
          '[class*="price"]',
          '[class*="Price"]',
          'span[class*="price"]'
        ];

        for (const selector of priceSelectors) {
          const priceEl = card.querySelector(selector);
          if (priceEl) {
            const priceText = priceEl.textContent?.trim();
            if (priceText && (priceText.includes('R$') || /\d{1,3}(?:\.\d{3})*,\d{2}/.test(priceText))) {
              price = priceText;
              console.log(`💰 Preço encontrado: ${price}`);
              break;
            }
          }
        }

        // Extrair localização
        let location = null;
        const locationSelectors = [
          '.sc-1c3ysll',
          '.sc-7l84qu',
          '.sc-1fcmfeb-4',
          '[class*="location"]',
          '[class*="Location"]'
        ];

        for (const selector of locationSelectors) {
          const locationEl = card.querySelector(selector);
          if (locationEl) {
            location = locationEl.textContent?.trim();
            if (location) {
              console.log(`📍 Localização: ${location}`);
              break;
            }
          }
        }

        // Extrair data
        let dateText = null;
        const dateSelectors = [
          '.sc-1a4db0v',
          '.sc-1fcmfeb-5',
          '[class*="date"]',
          '[class*="Date"]',
          'time'
        ];

        for (const selector of dateSelectors) {
          const dateEl = card.querySelector(selector);
          if (dateEl) {
            dateText = dateEl.textContent?.trim() || dateEl.getAttribute('datetime');
            if (dateText) {
              console.log(`📅 Data: ${dateText}`);
              break;
            }
          }
        }

        // Extrair imagem
        let image = null;
        const imgSelectors = [
          'img[src]',
          'img[data-src]',
          '.sc-1fcmfeb-0 img',
          '.sc-12rk7z2-1 img'
        ];

        for (const selector of imgSelectors) {
          const imgEl = card.querySelector(selector);
          if (imgEl) {
            image = imgEl.src || imgEl.getAttribute('data-src') || imgEl.getAttribute('srcset')?.split(' ')[0];
            if (image) {
              console.log(`🖼️ Imagem: ${image.substring(0, 50)}...`);
              break;
            }
          }
        }

        // Validar e adicionar resultado
        if (title && link) {
          const item = {
            title,
            price: price || 'Preço não informado',
            link,
            date_text: dateText,
            location: location || 'Localização não informada',
            image
          };
          
          results.push(item);
          console.log(`✅ Anúncio adicionado: ${title.substring(0, 30)}...`);
        } else {
          console.log(`❌ Anúncio ignorado - título ou link faltando`);
        }

      } catch (error) {
        console.log(`❌ Erro no card ${index + 1}:`, error.message);
      }
    });

    // ESTRATÉGIA 2: Fallback - buscar por qualquer elemento que pareça um anúncio
    if (results.length === 0) {
      console.log('🔄 Tentando estratégia fallback...');
      
      const allLinks = Array.from(document.querySelectorAll('a[href*="/item/"], a[href*="/d/"]'));
      allLinks.forEach(linkEl => {
        try {
          const link = linkEl.href;
          if (seen.has(link)) return;
          
          // Encontrar elementos de texto próximos
          const parent = linkEl.closest('div, article, li') || linkEl.parentElement;
          if (parent) {
            const titleEl = parent.querySelector('h2, h3, [class*="title"]') || linkEl;
            const priceEl = parent.querySelector('[class*="price"], span:contains("R$")');
            const locationEl = parent.querySelector('[class*="location"], [class*="city"]');
            const dateEl = parent.querySelector('[class*="date"], time');
            
            const title = titleEl?.textContent?.trim();
            const price = priceEl?.textContent?.trim();
            const location = locationEl?.textContent?.trim();
            const dateText = dateEl?.textContent?.trim();
            
            if (title && title.length > 5) {
              results.push({
                title,
                price: price || 'Preço não informado',
                link,
                date_text: dateText,
                location: location || 'Localização não informada',
                image: null
              });
              seen.add(link);
            }
          }
        } catch (error) {
          console.log('Erro no fallback:', error);
        }
      });
    }

    console.log(`🎉 Extração concluída: ${results.length} anúncios encontrados`);
    return results;

  });

  return items;
}

async function waitForListings(page, timeout = 15000) {
  console.log('⏳ Aguardando carregamento dos anúncios...');
  
  try {
    // Aguardar por elementos específicos do OLX
    await page.waitForFunction(() => {
      const hasListings = document.querySelector('[data-lurker_list_id], [data-lurker_dimension_listing_id], .sc-12rk7z2-0, [data-testid*="listing"]');
      return !!hasListings;
    }, { timeout, polling: 1000 });
    
    console.log('✅ Anúncios detectados na página');
    return true;
  } catch (error) {
    console.log('⚠️ Timeout aguardando anúncios, continuando mesmo assim...');
    return false;
  }
}

app.get('/scrape', async (req, res) => {
  const { url, date_from, limit } = req.query;
  
  if (!url) {
    return res.status(400).json({ 
      error: 'Parâmetro url é obrigatório',
      example: '?url=https://www.olx.com.br/celulares/estado-mg/iphone?q=iphone'
    });
  }

  console.log(`🚀 Iniciando scraping para: ${url}`);
  const maxItems = Math.max(1, Math.min(500, parseInt(limit || DEFAULT_LIMIT, 10)));

  let dateFromObj = null;
  if (date_from) {
    dateFromObj = dayjs(date_from, ['YYYY-MM-DD', 'DD/MM/YYYY'], true);
    if (!dateFromObj.isValid()) dateFromObj = null;
  }

  let browser = null;
  try {
    // Configuração do Puppeteer com stealth
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=site-per-process',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding'
      ],
      ignoreHTTPSErrors: true
    });

    const page = await browser.newPage();
    
    // Configurar viewport e user agent realista
    await page.setViewport(VIEWPORT);
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Configurar headers realistas
    await page.setExtraHTTPHeaders({
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
      'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8',
      'cache-control': 'no-cache',
      'pragma': 'no-cache',
    });

    // Navegar para a URL
    console.log(`🌐 Navegando para: ${url}`);
    await page.goto(url, { 
      waitUntil: 'networkidle2', 
      timeout: 60000 
    });

    // Aguardar carregamento dos anúncios
    await waitForListings(page);

    // Scroll para carregar conteúdo lazy
    console.log('📜 Fazendo scroll para carregar mais conteúdo...');
    for (let i = 0; i < 6; i++) {
      await page.evaluate(() => {
        window.scrollBy(0, window.innerHeight * 1.5);
      });
      await page.waitForTimeout(1500);
    }

    // Voltar ao topo
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1000);

    // Extrair anúncios
    console.log('🔍 Extraindo dados dos anúncios...');
    let items = await extractListingsFromPage(page);
    console.log(`📊 Total de anúncios extraídos: ${items.length}`);

    // Processar e normalizar dados
    const normalized = items.map((it, index) => {
      console.log(`🔄 Normalizando anúncio ${index + 1}: ${it.title.substring(0, 30)}...`);
      
      const parsedDate = it.date_text ? parsePortugueseRelativeDate(it.date_text) : null;
      
      // Processar preço
      let priceNum = null;
      if (it.price && it.price !== 'Preço não informado') {
        const priceMatch = it.price.match(/(\d{1,3}(?:\.\d{3})*(?:,\d+)?)/);
        if (priceMatch) {
          priceNum = parseFloat(priceMatch[1].replace(/\./g, '').replace(',', '.'));
        }
      }

      return {
        id: index + 1,
        title: it.title,
        price_text: it.price,
        price: isNaN(priceNum) ? null : priceNum,
        link: it.link,
        location: it.location,
        image: it.image,
        date_text: it.date_text,
        date_parsed: parsedDate ? parsedDate.format('YYYY-MM-DD') : null,
        scraped_at: dayjs().format('YYYY-MM-DD HH:mm:ss')
      };
    });

    // Filtrar por data se especificado
    let filtered = normalized;
    if (dateFromObj && dateFromObj.isValid()) {
      filtered = filtered.filter(it => {
        if (!it.date_parsed) return true; // Manter itens sem data quando filtro está ativo
        return dayjs(it.date_parsed).isSameOrAfter(dateFromObj, 'day');
      });
    }

    // Remover duplicados
    const finalResults = [];
    const seenLinks = new Set();
    
    for (const item of filtered) {
      if (!seenLinks.has(item.link)) {
        finalResults.push(item);
        seenLinks.add(item.link);
      }
    }

    // Limitar resultados
    const limited = finalResults.slice(0, maxItems);

    console.log(`✅ Scraping concluído: ${limited.length} anúncios retornados`);

    // Retornar resposta
    return res.json({
      success: true,
      meta: {
        source: url,
        scraped_at: dayjs().toISOString(),
        requested_limit: maxItems,
        returned: limited.length,
        total_candidates: items.length,
        filtered_by_date: dateFromObj ? dateFromObj.format('YYYY-MM-DD') : null
      },
      items: limited
    });

  } catch (err) {
    console.error('❌ Erro no scraping:', err);
    return res.status(500).json({ 
      success: false,
      error: 'Falha no scraping',
      detail: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  } finally {
    if (browser) {
      await browser.close();
      console.log('🔚 Navegador fechado');
    }
  }
});

// Nova rota para scraping específico do OLX
app.get('/scrape-olx', async (req, res) => {
  const { q, state = 'mg', category, limit = 20 } = req.query;
  
  if (!q) {
    return res.status(400).json({
      error: 'Parâmetro "q" (query) é obrigatório',
      example: '/scrape-olx?q=iphone&state=sp&category=celulares'
    });
  }

  // Construir URL do OLX
  const baseUrl = 'https://www.olx.com.br';
  let olxUrl = `${baseUrl}`;
  
  if (category) {
    olxUrl += `/${category}`;
  }
  
  olxUrl += `?q=${encodeURIComponent(q)}`;
  
  if (state && state !== 'all') {
    olxUrl += `&sf=1`; // Ordenar por mais recentes
  }

  console.log(`🔗 URL construída: ${olxUrl}`);
  
  // Redirecionar para a rota principal de scraping
  const scrapeUrl = `/scrape?url=${encodeURIComponent(olxUrl)}&limit=${limit}`;
  
  // Usar método interno ou redirecionar
  req.query.url = olxUrl;
  req.query.limit = limit;
  
  return await req.app._router.handle(req, res);
});

// Health check melhorado
app.get('/health', async (req, res) => {
  try {
    // Teste rápido do OLX
    const testUrl = 'https://www.olx.com.br/celulares?q=iphone&sf=1';
    
    let browser = null;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      const page = await browser.newPage();
      await page.goto(testUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      
      const title = await page.title();
      
      res.json({
        status: 'healthy',
        timestamp: dayjs().toISOString(),
        olx_accessible: true,
        page_title: title,
        service: 'OLX Scraper API'
      });
      
    } finally {
      if (browser) await browser.close();
    }
    
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      timestamp: dayjs().toISOString(),
      error: error.message,
      olx_accessible: false
    });
  }
});

// Rota de exemplo e documentação
app.get('/', (req, res) => {
  res.json({
    service: 'OLX Scraper API',
    version: '2.0.0',
    endpoints: {
      '/scrape': {
        method: 'GET',
        parameters: {
          url: 'URL completa do OLX (obrigatória)',
          limit: 'Número máximo de resultados (opcional, padrão: 20)',
          date_from: 'Filtrar a partir da data (YYYY-MM-DD ou DD/MM/YYYY)'
        },
        example: '/scrape?url=https://www.olx.com.br/celulares/iphone&limit=10'
      },
      '/scrape-olx': {
        method: 'GET',
        parameters: {
          q: 'Termo de busca (obrigatório)',
          state: 'Estado (opcional, padrão: mg)',
          category: 'Categoria (opcional)',
          limit: 'Número máximo de resultados'
        },
        example: '/scrape-olx?q=iphone+16&state=sp&category=celulares&limit=15'
      },
      '/health': 'Health check do serviço'
    }
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 OLX Scraper API rodando na porta ${PORT}`);
  console.log(`📚 Documentação: http://localhost:${PORT}`);
  console.log(`🔍 Exemplo: http://localhost:${PORT}/scrape-olx?q=iphone&limit=5`);
});

module.exports = app;