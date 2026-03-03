# Azure DevOps MCP - Docker Setup Guide

Guia completo para executar o Azure DevOps MCP Server em um container Docker localmente.

## Fase 1: Setup Base do Container

### Pré-requisitos

- **Docker** >= 20.10
- **Docker Compose** >= 1.29
- **Git** (para clonar o repositório)

### Verificar Instalação

```bash
docker --version
docker-compose --version
```

### Quick Start (5 minutos)

1. **Clone o repositório**

   ```bash
   git clone https://github.com/fsaito-github/azure-devops-mcp-remote.git
   cd azure-devops-mcp-remote
   ```

2. **Build da imagem Docker**

   ```bash
   make build
   ```

   Ou manualmente:

   ```bash
   docker build -t azure-devops-mcp:latest .
   ```

3. **Iniciar o container**

   ```bash
   make run
   ```

   Ou manualmente:

   ```bash
   docker-compose up -d
   ```

4. **Verificar se está rodando**

   ```bash
   make health
   ```

   Ou manualmente:

   ```bash
   curl http://localhost:8080/health
   ```

5. **Ver logs**
   ```bash
   make logs
   ```

### Parar o Container

```bash
make stop
```

## Detalhes da Configuração

### Portas Expostas

| Porta | Serviço      | Descrição                    |
| ----- | ------------ | ---------------------------- |
| 8080  | Servidor MCP | API principal do servidor    |
| 5005  | Debug Port   | Node.js Inspector para debug |

### Volumes

- `./logs` - Logs persistentes do container

### Variáveis de Ambiente

Criar `.env.local` baseado em `.env.example`:

```bash
cp .env.example .env.local
```

Editar `.env.local` com suas configurações:

```env
NODE_ENV=production
LOG_LEVEL=info
PORT=8080
```

## Comandos Disponíveis

### Using Make

```bash
make help          # Ver todos os comandos
make dev           # Iniciar ambiente de desenvolvimento
make build         # Build da imagem
make run           # Rodar container
make stop          # Parar container
make logs          # Ver logs em tempo real
make health        # Verificar saúde do container
make status        # Status dos containers
make clean         # Remover containers e volumes
make test-local    # Rodar testes localmente
```

### Using Docker Compose Diretamente

```bash
# Iniciar
docker-compose up -d

# Parar
docker-compose down

# Ver logs
docker-compose logs -f

# Executar comando
docker-compose exec azure-devops-mcp npm test

# Ver status
docker-compose ps
```

### Using Docker Diretamente

```bash
# Build
docker build -t azure-devops-mcp:latest .

# Run
docker run -d \
  -p 8080:8080 \
  -p 5005:5005 \
  -v ./logs:/app/logs \
  --name azure-devops-mcp \
  azure-devops-mcp:latest

# Health check
curl http://localhost:8080/health

# Logs
docker logs -f azure-devops-mcp

# Stop
docker stop azure-devops-mcp

# Remove
docker rm azure-devops-mcp
```

## Estrutura do Dockerfile

### Multi-stage Build

O Dockerfile usa multi-stage build para otimização:

1. **Builder Stage** (build)
   - Instala dependências de build (python, make, g++)
   - Instala todas as dependências npm
   - Compila TypeScript para JavaScript

2. **Runtime Stage** (runtime)
   - Baseado em `node:20-alpine` (18MB)
   - Apenas dependências de produção
   - Usuário não-root por segurança
   - Health checks configurados

### Tamanho da Imagem

- Builder: ~800MB
- Final Image: ~150-200MB

## Health Checks

O container implementa health checks automáticos:

```bash
# Verificação manual
curl http://localhost:8080/health

# Docker health status
docker inspect azure-devops-mcp | grep -A 10 '"Health"'
```

### Status Possíveis

- `starting` - Container iniciando
- `healthy` - Container rodando normalmente
- `unhealthy` - Problema detectado

## Debug

### Ativar Debug Mode

Editar `docker-compose.yml` ou usar variáveis:

```bash
# Via docker-compose
docker-compose run --service-ports -e NODE_DEBUG="*" azure-devops-mcp

# Via docker direto
docker run -p 5005:5005 -e NODE_DEBUG="*" azure-devops-mcp
```

### Conectar com Inspector

1. Chrome/Edge: `chrome://inspect`
2. Aguardar descoberta do processo
3. Clicar em "inspect"

## Troubleshooting

### Container não inicia

```bash
# Ver logs de erro
docker-compose logs azure-devops-mcp

# Tentar reiniciar
docker-compose restart azure-devops-mcp
```

### Porta já em uso

```bash
# Verificar qual processo usa a porta
lsof -i :8080

# Matar processo
kill -9 <PID>

# Ou usar porta diferente no docker-compose
# Editar ports: ["9080:8080"]
```

### Build falha

```bash
# Limpar cache do Docker
docker system prune -a

# Rebuilt sem cache
docker build --no-cache -t azure-devops-mcp:latest .
```

## Performance

### Limites de Recurso (Opcional)

Para ativar limites de recurso no `docker-compose.yml`:

```yaml
deploy:
  resources:
    limits:
      cpus: "1"
      memory: 1G
    reservations:
      cpus: "0.5"
      memory: 512M
```

### Métricas de Desempenho Esperadas

| Métrica      | Target  | Limite |
| ------------ | ------- | ------ |
| Startup Time | < 5s    | < 10s  |
| Memory Usage | < 512MB | < 1GB  |
| CPU (idle)   | < 5%    | < 15%  |

## Testing

### Rodar testes no container

```bash
make test
```

### Rodar testes localmente

```bash
make test-local
```

### Cobertura de testes

```bash
npm run test -- --coverage
```

## Próximas Fases

- **Fase 2**: Implementar autenticação via browser com Azure AD
- **Fase 3**: Testes completos e monitoramento
- **Fase 4**: Documentação e deploy

## Recursos

- [Docker Docs](https://docs.docker.com/)
- [Docker Compose Docs](https://docs.docker.com/compose/)
- [Node.js Docker Best Practices](https://nodejs.org/en/docs/guides/nodejs-docker-webapp/)
- [Azure DevOps MCP Repository](https://github.com/fsaito-github/azure-devops-mcp-remote)

## Suporte

Para problemas ou dúvidas:

- Abra uma issue no GitHub
- Verifique o TROUBLESHOOTING.md
- Consulte a documentação principal

---

**Status**: ✅ Fase 1 Completa  
**Última Atualização**: 2026-03-03
