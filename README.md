# Azure DevOps MCP Server — Remote (HTTP/SSE) para Azure Container Apps

Este projeto é um fork do [Azure DevOps MCP Server](https://github.com/microsoft/azure-devops-mcp) da Microsoft, com suporte adicional a **transporte HTTP Streamable e SSE**, permitindo deploy como container remoto no **Azure Container Apps** (ou qualquer infraestrutura de containers).

## 🆕 O que mudou em relação ao projeto original

- Suporte a 3 modos de transporte: `stdio` (padrão original), `http` (Streamable HTTP) e `sse`
- Flags `--transport` e `--port` na CLI
- Dockerfile multi-stage para deploy em containers
- Este guia de deploy no Azure Container Apps

## 📋 Pré-requisitos

- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) instalado e autenticado (`az login`)
- Uma [organização Azure DevOps](https://dev.azure.com/) existente
- Assinatura Azure ativa
- [Docker](https://docs.docker.com/get-docker/) (para build local)

## 🏗️ Arquitetura

```
┌─────────────────┐       HTTPS        ┌──────────────────────────────┐
│  Cliente MCP     │ ◄────────────────► │  Azure Container Apps        │
│  (VS Code,       │                    │  ┌──────────────────────┐   │
│   Copilot Studio,│                    │  │ MCP Server (HTTP)    │   │
│   Claude, etc.)  │                    │  │ --transport http      │   │
└─────────────────┘                    │  │ --port 3000           │   │
                                        │  │ -a env                │   │
                                        │  └──────────┬───────────┘   │
                                        │             │               │
                                        │  Managed Identity           │
                                        └─────────────┼───────────────┘
                                                      │
                                        ┌─────────────▼───────────────┐
                                        │  Azure DevOps REST API      │
                                        │  dev.azure.com/<org>        │
                                        └─────────────────────────────┘
```

## 🚀 Deploy no Azure Container Apps

### Passo 1 — Definir variáveis

```bash
# Ajuste estes valores para seu ambiente
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

### Passo 6 — Obter a URL do servidor

```bash
FQDN=$(az containerapp show \
  --name $CONTAINER_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --query "properties.configuration.ingress.fqdn" -o tsv)

echo "MCP Server URL: https://$FQDN/mcp"
```

### Passo 7 — Testar

```bash
# Teste de saúde - deve retornar 400 (esperado, pois precisa de session)
curl -s -o /dev/null -w "%{http_code}" https://$FQDN/mcp

# Teste de inicialização MCP
curl -X POST https://$FQDN/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
```

## 🔌 Configuração nos Clientes MCP

### VS Code (mcp.json)

```json
{
  "servers": {
    "ado-remote": {
      "type": "http",
      "url": "https://<FQDN>/mcp"
    }
  }
}
```

### Copilot Studio

1. No Power Platform, crie um **Custom Connector**
2. Importe o endpoint `https://<FQDN>/mcp` como URL base
3. Configure autenticação conforme necessário
4. No Copilot Studio, adicione o connector como **Tool** (tipo MCP)

### Claude Desktop

```json
{
  "mcpServers": {
    "azure-devops": {
      "type": "http",
      "url": "https://<FQDN>/mcp"
    }
  }
}
```

### Transporte SSE (clientes mais antigos)

Se o seu cliente MCP só suporta SSE, altere o command do Container App para usar `--transport sse`:

```json
{
  "servers": {
    "ado-remote": {
      "type": "sse",
      "url": "https://<FQDN>/sse"
    }
  }
}
```

## ⚙️ Opções da CLI

| Flag | Alias | Descrição | Padrão |
|------|-------|-----------|--------|
| `--transport` | | Tipo de transporte: `stdio`, `http`, `sse` | `stdio` |
| `--port` | `-p` | Porta para HTTP/SSE | `3000` |
| `--authentication` | `-a` | Tipo de autenticação: `interactive`, `azcli`, `env`, `envvar` | `interactive` |
| `--tenant` | `-t` | Azure Tenant ID (opcional) | — |
| `--domains` | `-d` | Domínios a habilitar | `all` |

## 🔐 Autenticação

| Método | Flag | Uso recomendado |
|--------|------|-----------------|
| **Managed Identity** | `-a env` | ✅ Azure Container Apps (sem segredos) |
| **PAT Token** | `-a envvar` | Docker local, testes |
| **Azure CLI** | `-a azcli` | GitHub Codespaces, dev local |
| **OAuth Interativo** | `-a interactive` | Desktop local com navegador |

### Usando PAT Token (alternativa ao Managed Identity)

Se não quiser usar Managed Identity, crie um [Personal Access Token](https://learn.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate) e passe como variável de ambiente:

```bash
az containerapp update \
  --name $CONTAINER_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --set-env-vars "ADO_MCP_AUTH_TOKEN=secretref:ado-pat" \
  --command "node" "dist/index.js" "$ADO_ORG" "--transport" "http" "--port" "3000" "-a" "envvar"
```

## 🧪 Desenvolvimento Local

```bash
# Instalar dependências
npm install

# Build
npm run build

# Rodar com HTTP transport
node dist/index.js myorg --transport http --port 3000 -a envvar
# (com ADO_MCP_AUTH_TOKEN definido no ambiente)

# Rodar com Docker
docker build -t ado-mcp-server .
docker run -p 3000:3000 -e ADO_MCP_AUTH_TOKEN=<seu-pat> \
  ado-mcp-server myorg --transport http --port 3000 -a envvar
```

## 🧹 Limpeza de Recursos

```bash
az group delete --name $RESOURCE_GROUP --yes --no-wait
```

## 📝 Referências

- [Azure DevOps MCP Server (original)](https://github.com/microsoft/azure-devops-mcp)
- [MCP Specification - Transports](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports)
- [Azure Container Apps - Docs](https://learn.microsoft.com/en-us/azure/container-apps/)
- [DefaultAzureCredential](https://learn.microsoft.com/en-us/javascript/api/@azure/identity/defaultazurecredential)
- [Deploy MCP Server + Copilot Studio](https://learn.microsoft.com/en-us/azure/developer/azure-mcp-server/how-to/deploy-remote-mcp-server-copilot-studio)

## 📄 Licença

Este projeto é baseado no [Azure DevOps MCP Server](https://github.com/microsoft/azure-devops-mcp) da Microsoft, licenciado sob [MIT License](./LICENSE.md).
