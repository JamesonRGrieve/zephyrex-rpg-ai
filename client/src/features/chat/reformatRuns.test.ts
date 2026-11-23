// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { partsOfRuns } from './reformatRuns';

const CAST = [
  { id: 'y1', name: 'Ysolde Varrin' },
  { id: 'f1', name: 'Fennick Quill' },
];

describe('partsOfRuns', () => {
  it('saves the narrator as prose and each speaker as their lines, credited to them', () => {
    const parts = partsOfRuns(
      [
        {
          speaker_id: null,
          speaker_name: null,
          lines: [{ kind: 'narrate', manner: null, target_id: null, target_name: null, text: 'Rain hammers the shutters.' }],
        },
        {
          speaker_id: 'y1',
          speaker_name: null,
          lines: [
            { kind: 'say', manner: 'whisper', target_id: 'f1', target_name: null, text: 'You are brave, or foolish.' },
          ],
        },
      ],
      CAST,
    );
    expect(parts).toEqual([
      { speaker_id: null, text: 'Rain hammers the shutters.' },
      { speaker_id: 'y1', text: expect.stringContaining('Ysolde Varrin (to Fennick Quill') as unknown as string },
    ]);
    expect(parts[1]?.text).toContain('"You are brave, or foolish."');
  });

  it('names someone the cast does not hold in their own lines', () => {
    const [part] = partsOfRuns(
      [
        {
          speaker_id: null,
          speaker_name: 'A dockhand',
          lines: [{ kind: 'do', manner: null, target_id: null, target_name: null, text: 'spits.' }],
        },
      ],
      CAST,
    );
    expect(part).toEqual({ speaker_id: null, text: 'A dockhand spits.' });
  });
});
