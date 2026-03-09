# 🔐 Configuração do Azure AD para Autenticação OBO

> Guia completo para configurar um **App Registration** no Azure AD e habilitar o fluxo **On-Behalf-Of (OBO)** no Azure DevOps MCP Server.

---

## 📋 Pré-requisitos

- Acesso ao [Portal Azure](https://portal.azure.com)
- Permissões de **administrador** no Azure AD (ou solicitar ao admin do tenant)
- Organização Azure DevOps existente e acessível
- Azure DevOps MCP Server já instalado e funcional

> 💡 **Dica:** Se você não tem permissões de admin, solicite ao administrador do Azure AD para criar o App Registration ou conceder o **admin consent** após a criação.

---

## 🏗️ Passo 1: Criar App Registration

1. Acesse o [Portal Azure](https://portal.azure.com)
2. Navegue até **Azure Active Directory** → **App registrations** → **New registration**
3. Preencha os campos:

| Campo | Valor |
|-------|-------|
| **Name** | `Azure DevOps MCP Server` (ou nome desejado) |
| **Supported account types** | `Accounts in this organizational directory only` (Single tenant) |
| **Redirect URI** | Platform: **Web** → `http://localhost:8080/auth/callback` |

4. Clique em **Register**

> 💡 **Dica:** Escolha **multi-tenant** (`Accounts in any organizational directory`) se usuários de múltiplos tenants precisarem acessar o servidor. Para a maioria dos cenários corporativos, **single tenant** é suficiente e mais seguro.

Após o registro, você será redirecionado para a página **Overview** do App Registration. Mantenha esta página aberta — vamos precisar dos IDs exibidos aqui.

---

## 🔌 Passo 2: Configurar API Permissions

### Azure DevOps

1. No App Registration, vá em **API permissions** → **Add a permission**
2. Selecione a aba **APIs my organization uses**
3. Pesquise por `Azure DevOps`
4. Selecione **Azure DevOps** (Application ID: `499b84ac-1321-427f-aa17-267ca6975798`)
5. Selecione **Delegated permissions**
6. Marque ✅ **user_impersonation**
7. Clique em **Add permissions**

### Microsoft Graph

As permissões abaixo geralmente já são adicionadas por padrão, mas confirme que estão presentes:

| Tipo | Permissão | Descrição |
|------|-----------|-----------|
| Delegated | `openid` | Permite login via OpenID Connect |
| Delegated | `profile` | Acesso ao perfil básico do usuário |
| Delegated | `email` | Acesso ao email do usuário |

### Admin Consent

8. Após adicionar todas as permissões, clique em **Grant admin consent for \<seu tenant\>**
9. Confirme clicando **Yes**

> ⚠️ **Importante:** Sem o **admin consent**, cada usuário precisará consentir individualmente no primeiro login. Se a coluna **Status** exibir ✅ `Granted for <tenant>`, o consent já foi aplicado.

---

## 🔑 Passo 3: Criar Client Secret

1. No App Registration, vá em **Certificates & secrets** → **Client secrets** → **New client secret**
2. Preencha:

| Campo | Valor |
|-------|-------|
| **Description** | `MCP Server Secret` |
| **Expires** | Escolha o período (recomendado: **12 months**) |

3. Clique em **Add**

> 🚨 **COPIE O VALUE IMEDIATAMENTE!** O valor do secret só é exibido uma vez. Se perder, será necessário criar um novo secret.

```
Value:  xYz~AbCdEfGhIjKlMnOpQrStUvWxYz123456   ← COPIE ESTE VALOR
Secret ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

---

## ⚙️ Passo 4: Configurar Token

### Optional Claims

1. No App Registration, vá em **Token configuration** → **Add optional claim**
2. Selecione **Token type**: **ID**
3. Marque as claims:
   - ✅ `email`
   - ✅ `preferred_username`
4. Clique em **Add**

> 💡 **Dica:** Se aparecer um prompt solicitando permissão do Microsoft Graph, aceite — ele adicionará automaticamente as permissões necessárias.

### Implicit Grant

5. Vá em **Authentication** → seção **Implicit grant and hybrid flows**
6. Marque ✅ **ID tokens (used for implicit and hybrid flows)**
7. Clique em **Save**

---

## 📝 Passo 5: Anotar os Valores

Na página **Overview** do App Registration, copie os seguintes valores:

| Portal Azure | Variável de Ambiente | Exemplo |
|--------------|---------------------|---------|
| **Application (client) ID** | `OAUTH_CLIENT_ID` | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |
| **Directory (tenant) ID** | `OAUTH_TENANT_ID` | `yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy` |
| **Client secret value** (Passo 3) | `OAUTH_CLIENT_SECRET` | `xYz~AbCdEfGhIjKl...` |
| **Redirect URI** (Passo 1) | `OAUTH_REDIRECT_URL` | `http://localhost:8080/auth/callback` |

---

## 🚀 Passo 6: Configurar Variáveis de Ambiente

Crie ou edite o arquivo `.env` na raiz do projeto com os valores obtidos:

```bash
# ===================================
# Azure AD — Configuração OBO
# ===================================

# Application (client) ID do App Registration
OAUTH_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# Directory (tenant) ID do Azure AD
OAUTH_TENANT_ID=yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy

# Client secret criado no Passo 3
OAUTH_CLIENT_SECRET=xYz~AbCdEfGhIjKlMnOpQrStUvWxYz123456

# Redirect URI configurada no Passo 1
OAUTH_REDIRECT_URL=http://localhost:8080/auth/callback

# Secret para assinatura de tokens JWT internos
JWT_SECRET=uma-string-secreta-longa-e-aleatoria-aqui
```

> 🚨 **Nunca faça commit do arquivo `.env` no repositório!** Verifique se `.env` está listado no `.gitignore`.

Para gerar um `JWT_SECRET` seguro:

```bash
# Linux/macOS
openssl rand -base64 64

# PowerShell (Windows)
[Convert]::ToBase64String((1..64 | ForEach-Object { Get-Random -Maximum 256 }) -as [byte[]])
```

---

## 👥 Passo 7: Configurar Permissões no Azure DevOps

Com o fluxo **OBO**, cada usuário autentica com suas **próprias credenciais** e o servidor age **em nome** do usuário. Isso significa:

- ✅ Os **usuários** que farão login precisam ter acesso à organização Azure DevOps
- ✅ As ações realizadas respeitam as **permissões individuais** de cada usuário no ADO
- ✅ **Não é necessário** adicionar o App Registration como usuário no Azure DevOps
- ✅ Diferente da Managed Identity, não existe uma "conta de serviço" acessando o ADO

> 💡 **Dica:** Para verificar se um usuário tem acesso, vá em **Azure DevOps** → **Organization Settings** → **Users** e confirme que o usuário está listado com a licença apropriada (Basic, Stakeholder, etc.).

```
┌─────────────┐     ┌──────────────────┐     ┌───────────────┐
│   Usuário    │────►│  MCP Server      │────►│  Azure DevOps │
│  (Browser)   │     │  (OBO Flow)      │     │  (API)        │
│              │     │                  │     │               │
│  Credenciais │     │  Troca token do  │     │  Permissões   │
│  do usuário  │     │  usuário por     │     │  do USUÁRIO   │
│              │     │  token ADO       │     │  (não do app) │
└─────────────┘     └──────────────────┘     └───────────────┘
```

---

## 🔧 Troubleshooting

### Erros Comuns

#### ❌ `AADSTS65001` — Consent não concedido

**Mensagem:** *The user or administrator has not consented to use the application.*

**Causa:** O admin consent não foi concedido para as permissões do App Registration.

**Solução:**
1. Acesse o App Registration → **API permissions**
2. Clique em **Grant admin consent for \<tenant\>**
3. Ou peça ao usuário para consentir no próximo login adicionando `prompt=consent` na URL de autenticação

---

#### ❌ `AADSTS700024` — Client assertion inválido

**Mensagem:** *Client assertion is not within its valid time range.*

**Causa:** O client secret expirou ou está incorreto.

**Solução:**
1. Verifique se o `OAUTH_CLIENT_SECRET` no `.env` está correto
2. Acesse **Certificates & secrets** e verifique a data de expiração
3. Se expirado, crie um novo secret e atualize o `.env`

---

#### ❌ `AADSTS50013` — OBO assertion inválido

**Mensagem:** *Assertion failed signature validation* ou *The provided value for the input parameter 'assertion' is not valid.*

**Causa:** O token do usuário não pôde ser validado para o fluxo OBO.

**Solução:**
1. Verifique se a permissão `user_impersonation` do Azure DevOps está configurada
2. Confirme que o **admin consent** foi concedido
3. Verifique se o `OAUTH_TENANT_ID` está correto
4. Tente limpar o cache de tokens e fazer login novamente

---

#### ❌ Redirect URI mismatch

**Mensagem:** *AADSTS50011: The reply URL specified in the request does not match the reply URLs configured for the application.*

**Causa:** A `OAUTH_REDIRECT_URL` no `.env` não corresponde à URI configurada no App Registration.

**Solução:**
1. Acesse o App Registration → **Authentication**
2. Verifique se a Redirect URI corresponde **exatamente** ao valor no `.env`
3. Atenção a diferenças como `http` vs `https`, portas, e barras finais (`/`)

---

## 🛡️ Segurança

### Boas Práticas

| Prática | Descrição |
|---------|-----------|
| 🔒 **Nunca commitar secrets** | O `client_secret` e `JWT_SECRET` nunca devem ir para o controle de versão |
| 🏦 **Azure Key Vault** | Em produção, use o [Azure Key Vault](https://learn.microsoft.com/azure/key-vault/) para armazenar secrets |
| 🔄 **Rotacionar secrets** | Crie um novo secret **antes** do atual expirar para evitar downtime |
| ⏱️ **TTL curto em produção** | Configure tempos de expiração curtos para tokens JWT em ambientes produtivos |
| 🔍 **Monitoramento** | Habilite logs de auditoria no Azure AD para rastrear autenticações |
| 🌐 **HTTPS** | Em produção, **sempre** use `https://` na Redirect URI |

### Checklist de Segurança

```
✅ .env está no .gitignore
✅ Client secret não está em nenhum arquivo versionado
✅ HTTPS habilitado em produção
✅ Token TTL configurado (recomendado: 1h para access tokens)
✅ Secrets com data de expiração monitorada
✅ Admin consent concedido (evita prompts inesperados)
```

---

## 📚 Referências

- [Fluxo On-Behalf-Of — Microsoft Docs](https://learn.microsoft.com/azure/active-directory/develop/v2-oauth2-on-behalf-of-flow)
- [Registrar um aplicativo no Azure AD](https://learn.microsoft.com/azure/active-directory/develop/quickstart-register-app)
- [Azure DevOps REST API — Autenticação](https://learn.microsoft.com/azure/devops/integrate/get-started/authentication/oauth?view=azure-devops)
- [Azure Key Vault — Documentação](https://learn.microsoft.com/azure/key-vault/general/overview)
