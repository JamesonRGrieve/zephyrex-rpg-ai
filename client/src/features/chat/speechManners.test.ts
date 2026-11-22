// @vitest-environment node
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import cases from '../../../../contract/speech-options-cases.json';
import { type Holder, speechManners } from './speechManners';

describe('the speech options cases both twins run', () => {
  it.each(cases.cases)('$name', ({ system, speaker, options }) => {
    expect(speechManners(system, speaker as Holder, cases.present, cases.known as Holder[], cases.parents)).toEqual(options);
  });
});
