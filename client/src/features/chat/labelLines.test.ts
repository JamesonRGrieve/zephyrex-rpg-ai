// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { labelledLines, readLabels } from './labelLines';

describe('line labels', () => {
  it("the tankard: an unattributed line becomes the thrower's throw; meta is dropped", () => {
    const labels = readLabels([
      { index: 0, kind: 'drop', text: '(There is no security.)', actor_name: null, icon: null },
      { index: 1, kind: 'do', text: 'A second tankard follows the first.', actor_name: 'Brakka Ironmantle', icon: 'throw' },
    ]);
    expect(labels).not.toBeNull();
    expect(labelledLines(labels ?? [], 'Brakka Ironmantle')).toEqual([
      { kind: 'do', speaker: 'Brakka Ironmantle', target: null, text: 'A second tankard follows the first.', icon: 'throw' },
    ]);
  });
  it('unknown icons and kinds are ignored; nothing usable is null', () => {
    expect(readLabels([{ kind: 'sing', text: 'la' }])).toBeNull();
    expect(readLabels([{ kind: 'do', text: 'waves', actor_name: 'Mags', icon: 'teleport' }])?.[0]?.icon).toBeNull();
    expect(readLabels(null)).toBeNull();
  });
  it('speech keeps its manner and target', () => {
    const labels = readLabels([{ kind: 'say', text: 'Out.', actor_name: 'Mags', target_name: 'Fennick', manner: 'shout' }]);
    expect(labelledLines(labels ?? [], 'Narrator')).toEqual([
      { kind: 'say', speaker: 'Mags', target: 'Fennick', manner: 'shout', text: 'Out.' },
    ]);
  });
  it("a stored line shows its own words, its name off (build60's live run, 2026-11-24)", () => {
    const labels = readLabels([
      { kind: 'do', text: 'Bram Holloway sets down the cup with deliberate care.', actor_name: 'Bram Holloway' },
      { kind: 'do', text: "Delphine Halloway's spine stiffens.", actor_name: 'Delphine Halloway' },
      {
        kind: 'say',
        text: 'Delphine Halloway (to Ashford): "Mr. Ashford, my husband is many things."',
        actor_name: 'Delphine Halloway',
      },
      { kind: 'narrate', text: 'Narrator: The fire pops.' },
    ]);
    expect(labelledLines(labels ?? [], 'Narrator').map((line) => line.text)).toEqual([
      'sets down the cup with deliberate care.',
      "'s spine stiffens.",
      'Mr. Ashford, my husband is many things.',
      'The fire pops.',
    ]);
  });
  it('an action by "the narrator" is narration', () => {
    expect(
      labelledLines(readLabels([{ kind: 'do', text: 'Rain falls.', actor_name: 'the narrator' }]) ?? [], 'Mags'),
    ).toEqual([{ kind: 'narrate', text: 'Rain falls.' }]);
  });
});
