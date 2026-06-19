# Higgsfield Media Generation

Higgsfield entra no agent-platform como capacidade de mídia generativa para
sites: imagens, vídeos curtos, loops, assets de campanha, product shots,
storyboards e referências visuais para animações.

## Status atual

- Skill local versionada: `agent-skills/higgsfield-media-generation/SKILL.md`.
- Mapeada inicialmente para `landing-page-agent`.
- Tool registrada no Tool Registry como `higgsfield` (`risk: dangerous`) porque
  envolve rede, OAuth, geração externa e escrita de assets.
- CLI `@higgsfield/cli` instalada na imagem do runner/sandbox.
- Comandos `higgsfield` e `higgs` liberados no `AGENT_COMMAND_ALLOWLIST`.
- Auth persistente montado em `HIGGSFIELD_HOME` (`/srv/agent-runners/higgsfield`
  por padrão) e repassado para sandboxes via `HOME`, `XDG_CONFIG_HOME` e
  `HIGGSFIELD_HOME`.
- Falta autenticar a conta Higgsfield no ambiente persistente.

## Fonte externa

A documentação pública do Higgsfield recomenda:

- CLI: `npm install -g @higgsfield/cli`
- Login: `higgsfield auth login`
- Skills para agentes: `npx skills add higgsfield-ai/skills`
- Comandos principais: `auth`, `account`, `workspace`, `model`, `generate`,
  `upload`, `soul-id`, `marketing-studio`.

O ponto operacional importante é que Higgsfield usa autenticação por conta/OAuth,
não uma variável simples de API key. Por isso o estado autenticado precisa ficar
fora dos worktrees efêmeros, no volume `HIGGSFIELD_HOME`.

## Login operacional

Depois do deploy do runner:

```bash
rtk ssh -o StrictHostKeyChecking=no runner@10.10.0.12
docker exec -it runners-runner-api-1 sh
HOME=/srv/agent-runners/higgsfield \
XDG_CONFIG_HOME=/srv/agent-runners/higgsfield/.config \
HIGGSFIELD_HOME=/srv/agent-runners/higgsfield \
higgsfield auth login
```

Depois de autorizar no navegador, validar:

```bash
HOME=/srv/agent-runners/higgsfield \
XDG_CONFIG_HOME=/srv/agent-runners/higgsfield/.config \
HIGGSFIELD_HOME=/srv/agent-runners/higgsfield \
higgsfield account

HOME=/srv/agent-runners/higgsfield \
XDG_CONFIG_HOME=/srv/agent-runners/higgsfield/.config \
HIGGSFIELD_HOME=/srv/agent-runners/higgsfield \
higgsfield model list --json
```

## Uso no landing-page-agent

Quando a issue pedir mídia visual, o agente deve:

- decidir primeiro o papel da mídia na conversão;
- produzir um asset brief com tipo, propósito, prompt, requisitos de saída e
  fallback;
- usar Higgsfield somente se houver MCP/CLI autenticado disponível;
- salvar assets gerados no padrão do repo, nunca hotlinkar URL temporária;
- configurar dimensões, poster/fallback, `alt`, lazy loading e reduced motion;
- manter uma versão boa da página mesmo sem geração externa.

## Próxima integração runtime

Para transformar isso em tool executável:

1. Concluir login OAuth no runner.
2. Validar `higgsfield account` e `higgsfield model list --json` dentro de um
   job sandbox.
3. Escolher se a interface interna fica em CLI direto ou MCP Higgsfield.
4. Criar artifact store para imagens/vídeos gerados e metadados de prompt.
5. Expor uma interface interna de tool, por exemplo:
   - `media.generate_image`
   - `media.generate_video`
   - `media.upload_reference`
   - `media.list_generations`
6. Só depois criar um `media-generation-agent` dedicado, reutilizável por
   landing pages, social posts, ads e conteúdo de produto.

Até a autenticação estar concluída, a skill deve orientar planos e prompts, mas
não prometer assets gerados quando a conta Higgsfield não estiver disponível.
