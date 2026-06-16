import { Queue } from 'bullmq';
import { connection } from './queue.js';

/** Fila dedicada aos disparos de agendamento (MAC-38). */
export const SCHEDULE_QUEUE = 'agent-schedules';

/** Payload de um disparo: só o id do agendamento (metadados vêm do DB). */
export interface ScheduleFireData {
  scheduleId: string;
}

export const scheduleQueue = new Queue<ScheduleFireData, unknown, string>(SCHEDULE_QUEUE, {
  connection,
  defaultJobOptions: { removeOnComplete: 100, removeOnFail: 500 },
});

/**
 * Cria/atualiza o Job Scheduler de um agendamento (cron vive no Redis).
 * A key é o id do schedule — upsert é idempotente (reagendar = re-upsert).
 */
export async function upsertScheduleJob(s: {
  id: string;
  cron: string;
  tz: string;
}): Promise<void> {
  await scheduleQueue.upsertJobScheduler(
    s.id,
    { pattern: s.cron, tz: s.tz },
    { name: 'fire', data: { scheduleId: s.id } },
  );
}

/** Remove o Job Scheduler de um agendamento. */
export async function removeScheduleJob(id: string): Promise<void> {
  await scheduleQueue.removeJobScheduler(id);
}
