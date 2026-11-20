// SPDX-License-Identifier: AGPL-3.0-or-later
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deviceSettingsStore } from '~/features/settings/useDeviceSettings';
import { CustomCss, CustomCssEditor, CustomStyle } from './CustomCss';

afterEach(() => {
  window.localStorage.clear();
  deviceSettingsStore.reset();
});

describe('CustomCssEditor', () => {
  it('holds a draft until Apply, then applies it', async () => {
    const onApply = vi.fn();
    render(<CustomCssEditor css='' onApply={onApply} />);
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
    await userEvent.type(screen.getByRole('textbox', { name: 'Custom CSS' }), '.message {{ color: red; }');
    expect(screen.getByText('Not applied yet')).toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onApply).toHaveBeenCalledWith('.message { color: red; }');
  });

  it('clears the applied CSS', async () => {
    const onApply = vi.fn();
    render(<CustomCssEditor css='body { margin: 0; }' onApply={onApply} />);
    expect(screen.getByText('Applied')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onApply).toHaveBeenCalledWith('');
    expect(screen.getByRole('textbox', { name: 'Custom CSS' })).toHaveValue('');
  });
});

describe('CustomStyle', () => {
  it('adds the applied stylesheet to the page, and nothing when there is none', async () => {
    const { container } = render(
      <>
        <CustomCss />
        <CustomStyle />
      </>,
    );
    expect(container.querySelector('style[data-custom-css]')).toBeNull();
    await userEvent.type(screen.getByRole('textbox', { name: 'Custom CSS' }), 'p {{ color: teal; }');
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(container.querySelector('style[data-custom-css]')?.textContent).toBe('p { color: teal; }');
    expect(JSON.parse(window.localStorage.getItem('rpg-ai:device-settings') ?? '{}')).toMatchObject({
      customCss: 'p { color: teal; }',
    });
    act(() => deviceSettingsStore.change({ customCss: '' }));
    expect(container.querySelector('style[data-custom-css]')).toBeNull();
  });
});
