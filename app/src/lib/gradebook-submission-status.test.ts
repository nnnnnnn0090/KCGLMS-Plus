import { describe, expect, it } from 'vitest';
import {
  enrichDueItemsWithSubmissionStatus,
  submissionFromGradebookAttemptsResponse,
  submissionFromGradebookUsersResponse,
} from './gradebook-submission-status';

describe('gradebook-submission-status', () => {
  it('treats NeedsGrading and Graded as submitted', () => {
    expect(
      submissionFromGradebookUsersResponse(200, {
        results: [{ status: 'NeedsGrading' }],
      }),
    ).toBe(true);
    expect(
      submissionFromGradebookUsersResponse(200, {
        results: [{ status: 'Graded' }],
      }),
    ).toBe(true);
  });

  it('treats grade-detail-not-loaded 404 as not submitted', () => {
    expect(
      submissionFromGradebookUsersResponse(404, {
        code: '-grade-detail-not-loaded',
      }),
    ).toBe(false);
  });

  it('treats empty results as not submitted', () => {
    expect(submissionFromGradebookUsersResponse(200, { results: [] })).toBe(false);
  });

  it('treats InProgress as not submitted', () => {
    expect(
      submissionFromGradebookUsersResponse(200, {
        results: [{ status: 'InProgress' }],
      }),
    ).toBe(false);
  });

  it('attempts API: non-empty NeedsGrading means submitted', () => {
    expect(
      submissionFromGradebookAttemptsResponse(200, {
        results: [{ status: 'NeedsGrading' }],
      }),
    ).toBe(true);
  });

  it('attempts API: empty results means not submitted', () => {
    expect(submissionFromGradebookAttemptsResponse(200, { results: [] })).toBe(false);
  });

  it('enriches DueItem rows via users API', async () => {
    const fetchFn = (async (input: string | URL) => {
      const url = String(input);
      if (url.includes('/users')) {
        if (url.includes('_164061_1')) {
          return new Response(JSON.stringify({ results: [{ status: 'NeedsGrading' }] }), {
            status: 200,
          });
        }
        if (url.includes('_173958_1')) {
          return new Response(JSON.stringify({ code: '-grade-detail-not-loaded' }), {
            status: 404,
          });
        }
      }
      return new Response('{}', { status: 500 });
    }) as typeof fetch;

    const out = await enrichDueItemsWithSubmissionStatus(
      [
        {
          courseId: '_11678_1',
          sourceId: '_164061_1',
          title: 'A',
          dueDate: '2026-06-01T00:00:00.000Z',
        },
        {
          courseId: '_2396_1',
          sourceId: '_173958_1',
          title: 'B',
          dueDate: '2026-06-02T00:00:00.000Z',
        },
      ],
      fetchFn,
    );

    expect(out[0]?.submitted).toBe(true);
    expect(out[1]?.submitted).toBe(false);
  });

  it('falls back to attempts API when users API fails', async () => {
    const fetchFn = (async (input: string | URL) => {
      const url = String(input);
      if (url.includes('/users')) {
        return new Response('{}', { status: 500 });
      }
      if (url.includes('/attempts') && url.includes('_164061_1')) {
        return new Response(
          JSON.stringify({
            results: [{ status: 'Completed' }],
          }),
          { status: 200 },
        );
      }
      if (url.includes('/attempts')) {
        return new Response(JSON.stringify({ results: [] }), { status: 200 });
      }
      return new Response('{}', { status: 500 });
    }) as typeof fetch;

    const out = await enrichDueItemsWithSubmissionStatus(
      [
        {
          courseId: '_11678_1',
          sourceId: '_164061_1',
          title: 'A',
          dueDate: '2026-06-01T00:00:00.000Z',
        },
        {
          courseId: '_2396_1',
          sourceId: '_173958_1',
          title: 'B',
          dueDate: '2026-06-02T00:00:00.000Z',
        },
      ],
      fetchFn,
    );

    expect(out[0]?.submitted).toBe(true);
    expect(out[1]?.submitted).toBe(false);
  });

  it('always sets submitted boolean even without course/source ids', async () => {
    const fetchFn = (async () => new Response('{}', { status: 500 })) as typeof fetch;
    const out = await enrichDueItemsWithSubmissionStatus(
      [{ title: 'No ids', dueDate: '2026-06-01T00:00:00.000Z' }],
      fetchFn,
    );
    expect(out[0]?.submitted).toBe(false);
  });
});
