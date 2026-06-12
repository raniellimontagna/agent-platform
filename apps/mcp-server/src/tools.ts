import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { OrchestratorClient } from './client.js';

/** Executa a chamada e formata o resultado como conteúdo de tool MCP. */
async function asTool(fn: () => Promise<unknown>) {
  try {
    const data = await fn();
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: [{ type: 'text' as const, text: `Erro: ${msg}` }], isError: true };
  }
}

/** Registra as tools que expõem o orchestrator ao cliente MCP (MAC-46). */
export function registerTools(server: McpServer, client: OrchestratorClient): void {
  server.tool(
    'list_runs',
    'Lista execuções do agente, mais recentes primeiro.',
    { limit: z.number().int().positive().optional() },
    ({ limit }) => asTool(() => client.listRuns(limit)),
  );

  server.tool('get_run', 'Detalha um run pelo id.', { id: z.string() }, ({ id }) =>
    asTool(() => client.getRun(id)),
  );

  server.tool(
    'get_run_steps',
    'Etapas (plan/code/review) de um run, com tempo e custo.',
    { id: z.string() },
    ({ id }) => asTool(() => client.getRunSteps(id)),
  );

  server.tool(
    'get_run_approvals',
    'Aprovações de um run e seus motivos.',
    { id: z.string() },
    ({ id }) => asTool(() => client.getRunApprovals(id)),
  );

  server.tool(
    'list_lessons',
    'Lições aprendidas (Memory Layer) acumuladas para um repo.',
    { repo: z.string(), limit: z.number().int().positive().optional() },
    ({ repo, limit }) => asTool(() => client.listLessons(repo, limit)),
  );

  server.tool('agent_status', 'Status do agente (pausado ou ativo).', {}, () =>
    asTool(() => client.agentStatus()),
  );

  server.tool(
    'approve_run',
    'Aprova um run pausado e retoma a execução.',
    { id: z.string(), by: z.string().optional() },
    ({ id, by }) => asTool(() => client.approveRun(id, by)),
  );

  server.tool(
    'reject_run',
    'Reprova um run pausado (encerra).',
    { id: z.string(), by: z.string().optional() },
    ({ id, by }) => asTool(() => client.rejectRun(id, by)),
  );

  server.tool('pause_agents', 'Pausa o processamento de novos runs (kill switch).', {}, () =>
    asTool(() => client.pauseAgents()),
  );

  server.tool('resume_agents', 'Retoma o processamento de runs.', {}, () =>
    asTool(() => client.resumeAgents()),
  );
}
