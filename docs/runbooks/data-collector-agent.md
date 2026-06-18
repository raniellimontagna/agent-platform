# Data Collector Agent

`data-collector-agent` é o agente planejado para pesquisa e coleta de dados
públicos que alimentam outros agentes, especialmente o `landing-page-agent`.

## Como selecionar

Em uma issue Linear:

- adicione `ai-ready`;
- adicione `agent:data-collector`;
- aprove normalmente com `approved` quando o plano estiver bom.

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

## Tools planejadas

As tools foram adicionadas ao Tool Registry como metadado:

- `firecrawl`: extração/crawling público por API.
- `playwright`: páginas dinâmicas, screenshots e inspeção visual.
- `scrapling`: HTTP scraping, páginas JS e crawling controlado.
- `python`: scripts de coleta/normalização.

Nesta etapa, essas tools ainda não entram no `AGENT_COMMAND_ALLOWLIST` do runner.
Isso evita habilitar execução ampla antes de termos política e sandbox específicos
para coleta.

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

- Criar integração real com Firecrawl.
- Adicionar modo Playwright controlado para screenshots e páginas dinâmicas.
- Definir artifacts de saída para research packs.
- Criar policy/allowlist específica para comandos de scraping.
- Conectar research packs ao `landing-page-agent`.
