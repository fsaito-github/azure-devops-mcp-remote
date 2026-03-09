# Azure DevOps MCP Server

> Conecte assistentes de IA (GitHub Copilot, Claude, Cursor) ao seu Azure DevOps — work items, repositórios, pipelines, wikis e mais.

Este servidor implementa o protocolo [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) para Azure DevOps. Isso permite que qualquer assistente de IA compatível com MCP **leia e modifique** seus projetos no Azure DevOps usando linguagem natural.

**Exemplo:** Você pede ao Copilot _"crie um work item de bug no projeto X com prioridade alta"_ e ele usa este servidor para executar a ação diretamente no Azure DevOps.

Este projeto é um fork do [Azure DevOps MCP Server](https://github.com/microsoft/azure-devops-mcp) da Microsoft, com suporte adicional a **transporte HTTP/SSE remoto**, **autenticação OBO multi-usuário** e **deploy em containers**.

---

## 📖 Índice

- [Quick Start — Funcionando em 2 minutos](#-quick-start--funcionando-em-2-minutos)
- [Configuração nos Clientes MCP](#-configuração-nos-clientes-mcp)
- [O que este servidor pode fazer](#-o-que-este-servidor-pode-fazer)
- [Autenticação — Qual método usar?](#-autenticação--qual-método-usar)
- [Opções da CLI](#-opções-da-cli)
- [Deploy em Produção (Azure Container Apps)](#-deploy-em-produção-azure-container-apps)
- [Desenvolvimento Local](#-desenvolvimento-local)
- [Documentação Complementar](#-documentação-complementar)
- [Referências](#-referências)

---

## ⚡ Quick Start — Funcionando em 2 minutos

### Pré-requisitos

- [Node.js](https://nodejs.org/) 20+ instalado
- Uma [organização Azure DevOps](https://dev.azure.com/) existente
- Um [Personal Access Token (PAT)](https://learn.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate) do Azure DevOps

### Passo 1 — Definir o token

Crie um PAT no Azure DevOps com as permissões necessárias (Read/Write nos escopos que você quer usar) e exporte como variável de ambiente:

```bash
# Linux/Mac
export ADO_MCP_AUTH_TOKEN="seu-pat-token-aqui"

# Windows (PowerShell)
$env:ADO_MCP_AUTH_TOKEN = "seu-pat-token-aqui"
```

### Passo 2 — Rodar o servidor

```bash
npx -y @azure-devops/mcp sua-organizacao --authentication envvar
```

Substitua `sua-organizacao` pelo nome da sua org no Azure DevOps (a parte que aparece em `https://dev.azure.com/sua-organizacao`).

### Passo 3 — Configurar no VS Code

Crie o arquivo `.vscode/mcp.json` no seu projeto:

```json
{
  "servers": {
    "azure-devops": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@azure-devops/mcp", "sua-organizacao", "--authentication", "envvar"]
    }
  }
}
```

**Pronto!** Abra o Copilot Chat no VS Code e peça algo como _"liste os work items do projeto MyProject"_.

> 💡 Para outros clientes (Claude Desktop, Cursor, etc.), veja a seção [Configuração nos Clientes MCP](#-configuração-nos-clientes-mcp).

---

## 🔌 Configuração nos Clientes MCP

### VS Code / GitHub Copilot (stdio — local)

Crie `.vscode/mcp.json` na raiz do seu projeto:

```json
{
  "servers": {
    "azure-devops": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@azure-devops/mcp", "sua-organizacao", "--authentication", "envvar"]
    }
  }
}
```

### VS Code / GitHub Copilot (HTTP — servidor remoto)

Se o servidor está rodando remotamente (ex: Azure Container Apps):

```json
{
  "servers": {
    "azure-devops": {
      "type": "http",
      "url": "https://seu-servidor.azurecontainerapps.io/mcp"
    }
  }
}
```

Se usando autenticação OBO, adicione o header com o JWT obtido via `/auth/login`:

```json
{
  "servers": {
    "azure-devops": {
      "type": "http",
      "url": "https://seu-servidor.azurecontainerapps.io/mcp",
      "headers": {
        "Authorization": "Bearer seu-jwt-token-aqui"
      }
    }
  }
}
```

### Claude Desktop

Em `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "azure-devops": {
      "command": "npx",
      "args": ["-y", "@azure-devops/mcp", "sua-organizacao", "--authentication", "envvar"]
    }
  }
}
```

### Cursor

Crie `.cursor/mcp.json` na raiz do projeto:

```json
{
  "mcpServers": {
    "azure-devops": {
      "command": "npx",
      "args": ["-y", "@azure-devops/mcp", "sua-organizacao", "--authentication", "envvar"]
    }
  }
}
```

### Visual Studio 2022

Crie `.mcp.json` na raiz da solução:

```json
{
  "servers": {
    "azure-devops": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@azure-devops/mcp", "sua-organizacao", "--authentication", "envvar"]
    }
  }
}
```

### Copilot Studio (servidor remoto)

1. No Power Platform, crie um **Custom Connector** apontando para `https://seu-servidor/mcp`
2. No Copilot Studio, adicione o connector como **Tool** (tipo MCP)
3. Se usando OBO, configure o header `Authorization` com o JWT do usuário

### Transporte SSE (clientes mais antigos)

Se o seu cliente MCP só suporta SSE (e não Streamable HTTP):

```json
{
  "servers": {
    "azure-devops": {
      "type": "sse",
      "url": "https://seu-servidor/sse"
    }
  }
}
```

> O servidor precisa estar rodando com `--transport sse` neste caso.

---

## 🛠️ O que este servidor pode fazer

O servidor expõe **80+ operações** organizadas em **9 domínios**. Você pode habilitar apenas os domínios que precisa com a flag `--domains`.

### Work Items (`work-items`)

Criar, ler, atualizar, comentar e vincular work items (bugs, tasks, user stories, etc.).

| Operação | Descrição |
|----------|-----------|
| `wit_my_work_items` | Listar meus work items atribuídos |
| `wit_get_work_item` | Obter detalhes de um work item |
| `wit_create_work_item` | Criar novo work item |
| `wit_update_work_item` | Atualizar campos de um work item |
| `wit_update_work_items_batch` | Atualizar múltiplos work items de uma vez |
| `wit_add_work_item_comment` | Adicionar comentário |
| `wit_add_child_work_items` | Adicionar work items filhos |
| `wit_link_work_item_to_pull_request` | Vincular work item a um PR |
| `wit_work_items_link` / `wit_work_item_unlink` | Criar/remover links entre work items |
| `wit_list_backlogs` / `wit_list_backlog_work_items` | Navegar backlogs |
| `wit_get_query` / `wit_get_query_results_by_id` | Executar queries salvas |
| `wit_list_work_item_comments` / `wit_list_work_item_revisions` | Histórico e comentários |

### Repositórios Git (`repositories`)

Gerenciar repos, branches, PRs e code reviews.

| Operação | Descrição |
|----------|-----------|
| `repo_list_repos_by_project` | Listar repositórios de um projeto |
| `repo_get_repo_by_name_or_id` | Obter detalhes de um repo |
| `repo_list_branches_by_repo` | Listar branches |
| `repo_create_branch` | Criar branch |
| `repo_list_directory` | Navegar arquivos/pastas do repo |
| `repo_list_pull_requests_by_repo_or_project` | Listar PRs |
| `repo_get_pull_request_by_id` | Obter detalhes de um PR |
| `repo_create_pull_request` | Criar PR |
| `repo_update_pull_request` | Atualizar PR (título, descrição, status) |
| `repo_vote_pull_request` | Aprovar/rejeitar PR |
| `repo_update_pull_request_reviewers` | Gerenciar revisores |
| `repo_list_pull_request_threads` | Listar comentários de review |
| `repo_create_pull_request_thread` | Criar comentário de review |
| `repo_reply_to_comment` | Responder comentário |
| `repo_search_commits` | Buscar commits |

### Pipelines (`pipelines`)

Gerenciar builds, pipelines e artefatos.

| Operação | Descrição |
|----------|-----------|
| `pipelines_get_build_definitions` | Listar definições de build |
| `pipelines_get_builds` | Listar builds |
| `pipelines_get_build_status` | Verificar status de um build |
| `pipelines_get_build_log` | Obter logs de um build |
| `pipelines_run_pipeline` | Disparar execução de pipeline |
| `pipelines_create_pipeline` | Criar pipeline |
| `pipelines_list_runs` / `pipelines_get_run` | Listar/obter execuções |
| `pipelines_list_artifacts` / `pipelines_download_artifact` | Gerenciar artefatos |
| `pipelines_update_build_stage` | Atualizar estágio de build |

### Projetos e Times (`core`)

| Operação | Descrição |
|----------|-----------|
| `core_list_projects` | Listar todos os projetos da organização |
| `core_list_project_teams` | Listar times de um projeto |
| `core_get_identity_ids` | Buscar identidades de usuários |

### Iterações e Capacidade (`work`)

| Operação | Descrição |
|----------|-----------|
| `work_list_team_iterations` / `work_list_iterations` | Listar sprints/iterações |
| `work_create_iterations` / `work_assign_iterations` | Criar e atribuir iterações |
| `work_get_team_capacity` / `work_update_team_capacity` | Gerenciar capacidade do time |

### Wiki (`wiki`)

| Operação | Descrição |
|----------|-----------|
| `wiki_list_wikis` / `wiki_get_wiki` | Listar e obter wikis |
| `wiki_list_pages` / `wiki_get_page_content` | Navegar e ler páginas |
| `wiki_create_or_update_page` | Criar ou editar páginas |

### Test Plans (`test-plans`)

| Operação | Descrição |
|----------|-----------|
| `testplan_list_test_plans` / `testplan_create_test_plan` | Gerenciar planos de teste |
| `testplan_list_test_suites` / `testplan_create_test_suite` | Gerenciar suites |
| `testplan_list_test_cases` / `testplan_create_test_case` | Gerenciar casos de teste |
| `testplan_show_test_results_from_build_id` | Ver resultados de testes |

### Busca (`search`)

| Operação | Descrição |
|----------|-----------|
| `search_code` | Buscar código nos repositórios |
| `search_wiki` | Buscar em páginas wiki |
| `search_workitem` | Buscar work items |

### Segurança Avançada (`advanced-security`)

| Operação | Descrição |
|----------|-----------|
| `advsec_get_alerts` | Listar alertas de segurança |
| `advsec_get_alert_details` | Obter detalhes de um alerta |

### Filtrando domínios

Se você só precisa de work items e repositórios, por exemplo:

```bash
npx -y @azure-devops/mcp sua-org -a envvar --domains repositories,work-items
```

Domínios disponíveis: `core`, `repositories`, `pipelines`, `work-items`, `work`, `wiki`, `test-plans`, `search`, `advanced-security`

---

## 🔐 Autenticação — Qual método usar?

```
Você está rodando local no seu computador?
├── SIM → Tem navegador disponível?
│   ├── SIM → Use "interactive" (padrão, abre o browser para login)
│   └── NÃO → Use "envvar" (PAT token via variável de ambiente)
│
└── NÃO → Está rodando em servidor/container remoto?
    ├── É Azure Container Apps / Azure VM?
    │   ├── Um único serviço (CI/CD, bot) → Use "env" (Managed Identity)
    │   └── Múltiplos usuários reais → Use "obo" (cada um com sua identidade)
    │
    ├── É GitHub Codespaces? → Use "azcli" (detectado automaticamente)
    │
    └── Outro ambiente? → Use "envvar" (PAT token)
```

### Resumo dos métodos

| Método | Flag | O que faz | Quando usar |
|--------|------|-----------|-------------|
| **OAuth Interativo** | `-a interactive` | Abre o browser para login Azure AD | Desenvolvimento local com navegador |
| **Azure CLI** | `-a azcli` | Usa credenciais do `az login` | Codespaces, dev local já autenticado |
| **PAT Token** | `-a envvar` | Lê token da variável `ADO_MCP_AUTH_TOKEN` | Qualquer ambiente — simples e rápido |
| **Managed Identity** | `-a env` | Usa identidade gerenciada do Azure | Azure Container Apps, VMs (sem segredos) |
| **OBO (On-Behalf-Of)** | `-a obo` | Cada usuário faz login e age com sua identidade | Produção multi-usuário |

### Detalhes de cada método

<details>
<summary><strong>PAT Token (-a envvar)</strong> — O mais simples para começar</summary>

1. Acesse `https://dev.azure.com/sua-org/_usersSettings/tokens`
2. Clique em **New Token**
3. Dê um nome, selecione os escopos (Read/Write) e copie o token
4. Defina a variável de ambiente:

```bash
export ADO_MCP_AUTH_TOKEN="seu-token-aqui"
```

5. Inicie o servidor:

```bash
npx -y @azure-devops/mcp sua-org -a envvar
```

> ⚠️ Todos os acessos ao Azure DevOps são feitos com a identidade do dono do PAT. Não há distinção por usuário.
</details>

<details>
<summary><strong>OAuth Interativo (-a interactive)</strong> — Padrão para desktop</summary>

Não precisa configurar nada. Ao iniciar o servidor, ele abre automaticamente o browser para login:

```bash
npx -y @azure-devops/mcp sua-org
```

O token é cacheado — nas próximas execuções, o login é silencioso.
</details>

<details>
<summary><strong>Azure CLI (-a azcli)</strong> — Para quem já usa az login</summary>

```bash
az login
npx -y @azure-devops/mcp sua-org -a azcli
```

Detectado automaticamente em GitHub Codespaces.
</details>

<details>
<summary><strong>Managed Identity (-a env)</strong> — Para Azure sem segredos</summary>

Funciona automaticamente em Azure Container Apps, VMs e outros serviços com System-Assigned ou User-Assigned Managed Identity.

```bash
node dist/index.js sua-org --transport http --port 3000 -a env
```

A identidade precisa ser adicionada como usuário no Azure DevOps (veja a seção de [Deploy](#passo-5--configurar-permissões-da-managed-identity)).
</details>

<details>
<summary><strong>OBO — On-Behalf-Of (-a obo)</strong> — Para produção multi-usuário</summary>

Neste modo, cada usuário faz login com sua conta Azure AD e todas as ações no Azure DevOps são rastreadas com a identidade real do usuário.

**Requer um App Registration no Azure AD.** Veja o guia completo: [Azure AD Setup](./docs/AZURE-AD-SETUP.md)

**Variáveis de ambiente necessárias:**

```bash
OAUTH_CLIENT_ID=id-do-app-registration
OAUTH_CLIENT_SECRET=secret-do-app
OAUTH_TENANT_ID=id-do-tenant-azure-ad
OAUTH_REDIRECT_URL=http://localhost:8080/auth/callback
JWT_SECRET=uma-chave-secreta-aleatoria
```

**Fluxo do usuário:**
1. Servidor inicia: `node dist/index.js sua-org --transport http --port 8080 -a obo`
2. Usuário acessa `http://localhost:8080/auth/login` no browser
3. Faz login com Azure AD → recebe um JWT
4. Configura o JWT no cliente MCP (header `Authorization: Bearer <jwt>`)
5. Todas as ações no Azure DevOps são feitas com a identidade desse usuário

**Endpoints de autenticação:**

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/auth/login` | GET | Iniciar login OAuth2 |
| `/auth/callback` | GET | Callback do OAuth2 (automático) |
| `/auth/me` | GET | Ver informações do usuário logado |
| `/auth/status` | GET | Status da autenticação |
| `/auth/refresh` | POST | Renovar token Azure AD |
| `/auth/refresh-ado` | POST | Renovar token Azure DevOps |
| `/auth/logout` | POST | Encerrar sessão |

Guia completo: [Autenticação OBO](./docs/OBO-AUTH.md)
</details>

---

## ⚙️ Opções da CLI

```
mcp-server-azuredevops <organizacao> [opções]
```

| Flag | Alias | Descrição | Padrão |
|------|-------|-----------|--------|
| `<organizacao>` | — | Nome da organização Azure DevOps (obrigatório) | — |
| `--transport` | — | Tipo de transporte: `stdio`, `http`, `sse` | `stdio` |
| `--port` | `-p` | Porta para HTTP/SSE | `3000` |
| `--authentication` | `-a` | Tipo de autenticação (veja seção acima) | `interactive` |
| `--tenant` | `-t` | Azure Tenant ID (opcional, para `interactive` e `azcli`) | — |
| `--domains` | `-d` | Domínios a habilitar (separados por vírgula) | `all` |

**Exemplos:**

```bash
# Desenvolvimento local com PAT (mais simples)
npx -y @azure-devops/mcp contoso -a envvar

# Servidor HTTP remoto com Managed Identity
node dist/index.js contoso --transport http --port 3000 -a env

# Apenas domínios de repos e pipelines
npx -y @azure-devops/mcp contoso -a envvar --domains repositories,pipelines

# Multi-usuário com OBO
node dist/index.js contoso --transport http --port 8080 -a obo
```

---

## 🏗️ Arquitetura

```
┌─────────────────┐                     ┌──────────────────────────────┐
│  Cliente MCP     │       HTTPS         │  Azure Container Apps        │
│                  │ ◄─────────────────► │                              │
│  • VS Code       │   (ou stdio local)  │  ┌──────────────────────┐   │
│  • Copilot       │                     │  │  MCP Server          │   │
│  • Claude        │                     │  │  --transport http     │   │
│  • Cursor        │                     │  │  --port 3000          │   │
│                  │                     │  └──────────┬───────────┘   │
└─────────────────┘                     │             │               │
                                         │      Token (PAT,           │
                                         │      Managed Identity      │
                                         │      ou OBO)               │
                                         └─────────────┼───────────────┘
                                                       │
                                         ┌─────────────▼───────────────┐
                                         │  Azure DevOps REST API      │
                                         │  dev.azure.com/<org>        │
                                         └─────────────────────────────┘
```

**Transportes disponíveis:**

| Transporte | Flag | Uso |
|-----------|------|-----|
| **stdio** | `--transport stdio` | Padrão. O cliente inicia o servidor como subprocesso local. |
| **HTTP (Streamable)** | `--transport http` | Servidor remoto acessível via HTTPS. Recomendado para produção. |
| **SSE** | `--transport sse` | Para clientes MCP mais antigos que não suportam HTTP Streamable. |

---

## 🚀 Deploy em Produção (Azure Container Apps)

### Pré-requisitos

- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) instalado e autenticado (`az login`)
- Assinatura Azure ativa
- [Docker](https://docs.docker.com/get-docker/) (opcional, para build local)

### Passo 1 — Definir variáveis

```bash
RESOURCE_GROUP="rg-mcp-server"
LOCATION="eastus2"
ACR_NAME="acrmcpserver"           # deve ser único globalmente
CONTAINER_APP_ENV="mcp-env"
CONTAINER_APP_NAME="ado-mcp-server"
ADO_ORG="sua-organizacao"         # nome da sua org no Azure DevOps
IMAGE_NAME="ado-mcp-server"
```

### Passo 2 — Criar os recursos Azure

```bash
# Resource Group
az group create --name $RESOURCE_GROUP --location $LOCATION

# Azure Container Registry
az acr create --name $ACR_NAME --resource-group $RESOURCE_GROUP --sku Basic --admin-enabled true

# Container Apps Environment
az containerapp env create \
  --name $CONTAINER_APP_ENV \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION
```

### Passo 3 — Build e push da imagem Docker

```bash
# Build e push direto no ACR (não precisa de Docker local)
az acr build --registry $ACR_NAME --image $IMAGE_NAME:latest .
```

Ou, se preferir build local:

```bash
docker build -t $ACR_NAME.azurecr.io/$IMAGE_NAME:latest .
az acr login --name $ACR_NAME
docker push $ACR_NAME.azurecr.io/$IMAGE_NAME:latest
```

### Passo 4 — Criar o Container App com Managed Identity

```bash
az containerapp create \
  --name $CONTAINER_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --environment $CONTAINER_APP_ENV \
  --image "$ACR_NAME.azurecr.io/$IMAGE_NAME:latest" \
  --registry-server "$ACR_NAME.azurecr.io" \
  --registry-identity system \
  --target-port 3000 \
  --ingress external \
  --system-assigned \
  --command "node" "dist/index.js" "$ADO_ORG" "--transport" "http" "--port" "3000" "-a" "env" \
  --min-replicas 1 \
  --max-replicas 3
```

### Passo 5 — Configurar permissões da Managed Identity

```bash
# Obter o Principal ID da Managed Identity
PRINCIPAL_ID=$(az containerapp show \
  --name $CONTAINER_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --query "identity.principalId" -o tsv)

echo "Principal ID: $PRINCIPAL_ID"
```

Agora, adicione essa identity como usuário no Azure DevOps:

1. Acesse **https://dev.azure.com/{sua-org}/_settings/users**
2. Clique em **Add users**
3. Adicione o **Object ID** (que é o Principal ID acima) como usuário
4. Atribua a licença **Basic** ou **Stakeholder**
5. Dê permissões nos projetos necessários (Contributor, Reader, etc.)

> 💡 **Dica**: Para automatizar via API, use o [Azure DevOps REST API - User Entitlements](https://learn.microsoft.com/en-us/rest/api/azure/devops/memberentitlementmanagement/user-entitlements/add).

### Passo 6 — Obter a URL e testar

```bash
FQDN=$(az containerapp show \
  --name $CONTAINER_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --query "properties.configuration.ingress.fqdn" -o tsv)

echo "MCP Server URL: https://$FQDN/mcp"
```

Teste com uma requisição MCP de inicialização:

```bash
curl -X POST https://$FQDN/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
```

Se receber uma resposta JSON com `"result"`, o servidor está funcionando! 🎉

### Usando PAT ao invés de Managed Identity

Se preferir usar PAT Token no container:

```bash
az containerapp update \
  --name $CONTAINER_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --set-env-vars "ADO_MCP_AUTH_TOKEN=secretref:ado-pat" \
  --command "node" "dist/index.js" "$ADO_ORG" "--transport" "http" "--port" "3000" "-a" "envvar"
```

### Limpeza de recursos

```bash
az group delete --name $RESOURCE_GROUP --yes --no-wait
```

---

## 🧪 Desenvolvimento Local

```bash
# Clonar e instalar
git clone https://github.com/microsoft/azure-devops-mcp.git
cd azure-devops-mcp
npm install

# Build
npm run build

# Rodar com PAT
export ADO_MCP_AUTH_TOKEN="seu-pat"
node dist/index.js sua-org -a envvar

# Rodar com HTTP transport
node dist/index.js sua-org --transport http --port 3000 -a envvar

# Rodar com Docker
docker build -t ado-mcp-server .
docker run -p 3000:3000 -e ADO_MCP_AUTH_TOKEN=seu-pat \
  ado-mcp-server sua-org --transport http --port 3000 -a envvar

# Rodar testes
npm test

# Rodar linter
npm run eslint
```

### Variáveis de ambiente

Copie `.env.example` para `.env` e ajuste:

```bash
cp .env.example .env
```

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `ADO_MCP_AUTH_TOKEN` | Para `-a envvar` | Personal Access Token |
| `OAUTH_CLIENT_ID` | Para `-a obo` | App Registration Client ID |
| `OAUTH_CLIENT_SECRET` | Para `-a obo` | App Registration Secret |
| `OAUTH_TENANT_ID` | Para `-a obo` | Azure AD Tenant ID |
| `OAUTH_REDIRECT_URL` | Para `-a obo` | Callback URL (ex: `http://localhost:8080/auth/callback`) |
| `JWT_SECRET` | Para `-a obo` | Chave para assinar JWTs de sessão |
| `LOG_LEVEL` | Não | Nível de log: `debug`, `info`, `warn`, `error` |
| `PORT` | Não | Porta do servidor (padrão: `3000`) |

---

## 📚 Documentação Complementar

| Documento | Descrição |
|-----------|-----------|
| [Getting Started](./docs/GETTINGSTARTED.md) | Guia de instalação detalhado para cada IDE |
| [Exemplos](./docs/EXAMPLES.md) | Casos de uso e prompts exemplo |
| [FAQ](./docs/FAQ.md) | Perguntas frequentes |
| [Troubleshooting](./docs/TROUBLESHOOTING.md) | Diagnóstico de problemas |
| [Azure AD Setup](./docs/AZURE-AD-SETUP.md) | Configuração do App Registration para OBO |
| [Autenticação OBO](./docs/OBO-AUTH.md) | Guia completo do fluxo On-Behalf-Of |

---

## 📝 Referências

- [Azure DevOps MCP Server (original)](https://github.com/microsoft/azure-devops-mcp)
- [MCP Specification — Transports](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports)
- [Azure Container Apps — Docs](https://learn.microsoft.com/en-us/azure/container-apps/)
- [DefaultAzureCredential](https://learn.microsoft.com/en-us/javascript/api/@azure/identity/defaultazurecredential)
- [Deploy MCP Server + Copilot Studio](https://learn.microsoft.com/en-us/azure/developer/azure-mcp-server/how-to/deploy-remote-mcp-server-copilot-studio)

---

## 📄 Licença

Este projeto é baseado no [Azure DevOps MCP Server](https://github.com/microsoft/azure-devops-mcp) da Microsoft, licenciado sob [MIT License](./LICENSE.md).
