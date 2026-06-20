# Landing Page Agent

`landing-page-agent` é o primeiro agente especializado de produto do
agent-platform. Ele usa o mesmo fluxo operacional do `coder-agent`, mas recebe
skills versionadas no codegen para construir landing pages prontas em pouco
tempo.

## Como selecionar

Em um card Plane:

- adicione `ai-ready`;
- adicione `agent:landing-page`;
- aprove normalmente com `approved` quando o plano estiver bom.

Sem `agent:landing-page`, o fluxo continua usando `coder-agent`.
Cards Linear ainda são aceitos apenas no provider legado/opcional.

## Skills atuais

O agente carrega o pacote definido em `agent-skills/registry.json`:

- `landing-page-production`;
- `frontend-design`;
- `ui-ux-pro-max`;
- `accessibility-wcag`;
- `astro-react-landing`;
- `seo-page`;
- `biome-formatting`;
- `gsap-motion`;
- `higgsfield-media-generation`.

Essas skills orientam o runner/codegen a:

- entregar uma primeira tela utilizável;
- priorizar hero, proposta de valor, CTA, prova/benefícios e conversão final;
- usar asset visual quando o stack permitir;
- garantir responsividade mobile/desktop;
- aplicar direção visual forte sem perder clareza de mensagem;
- preservar acessibilidade WCAG 2.2 AA básica: semântica, foco, contraste,
  teclado, labels, target size e reduced motion;
- usar Astro + React como stack preferencial para LPs do zero;
- incluir SEO técnico/on-page/schema quando o stack permitir;
- validar formatação/lint pelo Biome do repo;
- planejar e usar assets gerados por Higgsfield quando houver MCP/CLI
  autenticado, mantendo fallback explícito quando não houver;
- evitar página genérica, paleta de uma única cor, excesso de cards e sobreposição
  de texto;
- seguir componentes e padrões existentes do app;
- passar a validação padrão do repo.

Veja também `docs/runbooks/agent-skills.md`.

## Limites atuais

- Ainda usa o mesmo grafo de execução (`planning -> coding -> reviewing -> PR`).
- Não executa Higgsfield automaticamente enquanto o runner não tiver MCP/CLI
  autenticado por OAuth de forma persistente. A skill já orienta prompts,
  slots, nomes de arquivos, fallback e integração dos assets quando a tool
  estiver disponível.
- Não faz deploy automático da LP.
- `gsap-motion` só deve ser aplicado quando a dependência existir ou puder ser
  adicionada com segurança.
- Astro + React é o padrão para LPs novas, mas o agente ainda deve respeitar o
  stack real do repositório quando estiver editando um app existente.
- A skill `landing-page-production` é a orquestradora do pacote: ela deve
  equilibrar impacto visual, UX, acessibilidade, SEO, motion e validação.

## Próximas evoluções

- Criar eval específico para landing pages verificando estrutura mínima de LP.
- Adicionar critic especializado de UX/conversão.
- Permitir geração de asset visual quando o card pedir explicitamente.
- Criar integração runtime para Higgsfield: autenticação OAuth persistida no
  runner, comandos/MCP controlados por policy, artifact store para mídia gerada
  e possível `media-generation-agent` dedicado para imagens/vídeos/animações.
