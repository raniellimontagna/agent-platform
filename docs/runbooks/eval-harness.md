# Eval harness

O eval harness mede regressões básicas de qualidade do agente sem chamar LLM,
GitHub, Plane, Linear ou produção. Cada fixture cria um repositório temporário,
aplica uma mudança candidata versionada, roda comandos permitidos e compara o
resultado com critérios objetivos.

## Status e propriedade

| Superficie | Status | Fonte de verdade | Evidencia local |
|------------|--------|------------------|-----------------|
| Eval CLI e reports | Ativo | `apps/worker-code/src/eval/runEval.ts` | `apps/worker-code/src/eval/runEval.test.ts` |
| Role quality checks | Ativo | `apps/worker-code/src/eval/roleQuality.ts` | `apps/worker-code/src/eval/roleQuality.test.ts` |
| Worker dry-run fixtures | Ativo | `apps/worker-code/evals/fixtures/*` | `rtk corepack pnpm eval:regression` |
| Live Plane/GitHub/LLM calls | Nao permitido no harness | Fixture-local fake repos and fake LLM responses | Covered by normal eval commands |

Rodar todos os cenários:

```bash
rtk pnpm eval
```

Gate completo recomendado antes de deploy/merge:

```bash
rtk corepack pnpm verify
```

Esse comando roda lint, build do monorepo, testes, eval e checagem de regressão
do eval harness.

Final cleanup closeout evidence: Phase 07 recorded VER-02 and VER-03 in
`../../.planning/phases/07-final-verification-and-governance-closeout/07-FINAL-GATE-EVIDENCE.md`
and closed VER-04 in
`../../.planning/phases/07-final-verification-and-governance-closeout/07-MILESTONE-AUDIT.md`.
The audit keeps eval hardening under remaining debt and next cleanup candidates;
this runbook remains the active owner for how to rerun evals.

Gate rápido recomendado antes de mexer em planner/coder/reviewer/merging:

```bash
rtk corepack pnpm verify:loop
```

Esse comando roda build do monorepo, testes e eval. Ele não chama GitHub, Plane,
Linear ou produção, e deve falhar com exit code diferente de zero se qualquer
etapa quebrar.

Artefatos ficam em `.eval-runs/<timestamp>/` com:

- `report.json`: resultado estruturado para automação.
- `report.md`: resumo legível.
- `<scenario>/result.json`: checks e comandos por cenário.
- `<scenario>/diff.patch`: diff produzido pela mudança candidata.
- `latest-report.json`: último report completo para comparação local.
- `history.jsonl`: histórico append-only com score, delta e cenários regressivos.

O comando sai com código diferente de zero se qualquer cenário reprovar. Para
adicionar um cenário, crie uma pasta em
`apps/worker-code/evals/fixtures/<id>/scenario.json` com:

- `repo.files`: estado inicial do repo-fixture.
- `candidate.files`/`candidate.delete`: mudança candidata a aplicar.
- `commands`: validações locais sem operadores de shell.
- `expected.changedFiles`, `expected.forbiddenFiles` e
  `expected.requiredContent`: critérios objetivos de score.

Fixtures também podem declarar `workerDryRun`. Nesse modo o harness cria uma
branch local, aplica uma resposta fake de codegen, roda validação, aplica fixes
fake quando necessário, faz commit local e salva o diff. O resultado sempre traz
`pushed: false`; GitHub, Plane e Linear não são chamados.

Quando `workerDryRun.llmResponses` está presente, o harness usa o codegen real
(`generateAndApplyCode` e `applyFix`) com um `LlmClient` fake que devolve as
respostas JSON em ordem. Isso permite testar seleção de arquivos, aplicação de
conteúdo e self-correction sem chamar LiteLLM.

Para detectar queda de qualidade contra o último report salvo em `.eval-runs`,
rode:

```bash
rtk corepack pnpm eval:regression
```

Esse modo compara score agregado e score por cenário contra
`.eval-runs/latest-report.json`; se houver regressão, o processo falha.

## Catálogo atual

- `docs-note`: criação simples de documentação sem tocar em config.
- `code-change`: mudança pequena de código + teste.
- `worker-dry-run-fix`: fluxo dry-run com fix fake depois de falha.
- `worker-codegen-fake`: codegen real + `LlmClient` fake + fix real.
- `worker-json-repair`: resposta inicial inválida/truncada e repair para JSON.
- `noop-review-safe`: cenário sem mudanças, validando no-op verde.
- `forbidden-file-preserved`: alteração cirúrgica preservando arquivo proibido.
- `auto-merge-approved`: critic aprovado, zero voltas, commit metadata e
  auto-merge esperado.
- `auto-merge-operational-caveat`: ressalva operacional não bloqueia
  auto-merge.
- `auto-merge-blocked-non-operational-caveat`: ressalva não-operacional bloqueia
  auto-merge.
- `critic-max-rounds-3`: loop critic chega ao teto de 3 voltas.
- `critic-reproved-blocks-pr`: `REPROVADO` terminal bloqueia PR/auto-merge.
- `review-noop-commit-trailers`: revisão no-op preserva trailers de commit.
- `review-recode-required`: critic pede recode e o fluxo segue até o teto
  esperado.

## Role quality checks

`apps/worker-code/src/eval/roleQuality.ts` contains deterministic checks for
planner and critic outputs. They do not call Plane, GitHub, Linear, or real LLMs.
Use them when changing role contracts or prompts:

```bash
rtk corepack pnpm vitest run apps/worker-code/src/eval/roleQuality.test.ts
```

## Próxima evolução recomendada

O auto-merge e o loop critic já têm fixtures determinísticas. As próximas
evoluções mais úteis são:

- eval de qualidade mínima de plano para a role `planner`;
- eval que associe checks explicitamente às roles `planner`, `coder` e `critic`;
- cenários de workflow composto `workflow:landing-page` sem chamar Plane/GitHub;
- relatório que destaque melhor a role responsável por bloqueio ou regressão.
