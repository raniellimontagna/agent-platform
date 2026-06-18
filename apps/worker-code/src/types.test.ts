import { describe, expect, it } from 'vitest';
import { jobSchema } from './types.js';

describe('jobSchema', () => {
  it('aceita agente especializado e capabilities no payload', () => {
    const job = jobSchema.parse({
      runId: '00000000-0000-4000-8000-000000000000',
      issueIdentifier: 'MAC-91',
      repoUrl: 'git@example.com:repo.git',
      branch: 'agent/mac-91',
      agentKey: 'landing-page-agent',
      agentCapabilities: ['landing-page', 'frontend'],
    });

    expect(job.agentKey).toBe('landing-page-agent');
    expect(job.agentCapabilities).toEqual(['landing-page', 'frontend']);
  });

  it('mantém agentCapabilities vazio por padrão para payloads antigos', () => {
    const job = jobSchema.parse({
      runId: '00000000-0000-4000-8000-000000000000',
      issueIdentifier: 'MAC-1',
      repoUrl: 'git@example.com:repo.git',
      branch: 'agent/mac-1',
    });

    expect(job.agentKey).toBeUndefined();
    expect(job.agentCapabilities).toEqual([]);
  });
});
