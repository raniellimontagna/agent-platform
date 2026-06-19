# Research to Landing Page Workflow

O workflow composto cria uma landing page a partir de pesquisa pública da empresa.
Ele encadeia dois agentes na mesma issue Linear:

1. `data-collector-agent` coleta dados públicos e salva artifact `research`.
2. O orchestrator cria automaticamente um segundo run com `landing-page-agent`.
3. O segundo run recebe o research pack como contexto extra do planner.
4. Só a etapa final de landing page abre Draft PR.

## Como disparar

Na issue Linear:

- inclua `ai-ready`;
- inclua `workflow:landing-page`;
- para criar um repo final novo, inclua também `repo:create`;
- coloque URLs públicas da empresa, produto, Instagram público, LinkedIn público,
  página de preços, docs ou referências relevantes;
- opcionalmente informe `TARGET_REPO_NAME: nome-do-repo` na descrição;
- para usar um repo já existente, informe `TARGET_REPO: attodevlabs/nome-do-repo`;
- aprove o plano inicial com `approved`.

Não adicione `agent:landing-page` nem `agent:data-collector`; a label de workflow
já seleciona o coletor na primeira etapa e o landing-page-agent na continuação.

## Comportamento esperado

- O primeiro run termina como `completed`, sem PR, com artifact `research`.
- O orchestrator comenta que iniciou a etapa de landing page.
- Com `repo:create`, o orchestrator cria o repo final em `attodevlabs` a partir
  de `GENERATED_REPOS_TEMPLATE` e abre o PR nesse repo.
- Sem `repo:create` e sem `TARGET_REPO`, o comportamento permanece no repo
  default do deploy.
- O segundo run é `autoApprove=true`; se o planner detectar motivo crítico, ele
  ainda ficará aguardando aprovação humana.
- A etapa de landing page usa o research pack como fonte principal de copy,
  prova, objeções, SEO, visual e estrutura.

## Limites

- Apenas workflow fixo de duas etapas nesta fase.
- A coleta continua limitada a URLs explícitas e Firecrawl single-page.
- Não há UI para montar workflows arbitrários.
- Dados privados ou autenticados exigem export/API autorizada e continuam fora do
  scraping público.
