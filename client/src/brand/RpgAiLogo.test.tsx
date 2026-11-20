// SPDX-License-Identifier: AGPL-3.0-or-later
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RpgAiLogo } from './RpgAiLogo';

describe('RpgAiLogo', () => {
  it('is decorative and drawn in theme colours', () => {
    const { container } = render(<RpgAiLogo />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden');
    expect(container.querySelector('.fill-primary')).not.toBeNull();
  });
});
