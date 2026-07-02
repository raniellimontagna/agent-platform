import { describe, expect, it } from 'vitest';
import { isPlaneRemovalAction, normalizePlaneWebhook } from './planeWebhook.js';

describe('normalizePlaneWebhook', () => {
  it('accepts work_item payloads and extracts card, label, project, and previous-label data', () => {
    const event = normalizePlaneWebhook(
      {
        action: 'update',
        type: 'work_item',
        data: {
          id: 'plane-work-1',
          sequence_id: 17,
          name: 'Build parser seam',
          project_id: 'project-id',
          project_detail: { identifier: 'AGP' },
          labels: [
            { id: 'plane-ai-ready-id', name: 'ai-ready' },
            { id: 'plane-auto-merge-id', name: 'auto-merge' },
            { id: 'empty-label' },
          ],
        },
        updated_from: {
          labels: [{ id: 'old-label-id', name: 'old-label' }],
        },
      },
      undefined,
    );

    expect(event).toEqual({
      supported: true,
      action: 'update',
      event: 'work_item',
      cardId: 'plane-work-1',
      cardIdentifier: 'AGP-17',
      cardProjectId: 'project-id',
      title: 'Build parser seam',
      currentNames: ['ai-ready', 'auto-merge'],
      currentIds: ['plane-ai-ready-id', 'plane-auto-merge-id', 'empty-label'],
      previousNames: ['old-label'],
      previousIds: ['old-label-id'],
      previousLabelsPresent: true,
      removal: false,
    });
  });

  it('accepts issue payloads from the event header and updatedFrom variant', () => {
    const event = normalizePlaneWebhook(
      {
        action: 'update',
        type: 'ignored-type',
        data: {
          id: 'plane-issue-2',
          sequenceId: 22,
          name: 'Documented issue event',
          labels: [{ id: 'plane-approved-id', name: 'approved' }],
          project_identifier: 'SUP',
        },
        updatedFrom: {
          labels: [{ id: 'previous-approved-id', name: 'triage' }],
        },
      },
      'issue',
    );

    expect(event).toMatchObject({
      supported: true,
      action: 'update',
      event: 'issue',
      cardId: 'plane-issue-2',
      cardIdentifier: 'SUP-22',
      title: 'Documented issue event',
      currentNames: ['approved'],
      currentIds: ['plane-approved-id'],
      previousNames: ['triage'],
      previousIds: ['previous-approved-id'],
      previousLabelsPresent: true,
    });
  });

  it('uses AGP and the card id as identifier fallback when Plane omits sequence data', () => {
    expect(
      normalizePlaneWebhook(
        {
          action: 'create',
          event: 'work_item',
          data: {
            id: 'plane-work-without-sequence',
            name: 'No sequence',
            labels: [],
          },
        },
        undefined,
      ),
    ).toMatchObject({
      supported: true,
      cardIdentifier: 'plane-work-without-sequence',
      currentNames: [],
      currentIds: [],
      previousLabelsPresent: false,
    });
  });

  it('returns an unsupported result for non-work-item events', () => {
    expect(
      normalizePlaneWebhook(
        {
          action: 'update',
          event: 'comment',
        },
        undefined,
      ),
    ).toEqual({
      supported: false,
      action: 'update',
      event: 'comment',
      reason: 'unsupported event type',
    });
  });
});

describe('isPlaneRemovalAction', () => {
  it.each(['delete', 'deleted', 'remove', 'removed', 'archive', 'archived', 'DELETE'])(
    'recognizes %s as a Plane removal action',
    (action) => {
      expect(isPlaneRemovalAction(action)).toBe(true);
    },
  );

  it('rejects non-removal actions and missing actions', () => {
    expect(isPlaneRemovalAction('update')).toBe(false);
    expect(isPlaneRemovalAction(undefined)).toBe(false);
  });
});
