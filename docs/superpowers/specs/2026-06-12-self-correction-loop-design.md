# Self-correction loop — fix intra-run (design)

> Spec de design. Data: 2026-06-12. Time `MAC`, projeto *Orquestrador de Agentes com LangGraph*.
> Card: criar novo (provável MAC-54) ou encaixar em MAC-47.

## Problema

O agente é *single-shot*: gera código → valida no sandbox → critic revisa → abre PR.
Quando a validação (`install`/`build`/`test`) falha, ele **pusha e abre um Draft PR
reprovado mesmo assim** — não tenta consertar. Erros triviais e determinísticos
(import faltando, erro de tipo, lint) viram PRs vermelhos que o humano precisa
fechar ou corrigir à mão.

O self-correction loop fecha esse loop **dentro do run**: ao falhar a validação,
realimenta o erro no modelo, regenera os arquivos afetados e revalida — até passar
ou esgotar um teto de tentativas.

Complementa o MAC-23 (Memory Layer): memory aprende *entre* runs; self-correction
conserta *dentro* do run.

## Decisões (do brainstorm)

1. **Gatilho:** apenas falha de **validação** (build/test). Sinal objetivo e barato.
   Reprovação do critic NÃO dispara fix (critic roda depois, no grafo, e segue só
   anotando). Loop vive no **runner**, não no grafo — topologia LangGraph intacta.
2. **Cap:** 2 retries (geração inicial + até 2 correções). Para na 1ª que passa.
   Configurável via env `AGENT_MAX_FIX_ATTEMPTS` (default 2).
3. **Fix dirigido:** passo único. Usa os arquivos que o coder já tocou
   (`filesChanged`) + a saída do comando que falhou; pede a versão corrigida (mesmo
   schema JSON do codegen). Não re-seleciona arquivos, não re-roda os 2 passos.
4. **Retries esgotados:** pusha + abre PR best-effort (estado final, status de
   validação ❌, como hoje). Não regride o comportamento "sempre abre PR".

## Fluxo novo no `runJob` (branch com plano aprovado)

Hoje: `gera → commit → push → valida` (validação não-fatal, pós-push).
Novo: **valida antes de pushar**, com loop de fix, e pusha uma vez o estado final.

```
prepareWorktree
gen = generateAndApplyCode(...)            # tentativa 0 — escreve no worktree
validation = runValidation(commands)       # roda os comandos no worktree (sem push)
attempt = 0
while !validation.passed && attempt < AGENT_MAX_FIX_ATTEMPTS:
    attempt++
    applyFix(llm, dir, gen.filesChanged, validation.failureTail, plan, title)  # reescreve
    cost += fix.costUsd
    validation = runValidation(commands)
# commit do estado final + push UMA vez
commit = commitAll(dir, message)
diff   = diffAgainst(dir, baseBranch)
pushBranch(dir, branch)
testsPassed = validation.passed
commands    = validation.commands          # resultado da validação FINAL
fixAttempts = attempt
return succeeded (pushed = true, best-effort mesmo se !passed)
```

**Green path = zero overhead:** se passa na tentativa 0, o loop não roda,
`fixAttempts = 0`, comportamento idêntico ao atual.

## Componentes

### `apps/worker-code/src/executor/codegen.ts` — `applyFix`

`applyFix({ llm, dir, filesChanged, failureTail, plan, title, log }) → { summary, filesChanged, costUsd }`

Passo único:
- Lê o conteúdo atual dos `filesChanged` do worktree (reusa `readCurrentFiles`).
- Monta `FIX_PROMPT`: "você escreveu ISTO, a validação falhou com ESTE erro,
  produza a versão corrigida preservando o que está certo".
- Chama `completeJson` com o mesmo `responseSchema` (`{ prTitle, summary, files[] }`).
- Reaplica os arquivos no worktree (mesma lógica de escrita do codegen).
- `prTitle` mantém o da geração original; devolve `summary`/`filesChanged`/`costUsd`.

Reusa helpers existentes (`readCurrentFiles`, `completeJson`, `responseSchema`,
escrita de arquivo). Se `codegen.ts` crescer demais, considerar extrair para
`fix.ts` exportando os helpers compartilhados — decisão de implementação.

### `apps/worker-code/src/executor/runJob.ts` — `runValidation` + reestruturação

`runValidation(commands, dir, log) → { passed, commands, failureTail }`
- Roda cada comando via `runGuarded` (mantém a allowlist do MAC-31).
- `passed` = todos exit 0.
- `failureTail` = tail (≈600 chars) do `stderr`/`stdout` do primeiro comando que
  falhou — é o que alimenta o `applyFix`.

Reestrutura a branch-com-plano de `runJob` para o fluxo acima (validar antes de
pushar; loop; push único).

### `apps/worker-code/src/env.ts`

Nova env `AGENT_MAX_FIX_ATTEMPTS` (número, default 2).

### `apps/worker-code/src/types.ts`

`JobResult.fixAttempts?: number`. O payload de entrada do job (`jobSchema`) não muda.

### Grafo — `coder.ts`, `state.ts`, `report.ts`

- `coder.ts`: lê `fixAttempts` do `RunnerResult`, propaga ao state e ao comentário
  "🤖 Execução" no Linear ("corrigido em N tentativa(s)" / "N tentativas, validação
  ainda ❌").
- `state.ts`: campo `fixAttempts?: number`.
- `report.ts`: surface no comentário consolidado final.

## Error handling

- `applyFix` falha (erro de LLM / JSON inválido): `completeJson` já retenta 2x
  internamente; se ainda assim lançar, **quebra o loop** e segue para commit/push
  best-effort. Não derruba o run.
- Falha na tentativa 0 do `generateAndApplyCode`: fluxo atual inalterado
  (catch → `failed`). O loop só engaja após a geração inicial bem-sucedida.

## Interações

- **Cost Guard (MAC-40):** cada `applyFix` soma em `costUsd` (já agregado pelo
  runner); o guard pós-job pega o total. O cap de 2 bounds o custo extra.
- **Memory Layer (MAC-23):** falha final após esgotar os retries → continua sendo
  falha de validação → lição capturada (já wired no `worker.ts`). Fix bem-sucedido
  → sem lição (correto, não houve falha final).
- **Critic / Report:** recebem a validação FINAL — downstream inalterado.

## Custo / tempo — débito consciente

`runValidation` re-roda **todos** os comandos por tentativa, incluindo
`pnpm install` (~2min no sandbox). 2 retries = até ~3× install. Aceitável para
execução assíncrona. Otimização futura (pular `install` em retry salvo mudança no
`package.json`) fica **fora do MVP**.

## Testes

- `runValidation` / extração do `failureTail`: testável com um runner de comando
  fake — assere `passed` e que o `failureTail` vem do comando que falhou.
- `applyFix`: integração (LLM + filesystem), validado E2E como o resto do executor.
- Meta: ~2-3 testes novos.

## Não-objetivos (YAGNI)

- Reação do loop ao critic (graph-level) — fora do escopo.
- Otimização de `install` em retries.
- Tratamento especial de mudança em `package.json`.
- `git amend` / múltiplos commits por tentativa — commit único do estado final.
- Bloquear o PR quando a validação não passa — mantém "sempre abre PR".
