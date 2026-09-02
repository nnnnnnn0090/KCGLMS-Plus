import { describe, expect, it } from 'vitest';
import { findKingLmsUrl } from './kogi';

describe('findKingLmsUrl', () => {
  it('matches a course URL by the title without the leading period', () => {
    const url = findKingLmsUrl(
      [
        {
          displayName: 'Mon1 Intro Programming',
          externalAccessUrl: 'https://example.test/course-a',
        },
        { displayName: 'Tue2 Databases', externalAccessUrl: 'https://example.test/course-b' },
      ],
      '1 Intro Programming',
    );

    expect(url).toBe('https://example.test/course-a');
  });

  it('uses the leading period to disambiguate candidates', () => {
    const url = findKingLmsUrl(
      [
        { displayName: '火2 Web Design', externalAccessUrl: 'https://example.test/course-2' },
        { displayName: '月1 Web Design', externalAccessUrl: 'https://example.test/course-1' },
      ],
      '1 Web Design',
    );

    expect(url).toBe('https://example.test/course-1');
  });

  it('returns an empty string when no course matches', () => {
    const url = findKingLmsUrl(
      [{ displayName: 'Mon1 Networking', externalAccessUrl: 'https://example.test/course-a' }],
      '1 Intro Programming',
    );

    expect(url).toBe('');
  });
});
