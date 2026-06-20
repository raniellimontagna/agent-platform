import { Hono } from 'hono';
import { listAgents } from '../agents.js';
import type { Agent, Run, Tool } from '../db/schema.js';
import { listRuns } from '../runs.js';
import { listTools } from '../tools.js';

export const registryRoute = new Hono();

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return '-';
  return new Date(value).toISOString().replace('T', ' ').slice(0, 19);
}

function formatVersion(version: string): string {
  return version.startsWith('v') ? version : `v${version}`;
}

function statusClass(status: string): string {
  return status === 'active' || status === 'completed'
    ? 'ok'
    : status === 'deprecated'
      ? 'muted'
      : 'warn';
}

export function renderRegistryPage(input: { agents: Agent[]; tools: Tool[]; runs: Run[] }): string {
  const agentsById = new Map(input.agents.map((agent) => [agent.id, agent]));
  const activeAgents = input.agents.filter((agent) => agent.status === 'active').length;
  const activeTools = input.tools.filter((tool) => tool.status === 'active').length;

  const agentRows = input.agents
    .map(
      (agent) => `<tr>
        <td><strong>${escapeHtml(agent.key)}</strong><span>${escapeHtml(formatVersion(agent.version))}</span></td>
        <td><span class="pill ${statusClass(agent.status)}">${escapeHtml(agent.status)}</span></td>
        <td>${escapeHtml(agent.description ?? '-')}</td>
        <td>${agent.capabilities.map((capability) => `<code>${escapeHtml(capability)}</code>`).join(' ')}</td>
        <td>${formatDate(agent.createdAt)}</td>
      </tr>`,
    )
    .join('');

  const toolRows = input.tools
    .map(
      (tool) => `<tr>
        <td><strong>${escapeHtml(tool.key)}</strong><span>${escapeHtml(formatVersion(tool.version))}</span></td>
        <td><span class="pill ${statusClass(tool.status)}">${escapeHtml(tool.status)}</span></td>
        <td><span class="pill risk-${escapeHtml(tool.risk)}">${escapeHtml(tool.risk)}</span></td>
        <td>${tool.scopes.map((scope) => `<code>${escapeHtml(scope)}</code>`).join(' ')}</td>
        <td>${escapeHtml(tool.description ?? '-')}</td>
      </tr>`,
    )
    .join('');

  const runRows = input.runs
    .map((run) => {
      const agent = run.agentId ? agentsById.get(run.agentId) : undefined;
      const cardIdentifier = run.cardIdentifier ?? run.linearIssueIdentifier;
      return `<tr>
        <td><strong>${escapeHtml(cardIdentifier)}</strong><span>${escapeHtml(run.title)}</span></td>
        <td><span class="pill ${statusClass(run.status)}">${escapeHtml(run.status)}</span></td>
        <td>${agent ? escapeHtml(`${agent.key} ${formatVersion(agent.version)}`) : '-'}</td>
        <td>${escapeHtml(run.verdict ?? '-')}</td>
        <td>${formatDate(run.createdAt)}</td>
      </tr>`;
    })
    .join('');

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Agent Platform Registry</title>
  <style>
    :root { color-scheme: light; --bg:#f7f8fa; --text:#1f2937; --muted:#667085; --line:#d9dee7; --panel:#ffffff; --ok:#0f766e; --warn:#b45309; --bad:#b91c1c; }
    * { box-sizing: border-box; }
    body { margin: 0; font: 14px/1.45 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--text); background: var(--bg); }
    header { padding: 24px 28px 16px; border-bottom: 1px solid var(--line); background: var(--panel); }
    h1 { margin: 0; font-size: 24px; font-weight: 700; letter-spacing: 0; }
    h2 { margin: 0 0 12px; font-size: 16px; letter-spacing: 0; }
    main { padding: 20px 28px 32px; display: grid; gap: 18px; }
    .summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
    .metric, section { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; }
    .metric { padding: 14px 16px; }
    .metric strong { display: block; font-size: 24px; line-height: 1.1; }
    .metric span, td span { color: var(--muted); display: block; margin-top: 2px; }
    section { padding: 16px; overflow: auto; }
    table { width: 100%; border-collapse: collapse; min-width: 760px; }
    th { color: var(--muted); font-size: 12px; font-weight: 600; text-align: left; border-bottom: 1px solid var(--line); padding: 8px; }
    td { border-bottom: 1px solid #edf0f5; padding: 10px 8px; vertical-align: top; }
    tr:last-child td { border-bottom: 0; }
    code { display: inline-block; margin: 0 4px 4px 0; padding: 2px 6px; border: 1px solid var(--line); border-radius: 5px; background: #f3f5f8; color: #344054; font-size: 12px; }
    .pill { display: inline-flex; align-items: center; height: 24px; padding: 0 8px; border-radius: 999px; font-size: 12px; font-weight: 650; background: #eef2f6; color: #344054; }
    .pill.ok { background: #e6f6f3; color: var(--ok); }
    .pill.warn { background: #fff4df; color: var(--warn); }
    .pill.muted { background: #eef2f6; color: var(--muted); }
    .risk-dangerous { background: #fee4e2; color: var(--bad); }
    .risk-caution { background: #fff4df; color: var(--warn); }
    .risk-safe { background: #e6f6f3; color: var(--ok); }
    @media (max-width: 780px) { header, main { padding-left: 14px; padding-right: 14px; } .summary { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <header><h1>Agent Platform Registry</h1></header>
  <main>
    <div class="summary">
      <div class="metric"><strong>${input.agents.length}</strong><span>agentes registrados</span></div>
      <div class="metric"><strong>${activeAgents}</strong><span>agentes ativos</span></div>
      <div class="metric"><strong>${activeTools}</strong><span>tools ativas</span></div>
    </div>
    <section>
      <h2>Agentes</h2>
      <table>
        <thead><tr><th>Agente</th><th>Status</th><th>Descrição</th><th>Capacidades</th><th>Criado em</th></tr></thead>
        <tbody>${agentRows || '<tr><td colspan="5">Nenhum agente registrado.</td></tr>'}</tbody>
      </table>
    </section>
    <section>
      <h2>Tools</h2>
      <table>
        <thead><tr><th>Tool</th><th>Status</th><th>Risco</th><th>Escopos</th><th>Descrição</th></tr></thead>
        <tbody>${toolRows || '<tr><td colspan="5">Nenhuma tool registrada.</td></tr>'}</tbody>
      </table>
    </section>
    <section>
      <h2>Runs Recentes</h2>
      <table>
        <thead><tr><th>Issue</th><th>Status</th><th>Agente</th><th>Critic</th><th>Criado em</th></tr></thead>
        <tbody>${runRows || '<tr><td colspan="5">Nenhum run recente.</td></tr>'}</tbody>
      </table>
    </section>
  </main>
</body>
</html>`;
}

registryRoute.get('/registry', async (c) => {
  const [agents, tools, runs] = await Promise.all([listAgents(), listTools(), listRuns(25)]);
  return c.html(renderRegistryPage({ agents, tools, runs }));
});
