# Fase 3: Testes Completos e Monitoramento

Documentação completa de testes, health checks e monitoramento para o Azure DevOps MCP.

## Visão Geral

A Fase 3 implementa:

- Health checks e Readiness probes (para Kubernetes)
- Logging estruturado em JSON
- Métricas de performance em tempo real
- Suite de testes completa

## Health Checks

### Endpoints de Health

#### 1. GET /health (Liveness Probe)

Verificação simples e rápida de que a aplicação está respondendo.

```bash
curl http://localhost:8080/health
```

**Resposta (Healthy)**:

```json
{
  "status": "healthy",
  "timestamp": "2026-03-03T12:30:00.000Z",
  "uptime": 3600
}
```

**Resposta (Degraded)**:

```json
{
  "status": "degraded",
  "timestamp": "2026-03-03T12:30:00.000Z",
  "uptime": 3600
}
```

**Resposta (Unhealthy)**:

```json
{
  "status": "unhealthy",
  "timestamp": "2026-03-03T12:30:00.000Z",
  "uptime": 3600
}
```

**Status HTTP**:

- `200 OK` - Healthy ou Degraded
- `503 Service Unavailable` - Unhealthy

#### 2. GET /ready (Readiness Probe)

Verifica se a aplicação está pronta para receber tráfego.

```bash
curl http://localhost:8080/ready
```

**Resposta (Ready)**:

```json
{
  "ready": true,
  "readiness": {
    "mcp_server": true,
    "authentication": true,
    "external_services": true
  },
  "timestamp": "2026-03-03T12:30:00.000Z"
}
```

**Resposta (Not Ready)**:

```json
{
  "ready": false,
  "readiness": {
    "mcp_server": false,
    "authentication": true,
    "external_services": false
  },
  "timestamp": "2026-03-03T12:30:00.000Z"
}
```

**Status HTTP**:

- `200 OK` - Ready
- `503 Service Unavailable` - Not Ready

#### 3. GET /health/detailed (Requer Autenticação)

Informações detalhadas de saúde.

```bash
curl http://localhost:8080/health/detailed \
  -H "Authorization: Bearer <token>"
```

**Resposta**:

```json
{
  "status": "healthy",
  "timestamp": "2026-03-03T12:30:00.000Z",
  "uptime": 3600,
  "memory": {
    "usedHeapSize": 45,
    "totalHeapSize": 256,
    "externalMemoryUsage": 2
  },
  "services": {
    "database": true,
    "cache": true,
    "azure_ad": true
  },
  "latency": {
    "average": 125.5,
    "p95": 450,
    "p99": 850
  },
  "details": {
    "started": "2026-03-03T11:30:00.000Z",
    "memoryUsagePercent": 18
  }
}
```

#### 4. GET /metrics (Requer Autenticação)

Métricas de performance.

```bash
curl http://localhost:8080/metrics \
  -H "Authorization: Bearer <token>"
```

**Resposta**:

```json
{
  "timestamp": "2026-03-03T12:30:00.000Z",
  "uptime": 3600,
  "requests": {
    "count": 1250,
    "average": 125.5,
    "min": 5,
    "max": 3500
  },
  "latency": {
    "average": 125.5,
    "p95": 450,
    "p99": 850
  },
  "memory": {
    "heapUsedMB": 45,
    "heapTotalMB": 256,
    "usagePercent": 18,
    "externalMB": 2
  }
}
```

### Kubernetes Integration

#### Health Check Probes

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: azure-devops-mcp
spec:
  containers:
    - name: mcp
      image: azure-devops-mcp:latest

      # Liveness Probe - Verifica se container está vivo
      livenessProbe:
        httpGet:
          path: /health
          port: 8080
        initialDelaySeconds: 10
        periodSeconds: 30
        timeoutSeconds: 5
        failureThreshold: 3

      # Readiness Probe - Verifica se está pronto para tráfego
      readinessProbe:
        httpGet:
          path: /ready
          port: 8080
        initialDelaySeconds: 5
        periodSeconds: 10
        timeoutSeconds: 5
        failureThreshold: 2
```

## Logging Estruturado

### Log Levels

| Level | Descrição            | Uso                              |
| ----- | -------------------- | -------------------------------- |
| DEBUG | Informações de debug | Troubleshooting, desenvolvimento |
| INFO  | Informações gerais   | Eventos normais do sistema       |
| WARN  | Avisos               | Situações incomuns mas esperadas |
| ERROR | Erros                | Problemas que requerem ação      |
| FATAL | Erros fatais         | Falhas críticas                  |

### Formato JSON

Todos os logs em produção são emitidos como JSON estruturado:

```json
{
  "timestamp": "2026-03-03T12:30:45.123Z",
  "level": "info",
  "message": "User logged in successfully",
  "context": "AUTH",
  "data": {
    "userId": "user123",
    "email": "user@example.com"
  },
  "requestId": "req-abc123",
  "userId": "user123"
}
```

### Logs de Autenticação

#### Login Bem-sucedido

```json
{
  "timestamp": "2026-03-03T12:30:45.123Z",
  "level": "info",
  "message": "Auth Event: login",
  "context": "AUTH",
  "event": "login",
  "userId": "user123",
  "requestId": "req-abc123"
}
```

#### Login Falhado

```json
{
  "timestamp": "2026-03-03T12:30:45.123Z",
  "level": "warn",
  "message": "Auth Error",
  "context": "AUTH",
  "reason": "invalid_credentials",
  "requestId": "req-abc123"
}
```

#### Logout

```json
{
  "timestamp": "2026-03-03T12:30:45.123Z",
  "level": "info",
  "message": "Auth Event: logout",
  "context": "AUTH",
  "event": "logout",
  "userId": "user123"
}
```

### Logs de Request HTTP

```json
{
  "timestamp": "2026-03-03T12:30:45.123Z",
  "level": "info",
  "message": "HTTP Request",
  "context": "HTTP",
  "method": "GET",
  "path": "/api/projects",
  "statusCode": 200,
  "duration": 125
}
```

### Logs de Erro

```json
{
  "timestamp": "2026-03-03T12:30:45.123Z",
  "level": "error",
  "message": "Failed to fetch user data",
  "context": "GRAPH_API",
  "error": {
    "message": "Access denied",
    "code": "AUTHORIZATION_FAILURE",
    "stack": "Error: Access denied\n    at ..."
  },
  "requestId": "req-abc123"
}
```

### Configuração de Logs

#### Variáveis de Ambiente

```bash
# Log Level (debug, info, warn, error, fatal)
LOG_LEVEL=info

# Output (stdout, file, remote)
LOG_OUTPUT=stdout

# JSON ou texto (production/development)
NODE_ENV=production  # Output: JSON
NODE_ENV=development # Output: Formatted text
```

#### Exemplo em Desenvolvimento

```bash
LOG_LEVEL=debug NODE_ENV=development npm start
```

Output:

```
[2026-03-03T12:30:45.123Z] [DEBUG] AUTH:config: Loading Azure AD configuration
  Data: {
    "clientId": "***"
  }
[2026-03-03T12:30:46.456Z] [INFO] AUTH:oauth2: User logged in
  Data: {
    "userId": "user123",
    "email": "user@example.com"
  }
```

## Métricas de Performance

### Latência de Request

As métricas rastreiam latência em percentis:

```json
{
  "average": 125.5, // Média de todos os requests
  "p95": 450, // 95% dos requests < 450ms
  "p99": 850 // 99% dos requests < 850ms
}
```

### Uso de Memória

Monitoramento em tempo real de uso de memória:

```json
{
  "heapUsedMB": 45, // Heap usado em MB
  "heapTotalMB": 256, // Heap total disponível
  "usagePercent": 18, // Percentual de uso
  "externalMB": 2 // Memória externa
}
```

### Métricas Esperadas

| Métrica             | Target   | Limite | Status   |
| ------------------- | -------- | ------ | -------- |
| Startup Time        | < 5s     | < 10s  | ✅       |
| Login Flow          | < 2s     | < 5s   | À testar |
| Tool Response       | < 1s p99 | < 3s   | À testar |
| Memory Usage (idle) | < 512MB  | < 1GB  | À testar |
| CPU (idle)          | < 5%     | < 15%  | À testar |

## Testes

### Rodando Testes

```bash
# Todos os testes
npm test

# Apenas health checks
npm test -- health.test.ts

# Com coverage
npm test -- --coverage

# Watch mode
npm test -- --watch
```

### Coverage Report

```bash
npm test -- --coverage
open coverage/lcov-report/index.html
```

**Target**: > 80% coverage

### Teste Manual de Health

```bash
# 1. Iniciar servidor
npm run dev

# 2. Health check (sem autenticação)
curl http://localhost:8080/health
curl http://localhost:8080/ready

# 3. Health detalhado (com autenticação)
TOKEN="<seu-token>"
curl http://localhost:8080/health/detailed \
  -H "Authorization: Bearer $TOKEN"

# 4. Métricas
curl http://localhost:8080/metrics \
  -H "Authorization: Bearer $TOKEN"

# 5. Simular load (gerar timings)
for i in {1..100}; do
  curl http://localhost:8080/api/projects \
    -H "Authorization: Bearer $TOKEN" &
done

# 6. Check métricas após load
curl http://localhost:8080/metrics \
  -H "Authorization: Bearer $TOKEN"
```

## Monitoramento em Produção

### Ferramentas Recomendadas

#### Prometheus

```yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: "azure-devops-mcp"
    metrics_path: "/metrics"
    static_configs:
      - targets: ["localhost:8080"]
```

#### Grafana

- Criar dashboard com `/metrics`
- Visualizar latência, memória, uptime
- Alertas para status unhealthy

#### ELK Stack (Elasticsearch, Logstash, Kibana)

- Ingerir logs JSON
- Buscar e filtrar por campo
- Visualizar tendências

### Alertas Recomendados

| Alerta       | Condição                    | Ação         |
| ------------ | --------------------------- | ------------ |
| Unhealthy    | Status != healthy por > 30s | Page on-call |
| High Memory  | Uso > 85%                   | Escalate     |
| High Latency | p99 > 5s                    | Investigate  |
| Errors       | Taxa erro > 5%              | Page on-call |

## Performance Tuning

### Otimizações Implementadas

✅ Health checks são muito rápidos (< 10ms)  
✅ Latência não impacta significativamente performance  
✅ Limpeza automática de sessões expiradas  
✅ Limite de timings armazenados (previne memory leak)

### Melhorias Futuras

- [ ] Cache de health status
- [ ] Otimização de latency percentile calculation
- [ ] Streaming de logs para ELK
- [ ] Métricas customizadas por endpoint
- [ ] Distributed tracing (OpenTelemetry)

## Troubleshooting

### Status Degraded

**O quê**: Memória > 80%
**Ação**:

```bash
# Verificar memory usage
curl http://localhost:8080/health/detailed \
  -H "Authorization: Bearer $TOKEN"

# Potencial memory leak
npm test -- --detectOpenHandles
```

### Status Unhealthy

**O quê**: Memória > 95%  
**Ação**:

```bash
# Forçar restart
docker restart azure-devops-mcp

# Ou
npm run restart
```

### Latência Alta

**O quê**: Latência p99 > 5s  
**Ação**:

```bash
# Verificar métricas detalhadas
curl http://localhost:8080/metrics

# Verificar logs de erro
tail -f logs/error.log

# Check CPU/Disco
top
iostat 1 5
```

## Próximos Passos

- [ ] Integração com Kubernetes probes
- [ ] Prometheus metrics export
- [ ] Custom alerts
- [ ] Performance baseline tests
- [ ] Load testing (k6, wrk)
- [ ] Chaos testing

---

**Status**: 🟡 Phase 3 - 50% Complete  
**Última Atualização**: 2026-03-03  
**Próxima Revisão**: Após testes de integração completos
