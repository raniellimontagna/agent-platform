import { env } from '../env.js';
import { runCommand } from './worktree.js';

export interface CommitResult {
  /** Houve mudança e o commit foi criado. */
  committed: boolean;
  /** SHA do commit, quando criado. */
  sha?: string;
}

/** Há mudanças não commitadas no worktree? */
async function hasChanges(dir: string): Promise<boolean> {
  const res = await runCommand('git status --porcelain', dir);
  return res.stdout.trim().length > 0;
}

/**
 * Faz stage de tudo e commita as alterações geradas pelo agente (MAC-17).
 * Configura o autor local. Retorna se houve commit e o SHA.
 */
export async function commitAll(dir: string, message: string): Promise<CommitResult> {
  if (!(await hasChanges(dir))) {
    return { committed: false };
  }

  await runCommand(`git config user.name "${env.GIT_AUTHOR_NAME}"`, dir);
  await runCommand(`git config user.email "${env.GIT_AUTHOR_EMAIL}"`, dir);

  const add = await runCommand('git add -A', dir);
  if (add.exitCode !== 0) {
    throw new Error(`git add failed: ${add.stderr || add.stdout}`);
  }

  // Mensagem via stdin evita problemas de escaping/quoting.
  const commit = await runCommand(`git commit -F - <<'EOF'\n${message}\nEOF`, dir);
  if (commit.exitCode !== 0) {
    throw new Error(`git commit failed: ${commit.stderr || commit.stdout}`);
  }

  const rev = await runCommand('git rev-parse HEAD', dir);
  return { committed: true, sha: rev.stdout.trim() || undefined };
}

/**
 * Envia a branch ao remoto. A credencial já está embutida na URL de clone
 * (x-access-token), então `origin` já está autenticado.
 */
export async function pushBranch(dir: string, branch: string): Promise<void> {
  const push = await runCommand(`git push -u origin ${branch}`, dir);
  if (push.exitCode !== 0) {
    throw new Error(`git push failed: ${push.stderr || push.stdout}`);
  }
}

/**
 * Diff das alterações commitadas vs. a base branch (MAC-18). Trunca para evitar
 * estourar o contexto do Reviewer; o diff bruto fica no PR de qualquer forma.
 */
export async function diffAgainst(
  dir: string,
  baseBranch: string,
  maxChars = 30_000,
): Promise<string> {
  const res = await runCommand(`git diff ${baseBranch}`, dir);
  if (res.exitCode !== 0) return '';
  const out = res.stdout;
  return out.length > maxChars ? `${out.slice(0, maxChars)}\n\n[... diff truncado ...]` : out;
}
