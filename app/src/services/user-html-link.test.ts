import { describe, expect, it } from 'vitest';
import {
  activePortalUserLinks,
  buildPortalUserLinkSavePayload,
  createPortalUserLinkDraft,
  nextPortalLinkNo,
  parsePortalUserLinks,
} from './user-html-link';

describe('user-html-link', () => {
  it('parses portal user link records', () => {
    const links = parsePortalUserLinks([
      {
        id: '1',
        version: 2,
        linkNo: 3,
        midashi: 'Test',
        url: 'https://example.com/',
        biko: '',
        order: 0,
        delFlg: false,
      },
    ]);
    expect(links).toEqual([
      {
        id: '1',
        version: 2,
        linkNo: 3,
        midashi: 'Test',
        url: 'https://example.com/',
        biko: '',
        order: 0,
        delFlg: false,
      },
    ]);
  });

  it('creates save payload like Profile page', () => {
    const links = [
      createPortalUserLinkDraft([], 'New', 'https://example.com'),
      {
        ...createPortalUserLinkDraft([], 'Remove', 'https://remove.example'),
        id: '',
        delFlg: true,
      },
    ];
    expect(buildPortalUserLinkSavePayload(links)).toEqual([
      {
        id: '',
        version: '',
        delFlg: false,
        linkNo: 1,
        midashi: 'New',
        url: 'https://example.com',
        biko: '',
        order: 0,
      },
    ]);
  });

  it('computes next linkNo from active links', () => {
    const links = parsePortalUserLinks([
      {
        id: '1',
        version: 1,
        linkNo: 4,
        midashi: 'A',
        url: 'https://a.test',
        biko: '',
        order: 0,
        delFlg: false,
      },
      {
        id: '2',
        version: 1,
        linkNo: 9,
        midashi: 'B',
        url: 'https://b.test',
        biko: '',
        order: 0,
        delFlg: true,
      },
    ]);
    expect(nextPortalLinkNo(links)).toBe(10);
    expect(activePortalUserLinks(links)).toHaveLength(1);
  });
});
