// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, fn, userEvent, within } from 'storybook/test';
import { PersonaFormView } from './PersonaManager';

const meta: Meta<typeof PersonaFormView> = {
  title: 'Manage/Persona form',
  component: PersonaFormView,
  decorators: [(Story) => <div className='max-w-lg'>{Story()}</div>],
  args: {
    persona: null,
    characterOptions: [
      { id: 'c-ada', name: 'Ada' },
      { id: 'c-bram', name: 'Bram' },
    ],
    lorebookOptions: [{ id: 'b1', name: 'Sam’s past' }],
    onSave: fn(),
  },
};
export default meta;
type Story = StoryObj<typeof PersonaFormView>;

/** A new persona; placing the description at a depth asks how deep and who says it. */
export const New: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('radio', { name: 'In the chat, at a depth' }));
    await expect(canvas.getByLabelText('Messages from the end')).toHaveValue(2);
  },
};

/** Sam, locked to Ada, with the description under the author's note. */
export const LockedToAda: Story = {
  args: {
    persona: {
      id: 'p1',
      created_at: 'x',
      updated_at: null,
      name: 'Sam',
      title: 'Deckhand',
      description: '{{user}} is a new deckhand.',
      avatar: null,
      is_default: false,
      description_position: 'note_bottom',
      description_depth: 2,
      description_role: 'system',
      lorebook_id: 'b1',
      character_ids: ['c-ada'],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText('Ada')).toBeChecked();
    await expect(canvas.getByRole('radio', { name: 'Below the author’s note' })).toHaveAttribute('aria-checked', 'true');
  },
};
