# OLX Scraper (Puppeteer) — Deploy ready for Render.com

## Descrição
Serviço HTTP robusto que abre URLs do OLX, renderiza com Puppeteer e retorna JSON estruturado com anúncios. Inclui detecção inteligente de elementos, parsing de datas em português e normalização de preços.

## 🚀 Melhorias Recentes

✅ **Detecção aprimorada** de cards de anúncio com múltiplas estratégias de seletor  
✅ **Novos campos**: localização, imagem, total de candidatos encontrados  
✅ **Melhor lazy loading** com scroll mais agressivo  
✅ **Normalização de dados** (preços, datas, URLs)  
✅ **Resiliência a mudanças** do markup do OLX  
✅ **Health check** endpoint para monitoramento  
✅ **Script de teste** incluído  

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
