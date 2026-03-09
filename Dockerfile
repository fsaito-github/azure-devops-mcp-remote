# Multi-stage build para otimizar o tamanho final
# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Instalar dependências de build
RUN apk add --no-cache python3 make g++

# Copiar arquivos de dependência
COPY package*.json ./

# Instalar todas as dependências (incluindo devDependencies para build)
# Ignora scripts para evitar build antes do código fonte estar copiado
RUN npm ci --ignore-scripts

# Copiar arquivos de configuração
COPY tsconfig*.json ./

# Copiar código-fonte
COPY src/ ./src/

# Build do projeto TypeScript
RUN npm run build

# Stage 2: Runtime
FROM node:20-alpine

WORKDIR /app

# Instalar utilitários úteis (curl para health checks)
RUN apk add --no-cache curl

# Copiar package.json para referência e info
COPY package*.json ./

# Instalar apenas dependências de produção do builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

# Criar diretório para logs
RUN mkdir -p /app/logs && chmod 755 /app/logs

# Health check - verifica se o servidor está pronto para receber tráfego
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8080/ready || exit 1

# Criar usuário não-root por segurança
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
USER nodejs

# Portas expostas:
# 8080 = servidor MCP principal
# 5005 = debug (InspectJS)
EXPOSE 8080 5005

# Variáveis de ambiente padrão
ENV NODE_ENV=production
ENV LOG_LEVEL=info
ENV PORT=8080
ENV DEBUG_PORT=5005

# Comando padrão: iniciar o servidor MCP
ENTRYPOINT ["node"]
CMD ["dist/index.js"]
