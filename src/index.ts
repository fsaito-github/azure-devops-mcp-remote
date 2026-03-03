#!/usr/bin/env node

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { getBearerHandler, WebApi } from "azure-devops-node-api";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { createAuthenticator } from "./auth.js";
import { logger } from "./logger.js";
import { getOrgTenant } from "./org-tenants.js";
//import { configurePrompts } from "./prompts.js";
import { configureAllTools } from "./tools.js";
import { UserAgentComposer } from "./useragent.js";
import { packageVersion } from "./version.js";
import { DomainsManager } from "./shared/domains.js";
import { setupHealthChecks } from "./health-integration.js";

function isGitHubCodespaceEnv(): boolean {
  return process.env.CODESPACES === "true" && !!process.env.CODESPACE_NAME;
}

const defaultAuthenticationType = isGitHubCodespaceEnv() ? "azcli" : "interactive";

// Parse command line arguments using yargs
const argv = yargs(hideBin(process.argv))
  .scriptName("mcp-server-azuredevops")
  .usage("Usage: $0 <organization> [options]")
  .version(packageVersion)
  .command("$0 <organization> [options]", "Azure DevOps MCP Server", (yargs) => {
    yargs.positional("organization", {
      describe: "Azure DevOps organization name",
      type: "string",
      demandOption: true,
    });
  })
  .option("domains", {
    alias: "d",
    describe: "Domain(s) to enable: 'all' for everything, or specific domains like 'repositories builds work'. Defaults to 'all'.",
    type: "string",
    array: true,
    default: "all",
  })
  .option("authentication", {
    alias: "a",
    describe: "Type of authentication to use",
    type: "string",
    choices: ["interactive", "azcli", "env", "envvar"],
    default: defaultAuthenticationType,
  })
  .option("tenant", {
    alias: "t",
    describe: "Azure tenant ID (optional, applied when using 'interactive' and 'azcli' type of authentication)",
    type: "string",
  })
  .option("transport", {
    describe: "Transport type to use for the MCP server",
    type: "string",
    choices: ["stdio", "http", "sse"] as const,
    default: "stdio",
  })
  .option("port", {
    alias: "p",
    describe: "Port to listen on when using 'http' or 'sse' transport (default: 3000)",
    type: "number",
    default: 3000,
  })
  .help()
  .parseSync();

export const orgName = argv.organization as string;
const orgUrl = "https://dev.azure.com/" + orgName;

const domainsManager = new DomainsManager(argv.domains);
export const enabledDomains = domainsManager.getEnabledDomains();

function getAzureDevOpsClient(getAzureDevOpsToken: () => Promise<string>, userAgentComposer: UserAgentComposer): () => Promise<WebApi> {
  return async () => {
    const accessToken = await getAzureDevOpsToken();
    const authHandler = getBearerHandler(accessToken);
    const connection = new WebApi(orgUrl, authHandler, undefined, {
      productName: "AzureDevOps.MCP",
      productVersion: packageVersion,
      userAgent: userAgentComposer.userAgent,
    });
    return connection;
  };
}

async function main() {
  logger.info("Starting Azure DevOps MCP Server", {
    organization: orgName,
    organizationUrl: orgUrl,
    authentication: argv.authentication,
    tenant: argv.tenant,
    domains: argv.domains,
    transport: argv.transport,
    port: argv.port,
    enabledDomains: Array.from(enabledDomains),
    version: packageVersion,
    isCodespace: isGitHubCodespaceEnv(),
  });

  function createServer(): McpServer {
    const server = new McpServer({
      name: "Azure DevOps MCP Server",
      version: packageVersion,
      icons: [
        {
          src: "https://cdn.vsassets.io/content/icons/favicon.ico",
        },
      ],
    });

    const userAgentComposer = new UserAgentComposer(packageVersion);
    server.server.oninitialized = () => {
      userAgentComposer.appendMcpClientInfo(server.server.getClientVersion());
    };

    configureAllTools(server, authenticator, getAzureDevOpsClient(authenticator, userAgentComposer), () => userAgentComposer.userAgent, enabledDomains);
    return server;
  }

  const tenantId = (await getOrgTenant(orgName)) ?? argv.tenant;
  const authenticator = createAuthenticator(argv.authentication, tenantId);

  if (argv.transport === "stdio") {
    const server = createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
  } else if (argv.transport === "http") {
    const app = createMcpExpressApp();

    // Setup health checks
    setupHealthChecks(app, argv.port);

    const transports: Record<string, StreamableHTTPServerTransport> = {};

    app.post("/mcp", async (req: Request, res: Response) => {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      try {
        let transport: StreamableHTTPServerTransport;

        if (sessionId && transports[sessionId]) {
          transport = transports[sessionId];
        } else if (!sessionId && isInitializeRequest(req.body)) {
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (sid) => {
              transports[sid] = transport;
            },
          });

          transport.onclose = () => {
            const sid = transport.sessionId;
            if (sid && transports[sid]) {
              delete transports[sid];
            }
          };

          const server = createServer();
          await server.connect(transport);
          await transport.handleRequest(req, res, req.body);
          return;
        } else {
          res.status(400).json({
            jsonrpc: "2.0",
            error: { code: -32000, message: "Bad Request: No valid session ID provided" },
            id: null,
          });
          return;
        }

        await transport.handleRequest(req, res, req.body);
      } catch (error) {
        logger.error("Error handling MCP request:", error);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: "2.0",
            error: { code: -32603, message: "Internal server error" },
            id: null,
          });
        }
      }
    });

    app.get("/mcp", async (req: Request, res: Response) => {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      if (!sessionId || !transports[sessionId]) {
        res.status(400).send("Invalid or missing session ID");
        return;
      }
      await transports[sessionId].handleRequest(req, res);
    });

    app.delete("/mcp", async (req: Request, res: Response) => {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      if (!sessionId || !transports[sessionId]) {
        res.status(400).send("Invalid or missing session ID");
        return;
      }
      await transports[sessionId].handleRequest(req, res);
    });

    app.listen(argv.port, () => {
      logger.info(`MCP Streamable HTTP Server listening on port ${argv.port}`);
      logger.info(`Endpoint: http://localhost:${argv.port}/mcp`);
    });

    process.on("SIGINT", async () => {
      for (const sid in transports) {
        await transports[sid].close();
        delete transports[sid];
      }
      process.exit(0);
    });
  } else if (argv.transport === "sse") {
    const app = createMcpExpressApp();

    // Setup health checks
    setupHealthChecks(app, argv.port);

    const transports: Record<string, SSEServerTransport> = {};

    app.get("/sse", async (req: Request, res: Response) => {
      const transport = new SSEServerTransport("/messages", res);
      const sessionId = transport.sessionId;
      transports[sessionId] = transport;

      transport.onclose = () => {
        delete transports[sessionId];
      };

      const server = createServer();
      await server.connect(transport);
    });

    app.post("/messages", async (req: Request, res: Response) => {
      const sessionId = req.query.sessionId as string;
      if (!sessionId || !transports[sessionId]) {
        res.status(400).send("Invalid or missing session ID");
        return;
      }
      await transports[sessionId].handlePostMessage(req, res, req.body);
    });

    app.listen(argv.port, () => {
      logger.info(`MCP SSE Server listening on port ${argv.port}`);
      logger.info(`SSE endpoint: http://localhost:${argv.port}/sse`);
      logger.info(`Messages endpoint: http://localhost:${argv.port}/messages`);
    });

    process.on("SIGINT", async () => {
      for (const sid in transports) {
        await transports[sid].close();
        delete transports[sid];
      }
      process.exit(0);
    });
  }
}

main().catch((error) => {
  logger.error("Fatal error in main():", error);
  process.exit(1);
});
