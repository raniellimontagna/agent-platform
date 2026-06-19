# Higgsfield Media Generation

Higgsfield entra no agent-platform como capacidade de mídia generativa para
sites: imagens, vídeos curtos, loops, assets de campanha, product shots,
storyboards e referências visuais para animações.

## Status atual

- Skill local versionada: `agent-skills/higgsfield-media-generation/SKILL.md`.
- Mapeada inicialmente para `landing-page-agent`.
- Tool registrada no Tool Registry como `higgsfield` (`risk: dangerous`) porque
  envolve rede, OAuth, geração externa e escrita de assets.
- Ainda não há execução automática no runner.

## Fonte externa

A documentação pública do Higgsfield recomenda:

- CLI: `npm install -g @higgsfield/cli`
- Login: `higgsfield auth login`
- Skills para agentes: `npx skills add higgsfield-ai/skills`
- Comandos principais: `auth`, `account`, `workspace`, `model`, `generate`,
  `upload`, `soul-id`, `marketing-studio`.

O ponto operacional importante é que Higgsfield usa autenticação por conta/OAuth,
não uma variável simples de API key. Por isso a integração de runtime precisa de
estado autenticado persistente no runner ou MCP conectado.

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

1. Escolher transporte: MCP Higgsfield ou CLI no runner.
2. Fazer login OAuth em ambiente controlado e persistir o estado de auth fora dos
   worktrees efêmeros.
3. Definir allowlist/policy específica para comandos Higgsfield ou tools MCP.
4. Criar artifact store para imagens/vídeos gerados e metadados de prompt.
5. Expor uma interface interna de tool, por exemplo:
   - `media.generate_image`
   - `media.generate_video`
   - `media.upload_reference`
   - `media.list_generations`
6. Só depois criar um `media-generation-agent` dedicado, reutilizável por
   landing pages, social posts, ads e conteúdo de produto.

Até essa etapa, a skill deve orientar planos e prompts, mas não prometer assets
gerados quando a autenticação Higgsfield não estiver disponível.
