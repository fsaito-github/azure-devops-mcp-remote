# Azure AD / OAuth2 Authentication Setup

Guia completo para configurar autenticação OAuth2 com Azure AD no Azure DevOps MCP.

## Fase 2: Implementar Autenticação via Browser

### Pré-requisitos

- Acesso ao [Azure Portal](https://portal.azure.com)
- Conta de administrador ou permissão para registrar aplicações
- Acesso ao repositório do Azure DevOps MCP

### Registrar Aplicação no Azure AD

#### Passo 1: Acessar Azure Portal

1. Ir para [Azure Portal](https://portal.azure.com)
2. Buscar por "Azure Active Directory" ou "Entra ID"
3. Acessar sua diretório

#### Passo 2: Registrar Nova Aplicação

1. Ir para **App Registrations** (Registros de aplicativos)
2. Clique em **New Registration** (Novo registro)
3. Preencher:
   - **Name**: `Azure DevOps MCP`
   - **Supported account types**: Selecione conforme sua necessidade:
     - `Accounts in this organizational directory only` (Single tenant)
     - `Accounts in any organizational directory` (Multi-tenant)
   - **Redirect URI**: Web
     - URI: `http://localhost:8080/auth/callback`
4. Clique **Register**

#### Passo 3: Configurar Credenciais

1. Na página da aplicação, ir para **Certificates & secrets**
2. Clique **New client secret**
3. Preencher:
   - **Description**: `MCP Server Secret`
   - **Expires**: Selecione a duração (Recomendado: 24 months)
4. Clique **Add**
5. **COPIAR** o valor do secret (apenas aparece uma vez!)

#### Passo 4: Configurar Permissões

1. Ir para **API Permissions**
2. Clique **Add a permission**
3. Selecionar **Microsoft Graph**
4. Clique **Delegated permissions**
5. Buscar e adicionar:
   - `openid` - Sign in users
   - `profile` - View users' basic profile
   - `email` - View users' email address
   - `User.Read` - Read user profile
6. Clique **Add permissions**
7. **Importante**: Clique **Grant admin consent** (se você for admin)

#### Passo 5: Obter Informações Necessárias

1. Na página da aplicação, copiar:
   - **Application (client) ID** - Será sua `OAUTH_CLIENT_ID`
   - **Directory (tenant) ID** - Será sua `OAUTH_TENANT_ID`

### Configurar Variáveis de Ambiente

1. Copiar `.env.example` para `.env.local`:

   ```bash
   cp .env.example .env.local
   ```

2. Editar `.env.local` e adicionar:

   ```env
   # OAuth2 / Azure AD
   OAUTH_CLIENT_ID=<valor-copiado-do-portal>
   OAUTH_CLIENT_SECRET=<valor-gerado-secreto>
   OAUTH_TENANT_ID=<seu-tenant-id>
   OAUTH_REDIRECT_URL=http://localhost:8080/auth/callback

   # JWT Secret (mude para produção!)
   JWT_SECRET=seu-secret-muito-seguro-aqui

   # Outras configurações
   NODE_ENV=development
   LOG_LEVEL=info
   PORT=8080
   ```

### Endpoints de Autenticação

#### GET /auth/login

Inicia o fluxo de login. O usuário será redirecionado para o Azure AD:

```bash
curl http://localhost:8080/auth/login
```

**Resposta**: Redirecionamento para o Azure AD

#### GET /auth/callback

Callback após autenticação no Azure AD. Chamado automaticamente pelo Azure AD:

```
http://localhost:8080/auth/callback?code=AUTH_CODE&state=STATE
```

**Resposta**:

```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "userId": "user-id",
    "email": "user@example.com",
    "displayName": "User Name"
  },
  "expiresIn": 3600
}
```

#### POST /auth/logout

Termina a sessão do usuário:

```bash
curl -X POST http://localhost:8080/auth/logout \
  -H "Authorization: Bearer <token>"
```

**Resposta**:

```json
{
  "success": true,
  "message": "Successfully logged out"
}
```

#### GET /auth/me

Obtém informações do usuário autenticado:

```bash
curl http://localhost:8080/auth/me \
  -H "Authorization: Bearer <token>"
```

**Resposta**:

```json
{
  "user": {
    "userId": "user-id",
    "email": "user@example.com",
    "displayName": "User Name"
  }
}
```

#### GET /auth/status

Verifica status de autenticação (público, sem autenticação necessária):

```bash
curl http://localhost:8080/auth/status
```

**Resposta**:

```json
{
  "authenticated": false,
  "sessions": 2,
  "timestamp": "2026-03-03T12:00:00.000Z"
}
```

#### POST /auth/refresh

Renova o token usando refresh token:

```bash
curl -X POST http://localhost:8080/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "<refresh_token>"}'
```

### Fluxo OAuth2 / PKCE

O servidor implementa o fluxo OAuth2 com PKCE para maior segurança:

1. **Usuário acessa**: `GET /auth/login`
2. **Servidor gera**: state, code_verifier, code_challenge
3. **Usuário redireciona para Azure AD** com code_challenge
4. **Usuário faz login** no Azure AD
5. **Azure AD redireciona** para `/auth/callback` com authorization code
6. **Servidor troca** code por access token (usando code_verifier)
7. **Servidor obtém** dados do usuário via Microsoft Graph
8. **Servidor cria** JWT e retorna ao cliente

### Session Management

#### Lifecycle da Sessão

- **Criação**: Quando `/auth/callback` é executado com sucesso
- **Duração**: TTL configurable (padrão: 60 minutos)
- **Renovação**: Último acesso atualiza `lastActivity`
- **Limpeza**: Sessões inativas são removidas automaticamente
- **Destruição**: No logout manual

#### Autenticação de Requests

Todo request autenticado precisa do header:

```
Authorization: Bearer <token>
```

### Middleware de Autenticação

Dois tipos de middleware disponíveis:

#### 1. validateToken (Obrigatório)

Falha se não tiver token valido:

```typescript
router.get("/protected", authMiddleware.validateToken, handler);
```

#### 2. optionalAuth (Opcional)

Adiciona usuário ao request se houver token válido, mas não falha se não houver:

```typescript
router.get("/public", authMiddleware.optionalAuth, handler);
```

### Segurança

#### Boas Práticas Implementadas

1. **PKCE** (Proof Key for Code Exchange)
   - Protege contra Code Interception attacks
   - Obrigatório para aplicações desktop/mobile

2. **JWT com Assinatura**
   - Tokens não podem ser alterados
   - Contém expiração

3. **State Parameter**
   - Protege contra CSRF attacks
   - Cada login tem um state único

4. **HTTPS em Produção**
   - Mudar `OAUTH_REDIRECT_URL` para HTTPS
   - Certificados válidos obrigatórios

5. **Secrets Seguros**
   - Não commit de `.env` local
   - Usar diferentes secrets em DEV/PROD
   - JWT_SECRET robusto (mínimo 32 caracteres)

### Troubleshooting

#### "Invalid redirect URI"

- Verificar se a URL em `OAUTH_REDIRECT_URL` bate com a registrada no Azure Portal
- Deve ser exatamente: `http://localhost:8080/auth/callback`

#### "Client secret is invalid or expired"

- Verificar se o secret em `OAUTH_CLIENT_SECRET` está correto
- Se expirou, gerar um novo no Azure Portal

#### Token inválido ou expirado

- Token JWT tem validade de 60 minutos (configurável)
- Usar `/auth/refresh` com refresh token para renovar

#### Sessão não encontrada

- Servidor foi reiniciado (sessões em memória
- Fazer login novamente
- Em produção, considerar usar Redis/database

### Testes

#### Teste Completo de Login

```bash
#!/bin/bash

# 1. Iniciar login
echo "1. Iniciando login..."
# Abre browser em http://localhost:8080/auth/login

# 2. Fazer login no Azure AD (manual no browser)

# 3. Copiar token da resposta

# 4. Testar end-to-end
TOKEN="<copie-o-token-aqui>"

# 5. Verificar usuário
curl http://localhost:8080/auth/me \
  -H "Authorization: Bearer $TOKEN"

# 6. Verificar status
curl http://localhost:8080/auth/status

# 7. Fazer logout
curl -X POST http://localhost:8080/auth/logout \
  -H "Authorization: Bearer $TOKEN"
```

### Próximos Passos

- **Fase 3**: Implementar testes completos de segurança
- **Fase 4**: Adicionar Refresh Token Rotation
- **Fase 5**: Implementar Multi-factor Authentication (MFA)
- **Fase 6**: Audit logging de eventos de autenticação

### Recursos

- [Microsoft Auth Flow Docs](https://docs.microsoft.com/en-us/azure/active-directory/develop/auth-oauth2-authorization-code-flow)
- [PKCE Specification](https://tools.ietf.org/html/rfc7636)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)
- [Azure AD App Registration](https://docs.microsoft.com/en-us/azure/active-directory/develop/register-app)

---

**Status**: ✅ Fase 2 em Progresso  
**Última Atualização**: 2026-03-03
