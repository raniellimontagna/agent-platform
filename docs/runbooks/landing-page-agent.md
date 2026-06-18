# Landing Page Agent

`landing-page-agent` é o primeiro agente especializado de produto do
agent-platform. Ele usa o mesmo fluxo operacional do `coder-agent`, mas recebe
instruções específicas no codegen para construir landing pages prontas em pouco
tempo.

## Como selecionar

Em uma issue Linear:

- adicione `ai-ready`;
- adicione `agent:landing-page`;
- aprove normalmente com `approved` quando o plano estiver bom.

Sem `agent:landing-page`, o fluxo continua usando `coder-agent`.

## Especialização atual

O agente injeta no runner/codegen regras para:

- entregar uma primeira tela utilizável;
- priorizar hero, proposta de valor, CTA, prova/benefícios e conversão final;
- usar asset visual quando o stack permitir;
- garantir responsividade mobile/desktop;
- evitar página genérica, paleta de uma única cor, excesso de cards e sobreposição
  de texto;
- seguir componentes e padrões existentes do app;
- passar a validação padrão do repo.

## Limites atuais

- Ainda usa o mesmo grafo de execução (`planning -> coding -> reviewing -> PR`).
- Não gera imagens via ferramenta externa automaticamente.
- Não faz deploy automático da LP.

## Próximas evoluções

- Criar eval específico para landing pages verificando estrutura mínima de LP.
- Adicionar critic especializado de UX/conversão.
- Permitir geração de asset visual quando a issue pedir explicitamente.
