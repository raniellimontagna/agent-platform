import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const deployScript = readFileSync(new URL('./deploy.sh', import.meta.url), 'utf8');

describe('deploy.sh', () => {
  it('blocks placeholder secrets for every service that boots with runtime credentials', () => {
    const ensureEnvStart = deployScript.indexOf('ensure_env()');
    const ensureEnvEnd = deployScript.indexOf('\n}\n\n', ensureEnvStart);
    const ensureEnv = deployScript.slice(ensureEnvStart, ensureEnvEnd);

    expect(ensureEnv).toContain('BLOQUEADO');
    expect(ensureEnv).toMatch(/gateway\|orchestrator\|runners/);
  });

  it('keeps local secret env files out of build-service repository bundles', () => {
    expect(deployScript).toContain('find .');
    expect(deployScript).toContain("-name '.env'");
    expect(deployScript).toContain("-name '.env.*'");
    expect(deployScript).toContain("! -name '.env.example'");
    expect(deployScript).toContain('--files-from -');
  });
});
