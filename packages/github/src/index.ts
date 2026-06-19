export interface RepoRef {
  owner: string;
  repo: string;
}

export interface CreatePullRequestArgs {
  /** Branch de origem (head), ex.: `agent/mac-49-titulo`. */
  head: string;
  /** Branch de destino (base), ex.: `main`. */
  base: string;
  title: string;
  body: string;
  /** Abre como Draft (default: true). */
  draft?: boolean;
  /** Repo alvo. Ausente = repo default do gateway. */
  repo?: RepoRef;
}

export interface PullRequest {
  number: number;
  url: string;
}

export interface GithubGateway {
  createPullRequest(args: CreatePullRequestArgs): Promise<PullRequest>;
  mergePullRequest(args: {
    number: number;
    method?: 'merge' | 'squash' | 'rebase';
    repo?: RepoRef;
  }): Promise<void>;
  deleteBranch(branch: string, repo?: RepoRef): Promise<void>;
  createRepository(input: {
    owner: string;
    name: string;
    private?: boolean;
    description?: string;
    template?: RepoRef;
  }): Promise<{ fullName: string; htmlUrl: string; created: boolean }>;
}

/**
 * Extrai owner/repo de uma URL de clone do GitHub.
 * Aceita `https://github.com/owner/repo(.git)` (com ou sem credencial embutida).
 */
export function parseRepoRef(repoUrl: string): RepoRef {
  const match = repoUrl.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
  if (!match?.[1] || !match[2]) {
    throw new Error(`não consegui extrair owner/repo de: ${repoUrl}`);
  }
  return { owner: match[1], repo: match[2] };
}

/** Extrai owner/repo de `owner/repo`. */
export function parseRepoFullName(fullName: string): RepoRef {
  const match = fullName.trim().match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (!match?.[1] || !match[2]) {
    throw new Error(`repo inválido, esperado owner/repo: ${fullName}`);
  }
  return { owner: match[1], repo: match[2] };
}

/**
 * Wrapper mínimo sobre a REST API do GitHub: só abrir PR (MAC-26). Usa fetch e
 * um Personal Access / App token via header de autorização.
 */
export function createGithubGateway(token: string, repo: RepoRef): GithubGateway {
  const repoApiBase = (target = repo) =>
    `https://api.github.com/repos/${target.owner}/${target.repo}`;
  const headers = {
    authorization: `Bearer ${token}`,
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    'content-type': 'application/json',
    'user-agent': 'agent-platform',
  };
  const parseCreatedRepo = async (res: Response) => {
    const data = (await res.json()) as { full_name: string; html_url: string };
    return { fullName: data.full_name, htmlUrl: data.html_url, created: true };
  };

  return {
    async createPullRequest({ head, base, title, body, draft = true, repo: targetRepo }) {
      const res = await fetch(`${repoApiBase(targetRepo)}/pulls`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ head, base, title, body, draft }),
      });

      if (!res.ok) {
        throw new Error(`GitHub respondeu ${res.status}: ${await res.text()}`);
      }

      const data = (await res.json()) as { number: number; html_url: string };
      return { number: data.number, url: data.html_url };
    },
    async mergePullRequest({ number, method = 'squash', repo: targetRepo }) {
      const res = await fetch(`${repoApiBase(targetRepo)}/pulls/${number}/merge`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ merge_method: method }),
      });
      if (!res.ok) throw new Error(`GitHub merge respondeu ${res.status}: ${await res.text()}`);
    },
    async deleteBranch(branch, targetRepo) {
      const res = await fetch(
        `${repoApiBase(targetRepo)}/git/refs/heads/${encodeURIComponent(branch)}`,
        {
          method: 'DELETE',
          headers,
        },
      );
      // 404/422 = ref já removida → tolerar.
      if (!res.ok && res.status !== 404 && res.status !== 422) {
        throw new Error(`GitHub deleteBranch respondeu ${res.status}: ${await res.text()}`);
      }
    },
    async createRepository(input) {
      if (input.template) {
        const res = await fetch(`${repoApiBase(input.template)}/generate`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            owner: input.owner,
            name: input.name,
            private: input.private ?? true,
            description: input.description,
            include_all_branches: false,
          }),
        });
        if (res.status === 422) {
          return {
            fullName: `${input.owner}/${input.name}`,
            htmlUrl: `https://github.com/${input.owner}/${input.name}`,
            created: false,
          };
        }
        if (!res.ok) {
          throw new Error(
            `GitHub create from template respondeu ${res.status}: ${await res.text()}`,
          );
        }
        return parseCreatedRepo(res);
      }

      const res = await fetch(`https://api.github.com/orgs/${input.owner}/repos`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: input.name,
          private: input.private ?? true,
          description: input.description,
          auto_init: true,
        }),
      });
      if (res.status === 422) {
        return {
          fullName: `${input.owner}/${input.name}`,
          htmlUrl: `https://github.com/${input.owner}/${input.name}`,
          created: false,
        };
      }
      if (!res.ok) {
        throw new Error(`GitHub create repo respondeu ${res.status}: ${await res.text()}`);
      }
      return parseCreatedRepo(res);
    },
  };
}
