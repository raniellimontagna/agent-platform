# Data Collector Agent

`data-collector-agent` é o agente planejado para pesquisa e coleta de dados
públicos que alimentam outros agentes, especialmente o `landing-page-agent`.

## Como selecionar

Em uma issue Linear:

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

- extrai até 5 URLs explícitas do título, descrição e plano da issue;
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

Limites desta fase: apenas scrape de páginas explícitas; sem crawl amplo, sem
browser, sem screenshot e sem execução de comandos de scraping no allowlist.

## Tools planejadas

As tools foram adicionadas ao Tool Registry como metadado:

- `firecrawl`: extração/crawling público por API.
- `playwright`: páginas dinâmicas, screenshots e inspeção visual.
- `scrapling`: HTTP scraping, páginas JS e crawling controlado.
- `python`: scripts de coleta/normalização.
- `instagram-public-research`: skill de coleta segura para fontes públicas,
  Graph API autorizada e exports first-party de Instagram.

Nesta etapa, Firecrawl roda via integração controlada no worker. As demais tools
ainda não entram no `AGENT_COMMAND_ALLOWLIST` do runner. Isso evita habilitar
execução ampla antes de termos política e sandbox específicos para coleta.

## Política

- Preferir páginas públicas e APIs oficiais.
- Respeitar robots.txt, termos do site e escopo da issue.
- Não contornar paywall, login, captcha ou controles de acesso.
- Não coletar dados pessoais sensíveis sem escopo legal explícito.
- Rate-limit e crawls pequenos por padrão.
- Separar fatos de inferências.
- Salvar fontes e limitações junto do resultado.

## Avaliação da skill Scrapling

A skill pública de Scrapling é útil como referência técnica porque cobre HTTP
fetching, páginas renderizadas por JS, spider crawling e integração Python/CLI.
O ponto que exige cuidado é o uso de stealth/anti-bot/Cloudflare: isso fica fora
do padrão do agent-platform e só deve ser considerado com aprovação explícita e
compliance com termos do site.

## Próximas etapas

- Adicionar modo Playwright controlado para screenshots e páginas dinâmicas.
- Definir artifacts de saída para research packs.
- Criar policy/allowlist específica para comandos de scraping.
- Conectar research packs ao `landing-page-agent`.
