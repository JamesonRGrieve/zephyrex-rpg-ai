// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { withoutSpeakerPrefix } from './speakerPrefix';

describe('withoutSpeakerPrefix', () => {
  it("drops the reply's own name at its start, plain or bold, any case", () => {
    expect(withoutSpeakerPrefix('Gus Veridan: Gus leans on the bulkhead.', 'Gus Veridan')).toBe(
      'Gus leans on the bulkhead.',
    );
    expect(withoutSpeakerPrefix('**A.Z.**: *closes his eyes*', 'A.Z.')).toBe('*closes his eyes*');
    expect(withoutSpeakerPrefix('  gus veridan :  Aye.', 'Gus Veridan')).toBe('Aye.');
  });

  it('keeps a reasoning block, another name, or the name later in the line', () => {
    expect(withoutSpeakerPrefix('<think>hm</think>\nGus Veridan: Aye.', 'Gus Veridan')).toBe('<think>hm</think>\nAye.');
    expect(withoutSpeakerPrefix('Magnus: Hold.', 'Gus Veridan')).toBe('Magnus: Hold.');
    expect(withoutSpeakerPrefix('He says, "Gus Veridan: reporting."', 'Gus Veridan')).toBe(
      'He says, "Gus Veridan: reporting."',
    );
  });
});
