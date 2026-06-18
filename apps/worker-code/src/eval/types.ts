import { z } from 'zod';
import type { CommandResult } from '../types.js';

const evalFileSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
});

const evalCommitAuthorSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
});

const evalReviewNoteSchema = z.object({
  kind: z.enum(['operational', 'non-operational']),
  summary: z.string().min(1),
});

const normalizeReviewOutcome = (value: unknown): unknown => {
  if (value === 'no-op') {
    return 'noop';
  }

  if (value === 'recode_required') {
    return 'recode';
  }

  return value;
};

const normalizeReviewNotes = (notes: unknown, fallbackKind: unknown): unknown => {
  if (!Array.isArray(notes)) {
    return notes;
  }

  return notes
    .filter((note) => {
      if (typeof note === 'string') {
        return note.trim().length > 0;
      }

      return note && typeof note === 'object' && !Array.isArray(note);
    })
    .map((note) => {
      if (typeof note !== 'string') {
        return note;
      }

      const summary = note.trim();
      const lowerSummary = summary.toLowerCase();
      const kind =
        fallbackKind === 'operational' ||
        (!lowerSummary.includes('non-operational') && lowerSummary.includes('operational'))
          ? 'operational'
          : 'non-operational';

      return { kind, summary };
    });
};

const evalReviewSchema = z.preprocess(
  (input) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return input;
    }

    const review = { ...(input as Record<string, unknown>) };

    if (review.verdict === undefined && typeof review.status === 'string') {
      review.verdict = review.status;
    }

    if (review.autoMergeEligible === undefined && typeof review.autoMerge === 'boolean') {
      review.autoMergeEligible = review.autoMerge;
    }

    if (
      review.autoMergeEligible === undefined &&
      review.autoMerge &&
      typeof review.autoMerge === 'object' &&
      !Array.isArray(review.autoMerge)
    ) {
      const autoMerge = review.autoMerge as Record<string, unknown>;
      if (typeof autoMerge.expected === 'boolean') {
        review.autoMergeEligible = autoMerge.expected;
      } else if (typeof autoMerge.enabled === 'boolean') {
        review.autoMergeEligible = autoMerge.enabled;
      }
    }

    if (review.reviewOutcome === undefined && typeof review.reviewAction === 'string') {
      review.reviewOutcome = review.reviewAction;
    }

    if (review.reviewOutcome === undefined && typeof review.action === 'string') {
      review.reviewOutcome = review.action;
    }

    if (review.reviewOutcome === undefined && typeof review.outcome === 'string') {
      review.reviewOutcome = review.outcome;
    }

    if (review.reviewOutcome === undefined && typeof review.requiresRecode === 'boolean') {
      review.reviewOutcome = review.requiresRecode ? 'recode' : 'noop';
    }

    if (review.reviewOutcome === undefined && typeof review.noop === 'boolean') {
      review.reviewOutcome = review.noop ? 'noop' : 'recode';
    }

    if (review.criticRounds === undefined && typeof review.criticRoundsExecuted === 'number') {
      review.criticRounds = review.criticRoundsExecuted;
    }

    review.reviewOutcome = normalizeReviewOutcome(review.reviewOutcome);
    review.notes = normalizeReviewNotes(review.notes, review.caveatCategory);

    if (!Array.isArray(review.notes) && Array.isArray(review.caveats)) {
      review.notes = review.caveats
        .filter((caveat) => caveat && typeof caveat === 'object' && !Array.isArray(caveat))
        .map((caveat) => {
          const record = caveat as Record<string, unknown>;
          return {
            kind: record.type === 'operational' ? 'operational' : 'non-operational',
            summary:
              typeof record.message === 'string' && record.message.trim().length > 0
                ? record.message
                : typeof record.summary === 'string' && record.summary.trim().length > 0
                  ? record.summary
                  : `${record.type === 'operational' ? 'operational' : 'non-operational'} caveat`,
          };
        });
    }

    if (!Array.isArray(review.notes)) {
      const kind = review.caveatCategory;
      if (kind === 'operational' || kind === 'non-operational') {
        const summary =
          typeof review.blockReason === 'string' && review.blockReason.trim().length > 0
            ? review.blockReason
            : `${kind} caveat`;
        review.notes = [{ kind, summary }];
      }
    }

    return review;
  },
  z.object({
    verdict: z.enum(['APROVADO', 'APROVADO COM RESSALVAS', 'SOLICITAR MUDANCAS']),
    notes: z.array(evalReviewNoteSchema).default([]),
    autoMergeEligible: z.boolean().optional(),
    blockReason: z.string().optional(),
    reviewOutcome: z.enum(['noop', 'recode']).default('noop'),
    criticRounds: z.number().int().min(0).max(3).optional(),
    maxCriticRounds: z.number().int().min(1).max(3).optional(),
  }),
);

const evalIsolationSchema = z.object({
  allowNetwork: z.boolean().default(false),
  allowGitHub: z.boolean().default(false),
  allowLinear: z.boolean().default(false),
  allowLiteLLM: z.boolean().default(false),
  externalCalls: z.array(z.string()).default([]),
});

const evalExpectedSchema = z.preprocess(
  (input) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return input;
    }

    const expected = { ...(input as Record<string, unknown>) };

    if (expected.review && typeof expected.review === 'object' && !Array.isArray(expected.review)) {
      const review = expected.review as Record<string, unknown>;
      const hasReviewExpectation = [
        'verdict',
        'status',
        'notes',
        'autoMerge',
        'autoMergeEligible',
        'blockReason',
        'reviewAction',
        'reviewOutcome',
        'action',
        'criticRounds',
        'maxCriticRounds',
        'caveatCategory',
      ].some((key) => review[key] !== undefined);

      if (!hasReviewExpectation) {
        expected.review = undefined;
      }
    }

    if (expected.review && typeof expected.review === 'object' && !Array.isArray(expected.review)) {
      const review = { ...(expected.review as Record<string, unknown>) };

      if (
        expected.autoMerge &&
        typeof expected.autoMerge === 'object' &&
        !Array.isArray(expected.autoMerge)
      ) {
        const autoMerge = expected.autoMerge as Record<string, unknown>;
        if (review.autoMergeEligible === undefined) {
          if (typeof autoMerge.expected === 'boolean') {
            review.autoMergeEligible = autoMerge.expected;
          } else if (typeof autoMerge.enabled === 'boolean') {
            review.autoMergeEligible = autoMerge.enabled;
          }
        }

        if (review.blockReason === undefined) {
          if (typeof autoMerge.blockReason === 'string') {
            review.blockReason = autoMerge.blockReason;
          } else if (typeof autoMerge.reason === 'string') {
            review.blockReason = autoMerge.reason;
          }
        }
      }

      if (
        expected.critic &&
        typeof expected.critic === 'object' &&
        !Array.isArray(expected.critic)
      ) {
        const critic = expected.critic as Record<string, unknown>;
        if (review.criticRounds === undefined) {
          if (typeof critic.rounds === 'number') {
            review.criticRounds = critic.rounds;
          } else if (typeof critic.roundsExecuted === 'number') {
            review.criticRounds = critic.roundsExecuted;
          }
        }

        if (review.maxCriticRounds === undefined && typeof critic.maxRounds === 'number') {
          review.maxCriticRounds = critic.maxRounds;
        }
      }

      expected.review = review;
    }

    const reviewSourceKeys = [
      'verdict',
      'notes',
      'autoMerge',
      'autoMergeEligible',
      'blockReason',
      'reviewAction',
      'reviewOutcome',
      'criticRounds',
      'maxCriticRounds',
      'caveatCategory',
    ] as const;

    if (expected.review === undefined) {
      const review = reviewSourceKeys.reduce<Record<string, unknown>>((acc, key) => {
        if (expected[key] !== undefined) {
          acc[key] = expected[key];
        }
        return acc;
      }, {});

      if (expected.finalVerdict !== undefined) {
        review.verdict = expected.finalVerdict;
      }

      if (expected.reviewOutcome !== undefined) {
        review.reviewOutcome = normalizeReviewOutcome(expected.reviewOutcome);
      }

      if (expected.criticRoundsExecuted !== undefined) {
        review.criticRounds = expected.criticRoundsExecuted;
      }

      if (
        expected.autoMerge &&
        typeof expected.autoMerge === 'object' &&
        !Array.isArray(expected.autoMerge)
      ) {
        const autoMerge = expected.autoMerge as Record<string, unknown>;
        if (review.autoMergeEligible === undefined) {
          if (typeof autoMerge.expected === 'boolean') {
            review.autoMergeEligible = autoMerge.expected;
          } else if (typeof autoMerge.enabled === 'boolean') {
            review.autoMergeEligible = autoMerge.enabled;
          }
        }

        if (review.blockReason === undefined && typeof autoMerge.blockReason === 'string') {
          review.blockReason = autoMerge.blockReason;
        }
      }

      if (review.verdict !== undefined) {
        expected.review = review;
      }
    }

    if (expected.commit && typeof expected.commit === 'object' && !Array.isArray(expected.commit)) {
      const commit = { ...(expected.commit as Record<string, unknown>) };

      if (
        commit.author === undefined &&
        typeof commit.authorName === 'string' &&
        typeof commit.authorEmail === 'string'
      ) {
        commit.author = {
          name: commit.authorName,
          email: commit.authorEmail,
        };
      }

      if (commit.messageIncludes === undefined && Array.isArray(commit.mustInclude)) {
        commit.messageIncludes = commit.mustInclude.filter(
          (entry): entry is string => typeof entry === 'string',
        );
      }

      if (commit.trailersInclude === undefined && Array.isArray(commit.mustInclude)) {
        commit.trailersInclude = commit.mustInclude.filter(
          (entry): entry is string =>
            typeof entry === 'string' && entry.startsWith('Co-authored-by:'),
        );
      }

      expected.commit = commit;
    }

    return expected;
  },
  z.object({
    changedFiles: z.array(z.string()),
    forbiddenFiles: z.array(z.string()).default([]),
    requiredContent: z
      .array(
        z.object({
          path: z.string().min(1),
          includes: z.string().min(1),
        }),
      )
      .default([]),
    review: evalReviewSchema.optional(),
    commit: z
      .object({
        author: evalCommitAuthorSchema.optional(),
        messageIncludes: z.array(z.string().min(1)).default([]),
        trailersInclude: z.array(z.string().min(1)).default([]),
      })
      .optional(),
    isolation: evalIsolationSchema.default({
      allowNetwork: false,
      allowGitHub: false,
      allowLinear: false,
      allowLiteLLM: false,
      externalCalls: [],
    }),
  }),
);

export const evalScenarioSchema = z.preprocess(
  (input) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return input;
    }

    const scenario = { ...(input as Record<string, unknown>) };

    if (scenario.id === undefined && typeof scenario.scenarioId === 'string') {
      scenario.id = scenario.scenarioId;
    }

    if (scenario.version === undefined && scenario.schemaVersion === 2) {
      scenario.version = 2;
    }

    if (scenario.repo === undefined) {
      scenario.repo = { files: {} };
    } else if (
      scenario.repo &&
      typeof scenario.repo === 'object' &&
      !Array.isArray(scenario.repo) &&
      (scenario.repo as Record<string, unknown>).files === undefined
    ) {
      scenario.repo = { ...(scenario.repo as Record<string, unknown>), files: {} };
    }

    if (
      scenario.workerDryRun === undefined &&
      scenario.inputs &&
      typeof scenario.inputs === 'object' &&
      !Array.isArray(scenario.inputs)
    ) {
      const inputs = scenario.inputs as Record<string, unknown>;
      if (inputs.workerDryRun && typeof inputs.workerDryRun === 'object') {
        scenario.workerDryRun = inputs.workerDryRun;
      }
    }

    if (
      scenario.workerDryRun === undefined &&
      ((scenario.review &&
        typeof scenario.review === 'object' &&
        !Array.isArray(scenario.review)) ||
        (scenario.commit &&
          typeof scenario.commit === 'object' &&
          !Array.isArray(scenario.commit)) ||
        (scenario.agent && typeof scenario.agent === 'object' && !Array.isArray(scenario.agent)))
    ) {
      const reviewRecord =
        scenario.review && typeof scenario.review === 'object' && !Array.isArray(scenario.review)
          ? { ...(scenario.review as Record<string, unknown>) }
          : undefined;
      const expectedRecord =
        scenario.expected &&
        typeof scenario.expected === 'object' &&
        !Array.isArray(scenario.expected)
          ? { ...(scenario.expected as Record<string, unknown>) }
          : undefined;
      const criticRecord =
        scenario.critic && typeof scenario.critic === 'object' && !Array.isArray(scenario.critic)
          ? { ...(scenario.critic as Record<string, unknown>) }
          : undefined;
      const fixturesRecord =
        scenario.fixtures &&
        typeof scenario.fixtures === 'object' &&
        !Array.isArray(scenario.fixtures)
          ? { ...(scenario.fixtures as Record<string, unknown>) }
          : undefined;
      const commitRecord =
        scenario.commit && typeof scenario.commit === 'object' && !Array.isArray(scenario.commit)
          ? { ...(scenario.commit as Record<string, unknown>) }
          : undefined;
      const agentRecord =
        scenario.agent && typeof scenario.agent === 'object' && !Array.isArray(scenario.agent)
          ? { ...(scenario.agent as Record<string, unknown>) }
          : undefined;
      const pullRequestRecord =
        scenario.pullRequest &&
        typeof scenario.pullRequest === 'object' &&
        !Array.isArray(scenario.pullRequest)
          ? { ...(scenario.pullRequest as Record<string, unknown>) }
          : undefined;

      if (reviewRecord) {
        if (
          reviewRecord.reviewOutcome === undefined &&
          expectedRecord?.reviewOutcome !== undefined
        ) {
          reviewRecord.reviewOutcome = expectedRecord.reviewOutcome;
        }

        if (reviewRecord.criticRounds === undefined) {
          if (expectedRecord?.criticRoundsExecuted !== undefined) {
            reviewRecord.criticRounds = expectedRecord.criticRoundsExecuted;
          } else if (Array.isArray(criticRecord?.rounds)) {
            reviewRecord.criticRounds = criticRecord?.rounds.length;
          }
        }

        if (
          reviewRecord.maxCriticRounds === undefined &&
          typeof criticRecord?.maxRounds === 'number'
        ) {
          reviewRecord.maxCriticRounds = criticRecord.maxRounds;
        }

        if (
          reviewRecord.autoMergeEligible === undefined &&
          expectedRecord?.autoMerge &&
          typeof expectedRecord.autoMerge === 'object' &&
          !Array.isArray(expectedRecord.autoMerge)
        ) {
          const autoMerge = expectedRecord.autoMerge as Record<string, unknown>;
          if (typeof autoMerge.expected === 'boolean') {
            reviewRecord.autoMergeEligible = autoMerge.expected;
          } else if (typeof autoMerge.enabled === 'boolean') {
            reviewRecord.autoMergeEligible = autoMerge.enabled;
          }

          if (
            reviewRecord.blockReason === undefined &&
            typeof autoMerge.blockReason === 'string' &&
            autoMerge.blockReason.trim().length > 0
          ) {
            reviewRecord.blockReason = autoMerge.blockReason;
          }
        }
      }

      const isolation = fixturesRecord
        ? {
            allowNetwork: fixturesRecord.allowNetwork === true,
            allowGitHub: fixturesRecord.allowGitHub === true,
            allowLinear: fixturesRecord.allowLinear === true,
            allowLiteLLM: fixturesRecord.allowLiteLLM === true,
            externalCalls: Array.isArray(fixturesRecord.externalCalls)
              ? fixturesRecord.externalCalls.filter(
                  (call): call is string => typeof call === 'string',
                )
              : [],
          }
        : undefined;

      const commitTrailers =
        typeof commitRecord?.message === 'string'
          ? commitRecord.message
              .split('\n')
              .map((line) => line.trim())
              .filter((line) => line.length > 0 && line.includes(':') && !line.startsWith('Ref:'))
          : [];

      scenario.workerDryRun = {
        plan:
          typeof scenario.description === 'string' && scenario.description.trim().length > 0
            ? scenario.description
            : typeof scenario.title === 'string'
              ? scenario.title
              : 'Local eval fixture',
        branch: 'agent/eval-dry-run',
        prTitle:
          typeof pullRequestRecord?.title === 'string' && pullRequestRecord.title.trim().length > 0
            ? pullRequestRecord.title
            : typeof scenario.title === 'string'
              ? scenario.title
              : 'Eval dry run',
        summary:
          typeof pullRequestRecord?.body === 'string'
            ? pullRequestRecord.body
            : typeof reviewRecord?.summary === 'string'
              ? reviewRecord.summary
              : '',
        files: [],
        llmResponses: [],
        fixes: [],
        maxFixAttempts: 2,
        commitMessage: typeof commitRecord?.message === 'string' ? commitRecord.message : '',
        commitAuthor:
          typeof agentRecord?.name === 'string' && typeof agentRecord?.email === 'string'
            ? {
                name: agentRecord.name,
                email: agentRecord.email,
              }
            : undefined,
        commitTrailers,
        review: reviewRecord,
        isolation,
      };
    }

    if (
      scenario.workerDryRun &&
      typeof scenario.workerDryRun === 'object' &&
      !Array.isArray(scenario.workerDryRun)
    ) {
      const workerDryRun = { ...(scenario.workerDryRun as Record<string, unknown>) };
      const candidate =
        scenario.candidate &&
        typeof scenario.candidate === 'object' &&
        !Array.isArray(scenario.candidate)
          ? (scenario.candidate as Record<string, unknown>)
          : {};
      const pullRequest =
        candidate.pullRequest &&
        typeof candidate.pullRequest === 'object' &&
        !Array.isArray(candidate.pullRequest)
          ? (candidate.pullRequest as Record<string, unknown>)
          : {};
      const agent =
        candidate.agent && typeof candidate.agent === 'object' && !Array.isArray(candidate.agent)
          ? (candidate.agent as Record<string, unknown>)
          : {};
      const commit =
        candidate.commit && typeof candidate.commit === 'object' && !Array.isArray(candidate.commit)
          ? (candidate.commit as Record<string, unknown>)
          : {};
      const review =
        workerDryRun.review &&
        typeof workerDryRun.review === 'object' &&
        !Array.isArray(workerDryRun.review)
          ? (workerDryRun.review as Record<string, unknown>)
          : {};
      const critic =
        workerDryRun.critic &&
        typeof workerDryRun.critic === 'object' &&
        !Array.isArray(workerDryRun.critic)
          ? (workerDryRun.critic as Record<string, unknown>)
          : {};
      const expected =
        scenario.expected &&
        typeof scenario.expected === 'object' &&
        !Array.isArray(scenario.expected)
          ? (scenario.expected as Record<string, unknown>)
          : {};
      const expectedAutoMerge =
        expected.autoMerge &&
        typeof expected.autoMerge === 'object' &&
        !Array.isArray(expected.autoMerge)
          ? (expected.autoMerge as Record<string, unknown>)
          : {};
      const integrations =
        workerDryRun.integrations &&
        typeof workerDryRun.integrations === 'object' &&
        !Array.isArray(workerDryRun.integrations)
          ? (workerDryRun.integrations as Record<string, unknown>)
          : {};
      const commitMessage =
        typeof workerDryRun.commitMessage === 'string'
          ? workerDryRun.commitMessage
          : typeof commit.message === 'string'
            ? commit.message
            : typeof candidate.commitMessage === 'string'
              ? candidate.commitMessage
              : '';

      workerDryRun.plan =
        typeof workerDryRun.plan === 'string' && workerDryRun.plan.trim().length > 0
          ? workerDryRun.plan
          : typeof scenario.description === 'string' && scenario.description.trim().length > 0
            ? scenario.description
            : typeof scenario.title === 'string'
              ? scenario.title
              : 'Local eval fixture';
      workerDryRun.branch =
        typeof workerDryRun.branch === 'string' && workerDryRun.branch.trim().length > 0
          ? workerDryRun.branch
          : typeof candidate.branch === 'string' && candidate.branch.trim().length > 0
            ? candidate.branch
            : 'agent/eval-dry-run';
      workerDryRun.prTitle =
        typeof workerDryRun.prTitle === 'string' && workerDryRun.prTitle.trim().length > 0
          ? workerDryRun.prTitle
          : typeof pullRequest.title === 'string' && pullRequest.title.trim().length > 0
            ? pullRequest.title
            : typeof scenario.title === 'string'
              ? scenario.title
              : 'Eval dry run';
      workerDryRun.summary =
        typeof workerDryRun.summary === 'string'
          ? workerDryRun.summary
          : typeof pullRequest.body === 'string'
            ? pullRequest.body
            : typeof review.summary === 'string'
              ? review.summary
              : '';
      if (review.reviewOutcome === undefined && typeof review.requiresRecode === 'boolean') {
        review.reviewOutcome = review.requiresRecode ? 'recode' : 'noop';
      }
      if (review.reviewOutcome === undefined && typeof review.noop === 'boolean') {
        review.reviewOutcome = review.noop ? 'noop' : 'recode';
      }
      if (review.criticRounds === undefined && Array.isArray(critic.rounds)) {
        review.criticRounds = critic.rounds.length;
      }
      if (review.maxCriticRounds === undefined && typeof critic.maxRounds === 'number') {
        review.maxCriticRounds = critic.maxRounds;
      }
      if (review.autoMergeEligible === undefined) {
        if (typeof expectedAutoMerge.expected === 'boolean') {
          review.autoMergeEligible = expectedAutoMerge.expected;
        } else if (typeof expectedAutoMerge.enabled === 'boolean') {
          review.autoMergeEligible = expectedAutoMerge.enabled;
        }
      }
      if (review.blockReason === undefined) {
        if (typeof expectedAutoMerge.blockReason === 'string') {
          review.blockReason = expectedAutoMerge.blockReason;
        } else if (typeof expectedAutoMerge.reason === 'string') {
          review.blockReason = expectedAutoMerge.reason;
        }
      }
      workerDryRun.review = review.verdict !== undefined ? review : undefined;
      workerDryRun.files = Array.isArray(workerDryRun.files) ? workerDryRun.files : [];
      workerDryRun.llmResponses = Array.isArray(workerDryRun.llmResponses)
        ? workerDryRun.llmResponses
        : [];
      workerDryRun.fixes = Array.isArray(workerDryRun.fixes) ? workerDryRun.fixes : [];
      workerDryRun.maxFixAttempts =
        typeof workerDryRun.maxFixAttempts === 'number' ? workerDryRun.maxFixAttempts : 2;
      workerDryRun.commitMessage = commitMessage;
      workerDryRun.commitAuthor =
        workerDryRun.commitAuthor && typeof workerDryRun.commitAuthor === 'object'
          ? workerDryRun.commitAuthor
          : typeof agent.name === 'string' && typeof agent.email === 'string'
            ? { name: agent.name, email: agent.email }
            : typeof candidate.authorName === 'string' && typeof candidate.authorEmail === 'string'
              ? { name: candidate.authorName, email: candidate.authorEmail }
              : undefined;
      workerDryRun.commitTrailers = Array.isArray(workerDryRun.commitTrailers)
        ? workerDryRun.commitTrailers
        : commitMessage
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.startsWith('Co-authored-by:'));
      workerDryRun.isolation =
        workerDryRun.isolation && typeof workerDryRun.isolation === 'object'
          ? workerDryRun.isolation
          : {
              allowNetwork:
                workerDryRun.allowNetwork === true || integrations.allowNetwork === true,
              allowGitHub: workerDryRun.allowGitHub === true || integrations.allowGitHub === true,
              allowLinear: workerDryRun.allowLinear === true || integrations.allowLinear === true,
              allowLiteLLM:
                workerDryRun.allowLiteLLM === true || integrations.allowLiteLLM === true,
              externalCalls: Array.isArray(workerDryRun.externalCalls)
                ? workerDryRun.externalCalls.filter(
                    (call): call is string => typeof call === 'string',
                  )
                : Array.isArray(integrations.externalCalls)
                  ? integrations.externalCalls.filter(
                      (call): call is string => typeof call === 'string',
                    )
                  : [],
            };

      scenario.workerDryRun = workerDryRun;
    }

    if (
      scenario.expected &&
      typeof scenario.expected === 'object' &&
      !Array.isArray(scenario.expected)
    ) {
      const expected = { ...(scenario.expected as Record<string, unknown>) };

      if (
        expected.changedFiles === undefined &&
        scenario.workerDryRun &&
        typeof scenario.workerDryRun === 'object' &&
        !Array.isArray(scenario.workerDryRun)
      ) {
        const workerDryRun = scenario.workerDryRun as Record<string, unknown>;
        if (Array.isArray(workerDryRun.files)) {
          expected.changedFiles = workerDryRun.files
            .filter((file) => file && typeof file === 'object' && !Array.isArray(file))
            .map((file) => (file as Record<string, unknown>).path)
            .filter((path): path is string => typeof path === 'string');
        }
      }

      if (expected.changedFiles === undefined) {
        expected.changedFiles = [];
      }

      if (
        expected.commit === undefined &&
        ((scenario.agent && typeof scenario.agent === 'object' && !Array.isArray(scenario.agent)) ||
          (scenario.commit &&
            typeof scenario.commit === 'object' &&
            !Array.isArray(scenario.commit)))
      ) {
        const agent = scenario.agent as Record<string, unknown> | undefined;
        const commit = scenario.commit as Record<string, unknown> | undefined;
        expected.commit = {
          author:
            typeof agent?.name === 'string' && typeof agent?.email === 'string'
              ? {
                  name: agent.name,
                  email: agent.email,
                }
              : undefined,
          messageIncludes: Array.isArray(commit?.mustInclude)
            ? commit.mustInclude.filter((entry): entry is string => typeof entry === 'string')
            : [],
          trailersInclude:
            typeof commit?.message === 'string'
              ? commit.message
                  .split('\n')
                  .map((line) => line.trim())
                  .filter((line) => line.startsWith('Co-authored-by:'))
              : [],
        };
      }

      if (
        expected.isolation === undefined &&
        scenario.fixtures &&
        typeof scenario.fixtures === 'object' &&
        !Array.isArray(scenario.fixtures)
      ) {
        const fixtures = scenario.fixtures as Record<string, unknown>;
        expected.isolation = {
          allowNetwork: fixtures.allowNetwork === true,
          allowGitHub: fixtures.allowGitHub === true,
          allowLinear: fixtures.allowLinear === true,
          allowLiteLLM: fixtures.allowLiteLLM === true,
          externalCalls: Array.isArray(fixtures.externalCalls)
            ? fixtures.externalCalls.filter((call): call is string => typeof call === 'string')
            : [],
        };
      }

      scenario.expected = expected;
    }

    return scenario;
  },
  z.object({
    version: z.literal(2).default(2),
    id: z.string().min(1),
    title: z.string().min(1),
    description: z.string().min(1),
    repo: z
      .object({
        files: z.record(z.string()),
      })
      .default({ files: {} }),
    candidate: z
      .object({
        files: z.record(z.string()).default({}),
        delete: z.array(z.string()).default([]),
      })
      .default({ files: {}, delete: [] }),
    workerDryRun: z
      .object({
        plan: z.string().min(1),
        branch: z.string().min(1).default('agent/eval-dry-run'),
        prTitle: z.string().min(1),
        summary: z.string().default(''),
        files: z.array(evalFileSchema).default([]),
        llmResponses: z.array(z.string()).default([]),
        fixes: z
          .array(
            z.object({
              summary: z.string().default(''),
              files: z.array(evalFileSchema).default([]),
            }),
          )
          .default([]),
        maxFixAttempts: z.number().int().min(0).default(2),
        commitMessage: z.string().default(''),
        commitAuthor: evalCommitAuthorSchema.optional(),
        commitTrailers: z.array(z.string()).default([]),
        review: evalReviewSchema.optional(),
        isolation: evalIsolationSchema.default({
          allowNetwork: false,
          allowGitHub: false,
          allowLinear: false,
          allowLiteLLM: false,
          externalCalls: [],
        }),
      })
      .optional(),
    commands: z.array(z.string()).default([]),
    expected: evalExpectedSchema,
  }),
);

export type EvalScenario = z.infer<typeof evalScenarioSchema>;

export interface EvalCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface EvalResult {
  id: string;
  title: string;
  passed: boolean;
  score: number;
  changedFiles: string[];
  commands: CommandResult[];
  checks: EvalCheck[];
  artifactDir: string;
  dryRun?: {
    branch: string;
    commitSha?: string;
    diff: string;
    filesChanged: string[];
    fixAttempts: number;
    prTitle: string;
    summary: string;
    pushed: false;
    commitMessage?: string;
    commitAuthor?: {
      name: string;
      email: string;
    };
    commitTrailers?: string[];
    reviewVerdict?: 'APROVADO' | 'APROVADO COM RESSALVAS' | 'SOLICITAR MUDANCAS';
    reviewOutcome?: 'noop' | 'recode';
    criticRounds?: number;
    maxCriticRounds?: number;
    autoMergeExpected?: boolean;
    autoMergeBlockedBy?: string;
    externalCalls?: string[];
  };
}

export interface EvalReport {
  generatedAt: string;
  passed: boolean;
  total: number;
  passedCount: number;
  score: number;
  trend?: EvalTrend;
  results: EvalResult[];
}

export interface EvalTrend {
  previousGeneratedAt?: string;
  previousScore?: number;
  scoreDelta?: number;
  regressed: boolean;
  regressedScenarios: string[];
}
