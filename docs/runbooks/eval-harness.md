# Eval harness

O eval harness mede regressões básicas de qualidade do agente sem chamar LLM,
GitHub ou Linear. Cada fixture cria um repositório temporário, aplica uma mudança
candidata versionada, roda comandos permitidos e compara o resultado com critérios
objetivos.

Rodar todos os cenários:

```bash
rtk pnpm eval
```

Artefatos ficam em `.eval-runs/<timestamp>/` com:

- `report.json`: resultado estruturado para automação.
- `report.md`: resumo legível.
- `<scenario>/result.json`: checks e comandos por cenário.
- `<scenario>/diff.patch`: diff produzido pela mudança candidata.

O comando sai com código diferente de zero se qualquer cenário reprovar. Para
adicionar um cenário, crie uma pasta em
`apps/worker-code/evals/fixtures/<id>/scenario.json` com:

- `repo.files`: estado inicial do repo-fixture.
- `candidate.files`/`candidate.delete`: mudança candidata a aplicar.
- `commands`: validações locais sem operadores de shell.
- `expected.changedFiles`, `expected.forbiddenFiles` e
  `expected.requiredContent`: critérios objetivos de score.
