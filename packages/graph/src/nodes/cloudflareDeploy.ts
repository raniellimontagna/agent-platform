import type { LinearGateway } from '@agent-platform/linear';
import type { AgentStateType } from '../state.js';
import type { DispatchFn } from './coder.js';

export interface CloudflareDeployDeps {
  linear: LinearGateway;
  dispatch: DispatchFn;
  resolveRepoUrl?: (targetRepo: string | undefined) => string;
  repoUrl: string;
  baseBranch: string;
  enabled: boolean;
  generatedReposOwner: string;
  deployCommands: string[];
}

export function parseCloudflareDeployUrl(output: string): string | undefined {
  return output.match(/https:\/\/[^\s"'<>]+\.workers\.dev[^\s"'<>]*/)?.[0];
}

export function wranglerNameCommand(workerName: string): string {
  return `pnpm deploy:cloudflare -- --name ${shellArg(workerName)}`;
}

export function cloudflareDeployCommands(commands: string[], workerName: string): string[] {
  return commands.map((command) =>
    command.trim() === 'pnpm deploy:cloudflare' ? wranglerNameCommand(workerName) : command,
  );
}

/**
 * Deploy pós-merge para landing pages geradas. É deliberadamente non-fatal:
 * falha de Cloudflare não deve desfazer merge nem marcar a entrega de código
 * como falha; fica registrada no Linear para ação manual.
 */
export function makeCloudflareDeployNode(deps: CloudflareDeployDeps) {
  return async (state: AgentStateType): Promise<Partial<AgentStateType>> => {
    if (!deps.enabled || !state.autoMerged || !state.targetRepo) return {};
    const [owner, repoName] = state.targetRepo.split('/');
    if (owner !== deps.generatedReposOwner) return {};
    if (!repoName) return {};

    const result = await deps.dispatch({
      runId: state.runId,
      issueIdentifier: state.issueIdentifier,
      repoUrl: deps.resolveRepoUrl?.(state.targetRepo) ?? deps.repoUrl,
      baseBranch: deps.baseBranch,
      branch: deps.baseBranch,
      title: state.title,
      description: state.description,
      plan: '',
      commands: cloudflareDeployCommands(deps.deployCommands, repoName),
      lessons: '',
      reviewFeedback: '',
      checkoutOnly: true,
    });

    const output = (result.commands ?? [])
      .map((command) => [command.stdout, command.stderr].filter(Boolean).join('\n'))
      .filter(Boolean)
      .join('\n');
    const url = parseCloudflareDeployUrl(output);

    if (result.status === 'succeeded') {
      await deps.linear.comment(
        state.issueId,
        [
          '## ☁️ Deploy Cloudflare',
          url
            ? `Publicado em: ${url}`
            : 'Deploy concluído; URL não detectada na saída do Wrangler.',
        ].join('\n\n'),
      );
      return url ? { cloudflareDeployUrl: url } : {};
    }

    await deps.linear.comment(
      state.issueId,
      [
        '## ⚠️ Deploy Cloudflare falhou',
        result.error ? `\`\`\`\n${result.error}\n\`\`\`` : '',
        output ? `\`\`\`\n${output.slice(-2000)}\n\`\`\`` : '',
      ]
        .filter(Boolean)
        .join('\n\n'),
    );
    return {};
  };
}

function shellArg(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '') || 'landing-page';
}
