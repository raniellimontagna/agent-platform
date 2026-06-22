# Agent Skills

O diretório `agent-skills/` contém skills versionadas do agent-platform. Elas
são carregadas pelo `worker-code` em tempo de execução e injetadas no prompt do
codegen conforme o agente selecionado.

## Estrutura

- `agent-skills/registry.json`: mapeia agentes para skills.
- UI LAN do registry: `http://192.168.0.10:8088/registry` proxy para o
  orchestrator via `infra/systemd/agent-registry-proxy.*`.
- `agent-skills/<skill>/SKILL.md`: instruções da skill, com frontmatter `name`
  e `description`.

Exemplo:

```json
{
  "agentSkills": {
    "landing-page-agent": ["landing-page-production", "frontend-design"]
  }
}
```

## Como adicionar uma skill

1. Crie `agent-skills/<nome>/SKILL.md`.
2. Use nome em lowercase com hífens.
3. Escreva `description` com os gatilhos de uso.
4. Mantenha o corpo curto e operacional.
5. Adicione a skill em `agent-skills/registry.json`.
6. Mapeie a skill para um agente em `agentSkills`.
7. Cubra a seleção/injeção com testes em `apps/worker-code`.
8. Rode `rtk pnpm verify`.

## Boas práticas

- Preferir skills locais revisadas no repo a download dinâmico em produção.
- Não executar scripts de skills externas sem revisão.
- Separar conhecimento por skill quando isso ajuda o agente a compor funções.
- Manter fallback seguro: se uma skill não existir, o job não deve quebrar por
  causa do catálogo.

## Pipeline roles

O `coder-agent` permanece como chave compativel do pipeline LangGraph atual.
Novas evolucoes devem tratar esse fluxo como um pipeline de entrega de software
composto por roles:

- `planner`: gera plano e approval reasons.
- `coder`: aplica plano no runner e valida mudancas.
- `critic`: revisa diff e decide recode ou PR.
- `pr`: abre PR e avalia auto-merge.
- `reporter`: publica resumo final no card.

O catalogo pode expor `software-delivery-pipeline` como identidade mais clara do
pipeline, sem mudar labels existentes nem separar a execucao fisica do LangGraph.

## Skills atuais

- `landing-page-production`: contrato base para landing pages completas.
- `frontend-design`: qualidade visual, layout, responsividade e estados de UI.
- `ui-ux-pro-max`: direção visual, hierarquia, interação, motion e polish.
- `accessibility-wcag`: WCAG 2.2 AA, semântica, foco, contraste e teclado.
- `astro-react-landing`: padrão Astro + React para LPs do zero.
- `seo-page`: SEO técnico, on-page, schema, conteúdo e GEO para páginas.
- `biome-formatting`: formatação/lint com Biome e comandos do monorepo.
- `gsap-motion`: motion com GSAP quando o stack permitir.
- `higgsfield-media-generation`: planejamento e uso de mídia gerada via
  Higgsfield MCP/CLI para imagens, vídeos, loops, assets de campanha e fallback
  web quando a geração não estiver disponível.
- `research-data-collection`: coleta pública com fontes, evidências, política de
  scraping e saída estruturada para agentes downstream.
