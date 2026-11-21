// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConnectionProfileFormView, profileSummary } from './ConnectionProfileManager';

const MODELS = [{ id: 'e1', name: 'Claude' }];
const SETTINGS = [{ id: 'p1', name: 'Careful' }];

describe('ConnectionProfileFormView', () => {
  it('saves a name with the model and preset picked', async () => {
    const onSave = vi.fn(async () => null);
    render(<ConnectionProfileFormView profile={null} models={MODELS} settings={SETTINGS} onSave={onSave} done={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Profile name'), 'Long scenes');
    await userEvent.selectOptions(screen.getByLabelText('Model'), 'e1');
    await userEvent.selectOptions(screen.getByLabelText('Preset'), 'p1');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith({ name: 'Long scenes', endpoint_id: 'e1', preset_id: 'p1' });
  });

  it('says why a profile was not saved', async () => {
    const done = vi.fn();
    render(
      <ConnectionProfileFormView
        profile={null}
        models={MODELS}
        settings={SETTINGS}
        onSave={async () => 'The model must be one of yours'}
        done={done}
      />,
    );
    await userEvent.type(screen.getByLabelText('Profile name'), 'X');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('The model must be one of yours')).toBeInTheDocument();
    expect(done).not.toHaveBeenCalled();
  });
});

describe('profileSummary', () => {
  it('names the model and preset, or the defaults, or a deleted one', () => {
    expect(profileSummary({ name: 'x', endpoint_id: 'e1', preset_id: null }, MODELS, SETTINGS)).toBe(
      'Claude · Default settings',
    );
    expect(profileSummary({ name: 'x', endpoint_id: 'gone', preset_id: 'p1' }, MODELS, SETTINGS)).toBe(
      'A deleted one · Careful',
    );
  });
});
