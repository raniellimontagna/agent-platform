import { describe, expect, it } from 'vitest';
import { buildDockerRunArgs } from './sandbox.js';

const env = {
  AGENT_SANDBOX_BACKEND: 'docker' as const,
  AGENT_SANDBOX_IMAGE: 'agent-platform/worker-code:latest',
  AGENT_SANDBOX_NETWORK: 'bridge',
  AGENT_SANDBOX_CPUS: 1.5,
  AGENT_SANDBOX_MEMORY: '1536m',
  AGENT_SANDBOX_PIDS_LIMIT: 256,
};

describe('buildDockerRunArgs', () => {
  it('monta container efêmero com worktree montado e sem secrets do worker', () => {
    const args = buildDockerRunArgs({
      command: 'pnpm test',
      cwd: '/srv/agent-runners/worktrees/run-1',
      runId: 'MAC-28/Run 1',
      env,
    });

    expect(args.slice(0, 2)).toEqual(['run', '--rm']);
    expect(args).toContain('--name');
    expect(args[args.indexOf('--name') + 1]).toMatch(/^agent-job-mac-28-run-1-[a-f0-9]{8}$/);
    expect(args).toContain('--network');
    expect(args[args.indexOf('--network') + 1]).toBe('bridge');
    expect(args).toContain('--cpus');
    expect(args[args.indexOf('--cpus') + 1]).toBe('1.5');
    expect(args).toContain('--memory');
    expect(args[args.indexOf('--memory') + 1]).toBe('1536m');
    expect(args).toContain('--pids-limit');
    expect(args[args.indexOf('--pids-limit') + 1]).toBe('256');
    expect(args).toContain('--workdir');
    expect(args[args.indexOf('--workdir') + 1]).toBe('/srv/agent-runners/worktrees/run-1');
    expect(args).toContain('--volume');
    expect(args[args.indexOf('--volume') + 1]).toBe(
      '/srv/agent-runners/worktrees/run-1:/srv/agent-runners/worktrees/run-1',
    );
    expect(args).toContain('CI=true');
    expect(args.slice(-4)).toEqual([
      'agent-platform/worker-code:latest',
      'bash',
      '-lc',
      'pnpm test',
    ]);
    expect(args.join(' ')).not.toContain('RUNNER_AUTH_TOKEN');
    expect(args.join(' ')).not.toContain('LITELLM_API_KEY');
  });
});
