FROM node:20-slim

# Instala dependências necessárias para executar o Chromium (otimizado)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    ca-certificates \
    libnss3 \
    libdbus-1-3 \
    libatk1.0-0 \
    libx11-6 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libglib2.0-0 \
    libcups2 \
    libxfixes3 \
    libxext6 \
    && apt-get clean && \
    rm -rf /var/lib/apt/lists/* && \
    rm -rf /tmp/* && \
    rm -rf /var/tmp/*

WORKDIR /usr/src/app

# Copiar package files
COPY package*.json ./

# Instalar dependências com npm ci (mais confiável)
RUN npm ci --only=production && \
    npm cache clean --force && \
    rm -rf ~/.npm

# Copiar código
COPY . .

# Variáveis de ambiente - Puppeteer baixará e usará seu próprio Chromium
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false
ENV PUPPETEER_CACHE_DIR=/usr/src/app/.cache/puppeteer

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

EXPOSE 3000
CMD ["npm", "start"]
