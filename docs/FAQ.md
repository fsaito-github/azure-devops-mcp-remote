# Frequently Asked Questions

Before you get started, ensure you follow the steps in the `README.md` file. This will help you get up and running and connected to your Azure DevOps organization.

## Does the MCP Server support both Azure DevOps Services and on-premises deployments?

This MCP Server supports only Azure DevOps Services. Several required API endpoints are not yet available for on-premises deployments. We currently do not have plans to support Azure DevOps on-prem.

## Can I connect to more than one organization at a time?

No, you can connect to only one organization at a time. However, you can switch organizations as needed.

## Can I set a default project instead of fetching the list every time?

Currently, you need to fetch the list of projects so the LLM has context about the project name or ID. We plan to improve this experience in the future by leveraging prompts. In the meantime, you can set a default project name in your `copilot-instructions.md` file.

## Are PAT's supported?

Yes! You can use a Personal Access Token (PAT) via the `envvar` authentication type. Set the `ADO_MCP_AUTH_TOKEN` environment variable with your PAT and use `--authentication envvar`. See the [Troubleshooting](./TROUBLESHOOTING.md) guide for details.

## Is there a remote supported version of the MCP Server?

Yes! This fork supports remote deployment via HTTP and SSE transports. Use `--transport http` or `--transport sse` with `--port <port>` to run as a remote server. You can deploy it on Azure Container Apps or any container platform. See the main [README](../README.md) for deployment instructions.

## Are personal accounts supported?

Unfortunately, personal accounts are not supported. To maintain a higher level of authentication and security, your account must be backed by Entra ID. If you receive an error message like this, it means you are using a personal account.

![image of login error for personal accounts](./media/personal-accounts-error.png)

## When will a remote Azure DevOps MCP Server be availble?

We receive this question frequently. The good news is that work is currently underway. Development began in early January 2026. Once we can provide a reliable timeline, we will publish it on the public [Azure DevOps roadmap](https://learn.microsoft.com/en-us/azure/devops/release-notes/features-timeline).

## What is OBO (On-Behalf-Of) authentication?

OBO is an authentication mode (`--authentication obo`) that allows each user to login with their own Azure AD identity. The server exchanges the user's token for an Azure DevOps delegated token, so all actions in ADO are traced to the real user — not a shared service account. This is recommended for production multi-user environments. See [OBO Authentication](./OBO-AUTH.md) for full documentation.

## Do I need an App Registration for OBO?

Yes. OBO requires an App Registration in Azure AD with the `user_impersonation` permission for Azure DevOps. See [Azure AD Setup](./AZURE-AD-SETUP.md) for a step-by-step guide.

## Which authentication mode should I use?

| Scenario | Recommended Mode |
|----------|-----------------|
| Local development with VS Code | `interactive` (default) |
| GitHub Codespaces | `azcli` |
| Docker container / CI/CD (single identity) | `envvar` (PAT) or `env` (Managed Identity) |
| Production multi-user (identity per user) | `obo` |
