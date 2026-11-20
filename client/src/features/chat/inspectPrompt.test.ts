// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { deviceLanguage } from './inspectPrompt';

describe('deviceLanguage', () => {
  it('names the device’s language for the model, or passes an unknown one through', () => {
    expect(deviceLanguage('fr')).toBe('French');
    expect(deviceLanguage('pt-BR')).toBe('Brazilian Portuguese');
    expect(deviceLanguage('not a locale!')).toBe('not a locale!');
  });
});
