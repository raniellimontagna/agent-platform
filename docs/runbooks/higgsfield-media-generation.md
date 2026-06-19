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
- Conta Higgsfield autenticada no runner e validada por job sandbox com
  `higgsfield account status` e `higgsfield model list --json`.

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

## Modelos preferenciais

A página de pricing do Higgsfield informa que o acesso unlimited/free-gens vale
para modelos específicos do card do plano, não para todo o catálogo. Para
landing pages, preferir modelos prompt-first cobertos por esse grupo antes de
usar `image_auto` ou modelos premium que consomem créditos:

- `seedream_v5_lite`
- `flux_2`
- `seedream_v4_5`
- `nano_banana`
- `kling_omni_image`
- `gpt_image_2`

Para cenas com identidade/personagem/local consistente, usar os modelos Soul ou
Cinema quando fizer sentido:

- `text2image_soul_v2`
- `soul_cinematic`
- `soul_location`
- `soul_cinema_studio`

Antes de criar uma geração fora dessa lista, estimar custo:

```bash
higgsfield generate cost <model> --prompt "..." --aspect_ratio 16:9 --json
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

1. Escolher se a interface interna fica em CLI direto ou MCP Higgsfield.
2. Implementar wrapper interno que escolha modelos preferenciais e rode `cost`
   antes de geração paga.
3. Criar artifact store para imagens/vídeos gerados e metadados de prompt.
4. Expor uma interface interna de tool, por exemplo:
   - `media.generate_image`
   - `media.generate_video`
   - `media.upload_reference`
   - `media.list_generations`
5. Só depois criar um `media-generation-agent` dedicado, reutilizável por
   landing pages, social posts, ads e conteúdo de produto.

Se a conta Higgsfield estiver indisponível ou o modelo preferencial falhar, a
skill deve cair para prompts/slots/fallbacks e não prometer asset gerado.
