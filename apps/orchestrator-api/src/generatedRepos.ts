import { type GithubGateway, type RepoRef, parseRepoFullName } from '@agent-platform/github';

export const REPO_CREATE_LABEL = 'repo:create';

export interface GeneratedRepoConfig {
  owner: string;
  allowCreate: boolean;
  template?: string;
}

export interface GeneratedRepoTarget {
  fullName: string;
  repo: RepoRef;
  create: boolean;
}

export function hasRepoCreateLabel(labelNames: string[]): boolean {
  return labelNames.includes(REPO_CREATE_LABEL);
}

export function slugifyRepoName(text: string): string {
  const slug = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || 'landing-page';
}

function directiveValue(description: string, key: string): string | undefined {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = description.match(new RegExp(`^${escaped}\\s*[:=]\\s*(.+?)\\s*$`, 'im'));
  return match?.[1]?.trim();
}

export function resolveGeneratedRepoTarget(input: {
  title: string;
  description: string;
  createRequested: boolean;
  config: GeneratedRepoConfig;
}): GeneratedRepoTarget | undefined {
  const explicit = directiveValue(input.description, 'TARGET_REPO');
  if (explicit) {
    const repo = parseRepoFullName(explicit);
    if (repo.owner !== input.config.owner) {
      throw new Error(
        `TARGET_REPO deve apontar para ${input.config.owner}/*; recebido ${repo.owner}/${repo.repo}`,
      );
    }
    return { fullName: `${repo.owner}/${repo.repo}`, repo, create: input.createRequested };
  }

  if (!input.createRequested) return undefined;

  const name = slugifyRepoName(
    directiveValue(input.description, 'TARGET_REPO_NAME') ?? input.title,
  );
  const repo = { owner: input.config.owner, repo: name };
  return { fullName: `${repo.owner}/${repo.repo}`, repo, create: true };
}

export async function ensureGeneratedRepository(input: {
  github: GithubGateway;
  target: GeneratedRepoTarget;
  description: string;
  config: GeneratedRepoConfig;
}): Promise<{ fullName: string; htmlUrl: string; created: boolean } | undefined> {
  if (!input.target.create) return undefined;
  if (!input.config.allowCreate) {
    throw new Error(
      'Criação de repositórios gerados desabilitada (GENERATED_REPOS_ALLOW_CREATE=false)',
    );
  }

  const template = input.config.template ? parseRepoFullName(input.config.template) : undefined;
  return input.github.createRepository({
    owner: input.target.repo.owner,
    name: input.target.repo.repo,
    private: true,
    description: input.description,
    template,
  });
}
