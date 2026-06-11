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
}

export interface PullRequest {
  number: number;
  url: string;
}

export interface GithubGateway {
  createPullRequest(args: CreatePullRequestArgs): Promise<PullRequest>;
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

/**
 * Wrapper mínimo sobre a REST API do GitHub: só abrir PR (MAC-26). Usa fetch e
 * um Personal Access / App token via header de autorização.
 */
export function createGithubGateway(token: string, repo: RepoRef): GithubGateway {
  const apiBase = `https://api.github.com/repos/${repo.owner}/${repo.repo}`;
  const headers = {
    authorization: `Bearer ${token}`,
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    'content-type': 'application/json',
    'user-agent': 'agent-platform',
  };

  return {
    async createPullRequest({ head, base, title, body, draft = true }) {
      const res = await fetch(`${apiBase}/pulls`, {
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
  };
}
