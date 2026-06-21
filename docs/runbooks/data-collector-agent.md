# Data Collector Agent

`data-collector-agent` é o agente planejado para pesquisa e coleta de dados
públicos que alimentam outros agentes, especialmente o `landing-page-agent`.

## Como selecionar

Em um card Plane:

- adicione `ai-ready`;
- adicione `agent:data-collector`;
- aprove normalmente com `approved` quando o plano estiver bom.

Para o fluxo completo coleta → landing page, use `workflow:landing-page` em vez
de `agent:data-collector`. Nesse modo o orchestrator roda a coleta primeiro e
encadeia automaticamente o `landing-page-agent` com o artifact `research`.

## Especialização

O agente carrega a skill `research-data-collection`, que orienta o runner/codegen
a produzir pacotes de pesquisa com:

- objetivo e escopo;
- fontes, URL, método de extração e data de acesso;
- fatos extraídos com evidência;
- claims, ofertas, preços, prova, objeções e linguagem do público;
- termos SEO, entidades e lacunas de conteúdo;
- limitações, fontes inacessíveis e nível de confiança;
- recomendações para o agente downstream.

Ele também carrega `instagram-public-research` para tarefas que envolvem
Instagram. Essa skill é deliberadamente restrita a pesquisa pública, dados
first-party autorizados e exports fornecidos pelo usuário. Ela não permite
publicar, responder DMs, deletar comentários, automatizar engajamento ou contornar
login, captcha, rate limits, permissões da Graph API ou termos da plataforma.

## Firecrawl research packs

MAC-94 integra o Firecrawl no runner para o primeiro fluxo real de coleta:

- extrai até 5 URLs explícitas do título, descrição e plano do card;
- chama `POST /v2/scrape` com `formats: ["markdown", "summary"]`;
- gera um `Research Pack` em Markdown com fontes, método, status, resumo,
  extrato e limitações;
- salva o resultado como artifact `research`;
- encerra o run como `completed`, sem revisão de diff e sem Draft PR.

Variáveis do runner:

- `FIRECRAWL_API_KEY`: secret da API. Opcional para boot; obrigatório para jobs
  reais de coleta.
- `FIRECRAWL_BASE_URL`: default `https://api.firecrawl.dev`.
- `FIRECRAWL_TIMEOUT_MS`: default `60000`.
- `SCRAPING_MAX_PAGES`: default `5`.
- `SCRAPING_MAX_OUTPUT_CHARS`: default `20000`.
- `SCRAPING_RATE_LIMIT_PER_MINUTE`: default `6`.

Firecrawl é o padrão para páginas públicas estáticas/crawláveis, quando o card
precisa de Markdown/resumo e não pede browser. Ele só recebe URLs explícitas do
título, descrição ou plano do card.

## Playwright controlado

AGP-9 adiciona um caminho Playwright governado para coleta dinâmica:

- usado apenas quando o card/plano pedir explicitamente Playwright, browser,
  renderização dinâmica ou screenshot;
- navega somente para URLs explícitas e autorizadas pela mesma policy de
  scraping do Firecrawl;
- bloqueia localhost, redes privadas, metadados cloud, hostnames internos,
  downloads e submissões de formulário;
- captura HTML renderizado, texto renderizado e screenshot PNG em base64 dentro
  do artifact `research`;
- falha de forma explícita se a dependência/runtime Playwright não estiver
  instalada no worker.

Variável adicional:

- `PLAYWRIGHT_TIMEOUT_MS`: default `30000`.

Use Playwright quando a página depende de JavaScript para renderizar conteúdo,
quando o objetivo inclui screenshot/evidência visual, ou quando o HTML estático
não contém os dados necessários. Use Firecrawl para coleta textual comum,
conteúdo público crawlável e research packs sem necessidade de browser.

## Tools planejadas

As tools foram adicionadas ao Tool Registry como metadado:

- `firecrawl`: extração/crawling público por API.
- `playwright`: páginas dinâmicas, screenshots e inspeção visual.
- `scrapling`: HTTP scraping, páginas JS e crawling controlado.
- `python`: scripts de coleta/normalização.
- `instagram-public-research`: skill de coleta segura para fontes públicas,
  Graph API autorizada e exports first-party de Instagram.
- `higgsfield`: mídia generativa via MCP/CLI para downstream visual
  (`landing-page-agent`, futuro `media-generation-agent`), condicionada a OAuth
  persistido e policy específica.

Nesta etapa, Firecrawl e Playwright rodam via integrações controladas no worker.
As demais tools ainda não entram no `AGENT_COMMAND_ALLOWLIST` do runner. Isso
evita habilitar execução ampla fora da policy de coleta.

Cards Linear ainda podem ser usados apenas no provider legado/opcional.

## Política

- Preferir páginas públicas e APIs oficiais.
- Respeitar robots.txt, termos do site e escopo da issue.
- Não contornar paywall, login, captcha ou controles de acesso.
- Não coletar dados pessoais sensíveis sem escopo legal explícito.
- Rate-limit e crawls pequenos por padrão.
- Separar fatos de inferências.
- Salvar fontes e limitações junto do resultado.
- Autorizar somente URLs explícitas vindas do card/plano/job.
- Bloquear comandos ou instruções de scraping amplo, recursivo ou "all links".
- Bloquear URLs com credenciais embutidas.
- Bloquear `localhost`, redes privadas/link-local/multicast, hostnames internos
  e endpoints de metadata cloud como `169.254.169.254`.

## Avaliação da skill Scrapling

A skill pública de Scrapling é útil como referência técnica porque cobre HTTP
fetching, páginas renderizadas por JS, spider crawling e integração Python/CLI.
O ponto que exige cuidado é o uso de stealth/anti-bot/Cloudflare: isso fica fora
do padrão do agent-platform e só deve ser considerado com aprovação explícita e
compliance com termos do site.

## Próximas etapas

- Validar um E2E real com `workflow:landing-page` usando URL pública explícita,
  confirmando que o run de coleta salva o artifact `research` e que o segundo
  run recebe esse pacote como contexto do `landing-page-agent`.
