import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAgent } from './agent.js';
import { env } from './env.js';
import { JOB_PRIORITY, agentQueue, connection } from './queue.js';
import { createRun } from './runs.js';
import { SCHEDULE_QUEUE, removeScheduleJob, upsertScheduleJob } from './scheduleQueue.js';
import { startScheduleWorker } from './scheduleWorker.js';
import { getSchedule, hasActiveRunForSchedule, listSchedules, touchSchedule } from './schedules.js';

type ScheduleJob = { data: { scheduleId: string } };
type ScheduleProcessor = (job: ScheduleJob) => Promise<void>;

const workerProcessors = vi.hoisted(() => [] as ScheduleProcessor[]);
const WorkerMock = vi.hoisted(() =>
  vi.fn((_queueName: string, processor: ScheduleProcessor) => {
    workerProcessors.push(processor);
    return { close: vi.fn() };
  }),
);

vi.mock('bullmq', () => ({
  Worker: WorkerMock,
}));

vi.mock('./agent.js', () => ({
  getAgent: vi.fn(),
}));

vi.mock('./env.js', () => ({
  env: {
    PLANE_SCHEDULED_LABEL_ID: 'plane-scheduled-label',
    LINEAR_SCHEDULED_LABEL_ID: 'linear-scheduled-label',
  },
}));

vi.mock('./killswitch.js', () => ({
  isPaused: vi.fn().mockResolvedValue(false),
}));

vi.mock('./logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    child: () => ({ info: vi.fn(), warn: vi.fn() }),
  },
}));

vi.mock('./queue.js', () => ({
  JOB_PRIORITY: { plan: 2 },
  agentQueue: { add: vi.fn() },
  connection: { host: 'localhost', port: 6379, maxRetriesPerRequest: null },
}));

vi.mock('./runs.js', () => ({
  createRun: vi.fn(),
}));

vi.mock('./scheduleQueue.js', () => ({
  SCHEDULE_QUEUE: 'agent-schedules',
  removeScheduleJob: vi.fn(),
  upsertScheduleJob: vi.fn(),
}));

vi.mock('./schedules.js', () => ({
  getSchedule: vi.fn(),
  hasActiveRunForSchedule: vi.fn(),
  listSchedules: vi.fn(),
  touchSchedule: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  workerProcessors.length = 0;
  env.PLANE_SCHEDULED_LABEL_ID = 'plane-scheduled-label';
  env.LINEAR_SCHEDULED_LABEL_ID = 'linear-scheduled-label';
});

describe('startScheduleWorker', () => {
  function mockRunnableSchedule() {
    const createCard = vi.fn().mockResolvedValue({
      provider: 'plane',
      id: 'plane-card-1',
      identifier: 'AGP-77',
      projectId: 'plane-project',
      title: 'Weekly planning',
      description: 'Create the weekly plan',
      labels: ['scheduled'],
    });
    vi.mocked(getAgent).mockResolvedValue({
      cards: { primary: { createCard } },
    } as never);
    vi.mocked(listSchedules).mockResolvedValue([
      { id: 'schedule-enabled', cron: '0 9 * * 1', tz: 'UTC', enabled: true },
    ] as never);
    vi.mocked(getSchedule).mockResolvedValue({
      id: 'schedule-1',
      title: 'Weekly planning',
      description: 'Create the weekly plan',
      enabled: true,
      autoApprove: true,
    } as never);
    vi.mocked(hasActiveRunForSchedule).mockResolvedValue(false);
    vi.mocked(createRun).mockResolvedValue('run-scheduled');
    return { createCard };
  }

  async function fireSchedule() {
    await startScheduleWorker();
    expect(upsertScheduleJob).toHaveBeenCalledWith({
      id: 'schedule-enabled',
      cron: '0 9 * * 1',
      tz: 'UTC',
    });
    expect(WorkerMock).toHaveBeenCalledWith(SCHEDULE_QUEUE, expect.any(Function), { connection });

    const processor = workerProcessors[0];
    if (!processor) throw new Error('expected schedule worker processor to be registered');
    await processor({ data: { scheduleId: 'schedule-1' } });
  }

  it('creates Plane scheduled cards, persists card metadata, and enqueues provider-aware plan jobs', async () => {
    const { createCard } = mockRunnableSchedule();

    await fireSchedule();

    expect(createCard).toHaveBeenCalledWith({
      title: 'Weekly planning',
      description: 'Create the weekly plan',
      labelIds: ['plane-scheduled-label'],
    });
    expect(createRun).toHaveBeenCalledWith({
      cardProvider: 'plane',
      cardId: 'plane-card-1',
      cardIdentifier: 'AGP-77',
      cardProjectId: 'plane-project',
      title: 'Weekly planning',
      scheduleId: 'schedule-1',
      autoApprove: true,
    });
    expect(touchSchedule).toHaveBeenCalledWith('schedule-1');
    expect(agentQueue.add).toHaveBeenCalledWith(
      'plan',
      {
        kind: 'plan',
        runId: 'run-scheduled',
        cardProvider: 'plane',
        cardId: 'plane-card-1',
      },
      { priority: JOB_PRIORITY.plan },
    );
    expect(removeScheduleJob).not.toHaveBeenCalled();
  });

  it('passes no scheduled label when the Plane scheduled label is absent', async () => {
    env.PLANE_SCHEDULED_LABEL_ID = undefined;
    env.LINEAR_SCHEDULED_LABEL_ID = 'linear-scheduled-label';
    const { createCard } = mockRunnableSchedule();

    await fireSchedule();

    expect(createCard).toHaveBeenCalledWith({
      title: 'Weekly planning',
      description: 'Create the weekly plan',
      labelIds: undefined,
    });
  });
});
