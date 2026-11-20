// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ThemeChips, themeLabel } from './ThemePicker';

describe('ThemeChips', () => {
  it('shows the theme in force and chooses another', async () => {
    const onChange = vi.fn();
    render(<ThemeChips themes={['light', 'dark', 'colorblind-dark']} current='dark' onChange={onChange} />);
    expect(screen.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('radio', { name: 'Colour-blind dark' }));
    expect(onChange).toHaveBeenCalledWith('colorblind-dark');
  });

  it('names an app’s own theme readably', () => {
    expect(themeLabel('high_contrast')).toBe('High contrast');
  });
});
