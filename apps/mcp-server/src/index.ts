import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createClient } from './client.js';
import { env } from './env.js';
import { registerTools } from './tools.js';

async function main(): Promise<void> {
  const client = createClient({
    baseUrl: env.ORCHESTRATOR_BASE_URL,
    token: env.RUNNER_AUTH_TOKEN,
  });
  const server = new McpServer({ name: 'agent-platform', version: '0.0.0' });
  registerTools(server, client);
  // stdout é do protocolo MCP — logs sempre no stderr.
  await server.connect(new StdioServerTransport());
  console.error('agent-platform MCP server ligado (stdio)');
}

main().catch((err) => {
  console.error('falha ao iniciar o MCP server:', err);
  process.exit(1);
});
