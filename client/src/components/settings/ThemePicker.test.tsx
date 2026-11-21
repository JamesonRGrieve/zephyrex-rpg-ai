// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ThemeChips, ThemePicker, themeLabel } from './ThemePicker';

describe('ThemeChips', () => {
  it('shows the theme in force and chooses another', async () => {
    const onChange = vi.fn();
    render(<ThemeChips themes={['light', 'dark', 'colorblind-dark']} current='dark' onChange={onChange} />);
    expect(screen.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('radio', { name: 'Colour-blind dark' }));
    expect(onChange).toHaveBeenCalledWith('colorblind-dark');
  });

  it('marks the theme the server read, in its first render (not "Light")', () => {
    // On the server the cookie can't be read from script; hydration keeps whatever this marks.
    const html = renderToString(<ThemePicker initialTheme='dark' />);
    expect(html).toMatch(/aria-checked="true"[^>]*>Dark</);
    expect(html).not.toMatch(/aria-checked="true"[^>]*>Light</);
  });

  it('names an app’s own theme readably', () => {
    expect(themeLabel('high_contrast')).toBe('High contrast');
  });
});
