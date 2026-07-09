# OLX Scraper (Puppeteer) — Deploy ready for Render.com

## Descrição
Serviço HTTP robusto que abre URLs do OLX, renderiza com Puppeteer e retorna JSON estruturado com anúncios. Inclui detecção inteligente de elementos, parsing de datas em português e normalização de preços.

## ⚠️ Cloudflare (Render.com)

O OLX usa Cloudflare, que bloqueia IPs de datacenter (como o Render). Para usar no Render, configure um **proxy residencial** via variável de ambiente `PROXY_URL`:

```bash
# No Render Dashboard > Environment Variables
PROXY_URL=http://user:pass@provedor.com:port
```

Serviços recomendados: BrightData, ScraperAPI, ScrapingBee, ou qualquer proxy HTTP residencial.

## 🚀 Melhorias Recentes

✅ **Proxy support** — variável `PROXY_URL` para bypass de Cloudflare  
✅ **Detecção de Cloudflare** — log claro quando bloqueado com instruções de solução  
✅ **Anti-detecção** — fingerprints aleatórios, plugins falsos, remoção de `navigator.webdriver`  
✅ **Detecção aprimorada** de cards de anúncio com múltiplas estratégias de seletor  
✅ **Parsing de datas PT-BR** — suporte a "Hoje", "Ontem", "X de mes"  
✅ **Normalização de dados** (preços, datas, URLs)  
✅ **Health check** endpoint para monitoramento  

## Endpoint

### GET `/scrape`

```bash
http://localhost:3000/scrape?url=<URL>&limit=20&date_from=YYYY-MM-DD
```

**Parâmetros:**
- `url` (obrigatório) — URL de busca do OLX
- `limit` (opcional, padrão: 20, máximo: 500) — quantidade de itens
- `date_from` (opcional) — filtra por data (YYYY-MM-DD ou DD/MM/YYYY)

### GET `/health`

Verifica se o serviço está rodando:
```bash
http://localhost:3000/health
```

## Exemplo
