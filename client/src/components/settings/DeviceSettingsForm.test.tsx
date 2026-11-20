// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_DEVICE_SETTINGS } from '~/features/settings/deviceSettings';
import { DeviceSettingsForm } from './DeviceSettingsForm';

describe('DeviceSettingsForm', () => {
  it('chooses a tier and turns table talk off', async () => {
    const onChange = vi.fn();
    render(<DeviceSettingsForm settings={{ ...DEFAULT_DEVICE_SETTINGS, tier: 'auto', showTableTalk: true }} measured='strong' onChange={onChange} />);
    expect(screen.getByRole('radio', { name: /Automatic/ })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('radio', { name: /Balanced/ }));
    expect(onChange).toHaveBeenCalledWith({ tier: 'standard' });
    await userEvent.click(screen.getByRole('switch', { name: 'Show table talk in chats' }));
    expect(onChange).toHaveBeenCalledWith({ showTableTalk: false });
  });
});
