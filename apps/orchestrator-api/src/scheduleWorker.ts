import { Worker } from 'bullmq';
import { getAgent } from './agent.js';
import { env } from './env.js';
import { isPaused } from './killswitch.js';
import { logger } from './logger.js';
import { JOB_PRIORITY, agentQueue, connection } from './queue.js';
import { createRun } from './runs.js';
import {
  SCHEDULE_QUEUE,
  type ScheduleFireData,
  removeScheduleJob,
  upsertScheduleJob,
} from './scheduleQueue.js';
import { getSchedule, hasActiveRunForSchedule, listSchedules, touchSchedule } from './schedules.js';

/**
 * Worker dos disparos de agendamento (MAC-38). Cada disparo: cria a issue no
 * Linear (issue sintética), cria o run e enfileira `plan` na fila do agente.
 * Na subida, reconcilia os Job Schedulers do BullMQ a partir do banco (cobre
 * Redis flush / deploy novo), análogo ao resume de órfãos (MAC-34).
 */
export async function startScheduleWorker(): Promise<Worker<ScheduleFireData, unknown, string>> {
  const { linear } = await getAgent();

  // Reconciliação: garante um Job Scheduler p/ cada agendamento habilitado.
  const enabled = await listSchedules({ enabledOnly: true });
  for (const s of enabled) {
    await upsertScheduleJob({ id: s.id, cron: s.cron, tz: s.tz });
  }
  logger.info({ reconciled: enabled.length }, 'schedule worker started');

  return new Worker<ScheduleFireData, unknown, string>(
    SCHEDULE_QUEUE,
    async (job) => {
      const { scheduleId } = job.data;
      const log = logger.child({ scheduleId });

      // Kill switch (MAC-32): pausado → não dispara; o próximo tick tenta.
      if (await isPaused()) {
        log.warn('agents paused; skipping scheduled fire');
        return;
      }

      const schedule = await getSchedule(scheduleId);
      if (!schedule || !schedule.enabled) {
        // Agendamento sumiu/desabilitado mas o scheduler órfão disparou: limpa.
        await removeScheduleJob(scheduleId);
        log.warn('schedule ausente/desabilitado — scheduler removido');
        return;
      }

      // Overlap guard: não empilha runs se o anterior ainda está rodando.
      if (await hasActiveRunForSchedule(scheduleId)) {
        log.warn('run anterior ainda ativo — disparo ignorado');
        return;
      }

      const issue = await linear.createIssue({
        title: schedule.title,
        description: schedule.description,
        teamId: env.LINEAR_TEAM_ID,
        labelIds: env.LINEAR_SCHEDULED_LABEL_ID ? [env.LINEAR_SCHEDULED_LABEL_ID] : undefined,
      });

      const runId = await createRun({
        linearIssueId: issue.id,
        linearIssueIdentifier: issue.identifier,
        title: schedule.title,
        scheduleId,
        autoApprove: schedule.autoApprove,
      });

      await touchSchedule(scheduleId);

      await agentQueue.add(
        'plan',
        { kind: 'plan', runId, issueId: issue.id },
        { priority: JOB_PRIORITY.plan },
      );

      log.info({ runId, issue: issue.identifier }, 'scheduled run enfileirado');
    },
    { connection },
  );
}
