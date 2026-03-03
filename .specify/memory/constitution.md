# Azure DevOps MCP Server (Remote) Constitution

## Core Principles

### I. Thin Abstraction Layer
Cada tool MCP deve ser uma camada fina sobre a Azure DevOps REST API. Sem lógica de negócio complexa nos tools — o modelo de linguagem é responsável pelo raciocínio. Tools devem ser concisos, focados e fáceis de usar.

### II. Transport-Agnostic Architecture
O servidor deve suportar múltiplos transportes (stdio, HTTP Streamable, SSE) sem duplicar lógica de negócio. A configuração de tools e autenticação é independente do transporte. Novas features não devem quebrar nenhum modo de transporte.

### III. Test-First
Toda nova funcionalidade deve ter testes unitários. Os 680+ testes existentes devem continuar passando. Use Jest como framework de testes. Red-Green-Refactor quando possível.

### IV. Security by Design
Nunca expor credenciais em logs ou respostas. Managed Identity é o método preferido para deploy em produção. PAT tokens só em desenvolvimento local. Validar inputs usando Zod schemas.

### V. Backward Compatibility
O modo `stdio` original deve sempre funcionar. Flags `--transport` e `--port` são opcionais com defaults seguros. Mudanças no package.json não devem quebrar instalação via `npx`.

## Technology Stack

- **Runtime**: Node.js 20+
- **Language**: TypeScript (strict mode)
- **MCP SDK**: @modelcontextprotocol/sdk 1.27+
- **Auth**: @azure/identity (DefaultAzureCredential), @azure/msal-node
- **API Client**: azure-devops-node-api
- **HTTP Framework**: Express (via MCP SDK's createMcpExpressApp)
- **Testing**: Jest + ts-jest
- **Linting**: ESLint + Prettier
- **Container**: Docker multi-stage build

## Development Workflow

1. Features começam como spec no `.specify/` antes de implementar
2. Toda mudança deve compilar sem erros (`npm run build`)
3. Toda mudança deve passar nos testes (`npm test`)
4. PRs devem ter descrição clara do que mudou e por quê
5. Domain tools ficam em `src/tools/` organizados por domínio (core, work, pipelines, etc.)

## Governance

Esta constitution é o guia principal de decisões técnicas. Mudanças na constitution devem ser documentadas e justificadas. Em caso de dúvida, priorize simplicidade e segurança.

**Version**: 1.0.0 | **Ratified**: 2026-03-03 | **Last Amended**: 2026-03-03
