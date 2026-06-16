# LiteLLM Guardrails

Runbook para fechar budgets, rate limits e chaves de acesso do gateway LLM.

## Contrato de aliases

| Alias | Uso | Limite no deployment |
|---|---|---|
| `cheap_fast` | tarefas triviais / alto volume | 30 RPM / 60k TPM |
| `cheap_fast_fb_cost_saver` | fallback barato do `cheap_fast` | 12 RPM / 40k TPM |
| `research` | contexto, síntese e planejamento | 20 RPM / 60k TPM |
| `strong_coder` | código comum | 20 RPM / 60k TPM |
| `heavy_coder` | código difícil e recuperação de falhas | 12 RPM / 50k TPM |
| `critic` | revisão final | 12 RPM / 50k TPM |

Enquanto os combos OAuth do OmniRoute estiverem degradados, aliases fortes
(`research`, `strong_coder`, `heavy_coder`, `critic`) usam Verboo
(`deepseek-v4-flash`) direto. Isso preserva disponibilidade, mas a qualidade é
menor e há menos "thinking"; trate resultados nesse modo como candidatos a revisão
humana mais cuidadosa. Quando Antigravity/Codex/Claude estiverem saudáveis, reverta
os aliases fortes para os combos `cost-saver`/`high-availability` e mantenha Verboo
como fallback de último recurso.

O fallback operacional vive no `router_settings` do LiteLLM. Mantenha o timeout do
Router menor que o timeout dos clientes (`LLM_TIMEOUT_MS` do runner/orchestrator)
para o combo degradado falhar dentro do gateway antes do cliente abortar.

`store_model_in_db` deve ficar `false`: a config versionada precisa ser a fonte da
verdade. Se ficar `true`, modelos persistidos no banco do LiteLLM podem manter rotas
antigas para OmniRoute mesmo depois de deploy do YAML.

O proxy também tem budget global em `litellm-config.yaml`:

```yaml
litellm_settings:
  request_timeout: 45
  num_retries: 0
  max_budget: 25.0
  budget_duration: 30d
router_settings:
  timeout: 45
  num_retries: 0
```

Esse valor é um disjuntor de MVP. Ajuste para cima quando o consumo real estiver
medido.

## Criar chaves virtuais

Execute no host Proxmox. Os comandos usam o master key somente para provisionar
chaves; os serviços devem usar as chaves geradas, não o master key.

> **Estado atual (MAC-15, 2026-06-14):** está deployada **uma** virtual key
> compartilhada `agent-platform` (orchestrator + runner usam a mesma), com
> `models: []` (acesso a todos os aliases) e **sem budget/rate limit** por key.
> Isso já tira a master key do pipeline. O procedimento abaixo (duas keys
> separadas `agent-orchestrator`/`agent-runner` com `models` restritos + budget)
> é o hardening recomendado para apertar isolamento e governança por componente —
> aplicar quando quiser separar budget/auditoria.

```bash
pct exec 200 -- bash -lc '
cd /opt/agent-platform/gateway
set -a
. ./.env
set +a

curl -s http://localhost:4000/key/generate \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"key_alias\": \"agent-orchestrator\",
    \"models\": [\"cheap_fast\", \"research\", \"critic\"],
    \"max_budget\": 10.0,
    \"budget_duration\": \"30d\",
    \"rpm_limit\": 30,
    \"tpm_limit\": 120000,
    \"metadata\": {\"service\": \"orchestrator-api\"}
  }" | jq .
'
```

Use a chave retornada como `LITELLM_API_KEY` do orquestrador.

```bash
pct exec 200 -- bash -lc '
cd /opt/agent-platform/gateway
set -a
. ./.env
set +a

curl -s http://localhost:4000/key/generate \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"key_alias\": \"agent-runner\",
    \"models\": [\"cheap_fast\", \"strong_coder\", \"heavy_coder\"],
    \"max_budget\": 15.0,
    \"budget_duration\": \"30d\",
    \"rpm_limit\": 20,
    \"tpm_limit\": 120000,
    \"metadata\": {\"service\": \"worker-code\"}
  }" | jq .
'
```

Use a chave retornada como `LITELLM_API_KEY` do runner.

## Atualizar envs dos serviços

No orquestrador:

```bash
pct exec 201 -- nano /opt/agent-platform/repo/infra/compose/orchestrator/.env
```

No runner:

```bash
ssh runner@10.10.0.12 'nano /home/runner/agent-platform/repo/infra/compose/runners/.env'
```

Depois reinicie os serviços afetados pelos envs.

## Validar acesso por chave

Substitua `sk-...` pela chave virtual gerada.

```bash
pct exec 200 -- bash -lc '
KEY="sk-..."

for model in cheap_fast research critic; do
  echo
  echo "==> $model"
  curl -s http://localhost:4000/v1/chat/completions \
    -H "Authorization: Bearer $KEY" \
    -H "Content-Type: application/json" \
    -d "{\"model\":\"$model\",\"messages\":[{\"role\":\"user\",\"content\":\"Responda apenas OK\"}],\"max_tokens\":80}" \
    | jq -r ".choices[0].message.content // .error.message // ."
done
'
```

Verifique se um modelo não permitido é bloqueado:

```bash
pct exec 200 -- bash -lc '
KEY="sk-..."

curl -s http://localhost:4000/v1/chat/completions \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d "{\"model\":\"heavy_coder\",\"messages\":[{\"role\":\"user\",\"content\":\"Responda apenas OK\"}],\"max_tokens\":80}" \
  | jq .
'
```

## Ver spend de uma chave

```bash
pct exec 200 -- bash -lc '
cd /opt/agent-platform/gateway
set -a
. ./.env
set +a

KEY="sk-..."

curl -s "http://localhost:4000/key/info?key=$KEY" \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY" \
  | jq .
'
```

## Política de uso nos agentes

- Planner/context builder usa `research`.
- Coder usa `strong_coder` primeiro.
- Coder escala para `heavy_coder` só em falha de teste, tarefa crítica ou diff
  grande.
- Reviewer usa `critic`.
- Tarefas triviais usam `cheap_fast`.
