# Scheduler Runbook

The scheduler is an active orchestrator surface for recurring Plane-first work.
It persists schedule rows in Postgres, reconciles BullMQ job schedulers on
startup, creates Plane cards when a schedule fires, persists the resulting run,
and enqueues a provider-aware `plan` job.

Linear scheduled labels are legacy compatibility only. New scheduled work uses
Plane card identity and, when configured, `PLANE_SCHEDULED_LABEL_ID`.

## Status And Owners

| Surface | Status | Source of truth | Focused evidence |
|---------|--------|-----------------|------------------|
| Schedule CRUD API | Active bearer-protected API | `apps/orchestrator-api/src/routes/schedules.ts` | `apps/orchestrator-api/src/routes/schedules.test.ts` |
| Schedule persistence | Active database service | `apps/orchestrator-api/src/schedules.ts` | `apps/orchestrator-api/src/routes/schedules.test.ts` |
| BullMQ scheduler reconciliation | Active queue service | `apps/orchestrator-api/src/scheduleQueue.ts` | `apps/orchestrator-api/src/scheduleWorker.test.ts` |
| Schedule fire worker | Active runtime worker | `apps/orchestrator-api/src/scheduleWorker.ts` | `apps/orchestrator-api/src/scheduleWorker.test.ts` |
| Plane scheduled label | Active when env is configured | `PLANE_SCHEDULED_LABEL_ID` in orchestrator env | `apps/orchestrator-api/src/scheduleWorker.test.ts` |
| Linear scheduled label | Legacy/migration compatibility | `LINEAR_SCHEDULED_LABEL_ID` only for old compatibility paths | Do not use for new Plane scheduled work |

## Runtime Flow

```text
POST /schedules
  -> routes/schedules.ts validates request and bearer auth
  -> schedules.ts creates/updates the schedule row
  -> scheduleQueue.ts upserts the BullMQ Job Scheduler
  -> scheduleWorker.ts reconciles enabled schedules on startup
  -> schedule fire creates a Plane card
  -> createRun persists scheduleId and Plane card identity
  -> agent-runs receives { kind: "plan", runId, cardProvider: "plane", cardId }
```

The schedule worker skips fires when agents are paused, when the schedule is
disabled or missing, or when an active run already exists for the same
`scheduleId`.

## Operator Checks

Use the protected schedules API from the orchestrator network. Do not expose
`/schedules` through Tailscale Funnel; public exposure remains limited to
`/webhooks/plane`.

List schedules:

```bash
rtk curl -H "Authorization: Bearer <RUNNER_AUTH_TOKEN>" \
  http://<orchestrator-host>:3000/schedules
```

Inspect runs created by one schedule:

```bash
rtk curl -H "Authorization: Bearer <RUNNER_AUTH_TOKEN>" \
  http://<orchestrator-host>:3000/schedules/<schedule-id>/runs
```

If a schedule was disabled or deleted but still fires, the worker removes the
orphaned BullMQ scheduler. If a schedule is enabled but does not fire, check:

- the row returned by `GET /schedules/<schedule-id>`;
- Redis/BullMQ connectivity for `agent-schedules`;
- orchestrator logs from `apps/orchestrator-api/src/scheduleWorker.ts`;
- whether agents are paused in Mission Control/admin status;
- whether an active run already exists for the same `scheduleId`.

## Verification

Run these before changing scheduler docs or behavior:

```bash
rtk corepack pnpm vitest run apps/orchestrator-api/src/scheduleWorker.test.ts apps/orchestrator-api/src/routes/schedules.test.ts
```

The tests prove schedule CRUD enqueues/removes BullMQ schedulers, startup
reconciliation registers enabled schedules, scheduled fires create Plane cards,
persist card metadata, and enqueue provider-aware plan jobs.

## Deferred Gaps

- Cross-process duplicate fire prevention is still a known low-probability race
  in `apps/orchestrator-api/src/schedules.ts`; a stronger DB-level lock or
  uniqueness guard belongs to a later runtime hardening phase.
- Mission Control does not expose schedule replay, pause, or cancel controls.
  Those operator actions remain deferred until explicit UI controls and tests
  exist.
