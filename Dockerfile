FROM node:20-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    ca-certificates \
    chromium \
    libnss3 \
    libxss1 \
    libdbus-1-3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libx11-6 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libglib2.0-0 \
    libcups2 \
    libxfixes3 \
    libxext6 \
    libasound2 \
    fonts-liberation \
    libgbm1 \
    && apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# Copiar package files
COPY package*.json ./

# Instalar dependências
RUN npm ci --only=production && \
    npm cache clean --force

# Copiar aplicação
COPY . .

# Variáveis de ambiente do Puppeteer
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false

# Expor porta
EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => { if (r.statusCode !== 200) process.exit(1) })"

CMD ["npm", "start"]
