# 🔐 Autenticação OBO (On-Behalf-Of)

## 📋 Visão Geral

O fluxo **OBO (On-Behalf-Of)** permite que cada usuário se autentique com sua própria identidade do Azure AD. O MCP Server troca o token do usuário por um token delegado do Azure DevOps, preservando a identidade real do usuário em todas as operações no ADO.

> **Vantagem principal:** Todas as ações no Azure DevOps (criar work items, aprovar PRs, etc.) ficam registradas com o nome do usuário real, garantindo rastreabilidade completa.

---

## 🔄 Diagrama de Sequência

```
┌──────────┐     ┌──────────────┐     ┌────────────┐     ┌──────────────┐
│  Browser  │     │  MCP Server  │     │  Azure AD  │     │ Azure DevOps │
└─────┬─────┘     └──────┬───────┘     └──────┬─────┘     └──────┬───────┘
      │   GET /auth/login │                    │                   │
      │──────────────────►│                    │                   │
      │   302 Redirect    │                    │                   │
      │◄──────────────────│                    │                   │
      │   Login page      │                    │                   │
      │───────────────────────────────────────►│                   │
      │   Auth code       │                    │                   │
      │◄───────────────────────────────────────│                   │
      │   GET /auth/callback?code=...          │                   │
      │──────────────────►│                    │                   │
      │                   │  Exchange code     │                   │
      │                   │───────────────────►│                   │
      │                   │  Access token      │                   │
      │                   │◄───────────────────│                   │
      │                   │  OBO exchange      │                   │
      │                   │───────────────────►│                   │
      │                   │  ADO token         │                   │
      │                   │◄───────────────────│                   │
      │  JWT + user info  │                    │                   │
      │◄──────────────────│                    │                   │
      │                   │                    │                   │
┌──────────┐              │                    │                   │
│MCP Client│              │                    │                   │
└─────┬────┘              │                    │                   │
      │  POST /mcp        │                    │                   │
      │  Auth: Bearer JWT │                    │                   │
      │──────────────────►│                    │                   │
      │                   │  Tool call (ADO token do usuário)      │
      │                   │───────────────────────────────────────►│
      │                   │  Response                              │
      │                   │◄───────────────────────────────────────│
      │  MCP response     │                    │                   │
      │◄──────────────────│                    │                   │
```

---

## ✅ Pré-requisitos

- 🏢 **App Registration** no Azure AD configurado (ver [docs/AZURE-AD-SETUP.md](./AZURE-AD-SETUP.md))
- 🔑 **Variáveis de ambiente** configuradas:
  - `OAUTH_CLIENT_ID`
  - `OAUTH_CLIENT_SECRET`
  - `OAUTH_TENANT_ID`
  - `OAUTH_REDIRECT_URL`
  - `JWT_SECRET`
- 👤 **Usuário** com acesso à organização Azure DevOps

---

## 🚀 Passo a Passo

### 1. Iniciar o servidor em modo OBO

```bash
# Local
node dist/index.js myorg --transport http --port 8080 --authentication obo

# Docker
docker-compose up  # com --authentication obo no command
```

### 2. Autenticar via browser

1. Abrir `http://localhost:8080/auth/login` no browser
2. Login com conta Azure AD (corporativa)
3. Autorizar o aplicativo
4. Copiar o JWT token retornado

### 3. Configurar cliente MCP

#### VS Code (`mcp.json`)

```json
{
  "servers": {
    "ado-obo": {
      "type": "http",
      "url": "http://localhost:8080/mcp",
      "headers": {
        "Authorization": "Bearer <seu-jwt-token>"
      }
    }
  }
}
```

#### Claude Desktop

```json
{
  "mcpServers": {
    "azure-devops": {
      "type": "http",
      "url": "http://localhost:8080/mcp",
      "headers": {
        "Authorization": "Bearer <seu-jwt-token>"
      }
    }
  }
}
```

---

## 🌐 Endpoints de Autenticação

| Endpoint | Método | Descrição | Autenticação |
|---|---|---|---|
| `/auth/login` | GET | Inicia login OAuth2 | Não |
| `/auth/callback` | GET | Callback do Azure AD | Não |
| `/auth/me` | GET | Info do usuário | Bearer JWT |
| `/auth/status` | GET | Status da autenticação | Não |
| `/auth/logout` | POST | Encerrar sessão | Bearer JWT |
| `/auth/refresh` | POST | Renovar token Azure AD | Não |
| `/auth/refresh-ado` | POST | Renovar token ADO via OBO | Bearer JWT |

---

## ⚖️ Comparação com Outros Modos

| Aspecto | OBO | envvar (PAT) | env (Managed Identity) |
|---|---|---|---|
| Identidade no ADO | Usuário real | Token fixo | Container |
| Rastreabilidade | Por usuário | Única | Única |
| Multi-usuário | ✅ Sim | ❌ Não | ❌ Não |
| Requer browser | Sim (1x login) | Não | Não |
| Requer App Registration | Sim | Não | Não |
| Recomendado para | Produção multi-user | Dev/testes | CI/CD sem usuário |

---

## 🔧 Troubleshooting

### Erros Comuns

1. **`OBO_EXCHANGE_FAILED`**
   O App Registration não tem permissão `user_impersonation` no Azure DevOps, ou o admin consent não foi concedido.

2. **`Unauthorized: OBO authentication requires Authorization header`**
   O cliente MCP não está enviando o header `Authorization`. Verificar configuração do `mcp.json`.

3. **`Session expired or invalid`**
   O JWT expirou (padrão: 1h). Fazer login novamente em `/auth/login`.

4. **`Azure AD configuration incomplete`**
   Variáveis de ambiente `OAUTH_*` não estão configuradas. Verificar `.env`.

### Renovar Token Expirado

```bash
# Via API
curl -X POST http://localhost:8080/auth/refresh-ado \
  -H "Authorization: Bearer <seu-jwt>"
```

---

## 🔒 Segurança

- Tokens ADO via OBO herdam as permissões do usuário no Azure DevOps
- JWT local tem TTL de 1h (configurável via `JWT_SECRET`)
- Sessões são limpas automaticamente após expiração
- Use HTTPS em produção
- Nunca compartilhe o JWT token
