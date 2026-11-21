// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ConnectionProfileFormView } from './ConnectionProfileManager';

const meta: Meta<typeof ConnectionProfileFormView> = {
  title: 'Manage/Connection profile form',
  component: ConnectionProfileFormView,
  decorators: [(Story) => <div className='max-w-lg'>{Story()}</div>],
  args: {
    profile: null,
    models: [
      { id: 'e1', name: 'Claude' },
      { id: 'e2', name: 'Local Mistral' },
    ],
    settings: [{ id: 'p1', name: 'Careful' }],
    onSave: fn(async () => null),
    done: fn(),
  },
};
export default meta;
type Story = StoryObj<typeof ConnectionProfileFormView>;

/** A new profile: a name, a model and a preset. */
export const New: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText('Profile name'), 'Long scenes');
    await userEvent.selectOptions(canvas.getByLabelText('Model'), 'e1');
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }));
    await expect(args.onSave).toHaveBeenCalledWith({ name: 'Long scenes', endpoint_id: 'e1', preset_id: null });
  },
};

/** Editing one; the default model stays when none is picked. */
export const Editing: Story = {
  args: {
    profile: { id: 'c1', created_at: 'x', updated_at: null, name: 'Fast', endpoint_id: null, preset_id: 'p1' },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText('Model')).toHaveValue('');
    await expect(canvas.getByLabelText('Preset')).toHaveValue('p1');
  },
};
