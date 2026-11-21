// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { ChatSettings } from './ChatSettings';

const meta: Meta<typeof ChatSettings> = {
  title: 'Play/Chat settings',
  component: ChatSettings,
  args: {
    open: true,
    onOpenChange: fn(),
    onSave: fn(),
    value: {
      title: 'Chat with Ada',
      persona_id: null,
      preset_id: null,
      endpoint_id: null,
      author_note: '',
      lorebook_ids: ['b1'],
      lore_settings: {},
      system_prompt: '',
      summary: '',
      tags: [],
      folder: '',
      muted_ids: [],
      background: null,
      objectives: [],
      content_rating: null,
      seat: null,
      lines: [],
      veils: [],
      table_notes: [],
      campaign_id: null,
      scenario_id: null,
    },
    personas: [{ id: 'p1', name: 'Sam' }],
    presets: [{ id: 's1', name: 'Creative' }],
    endpoints: [{ id: 'e1', name: 'Local Ollama' }],
    lorebooks: [
      { id: 'b1', name: 'The Kestrel' },
      { id: 'b2', name: 'Ring of Islands' },
    ],
  },
};
export default meta;
type Story = StoryObj<typeof ChatSettings>;

/** The sheet fades in: the play test waits for it before reading it. */
export const Open: Story = {
  play: async ({ args }) => {
    const body = within(document.body);
    const book = await body.findByLabelText('Ring of Islands');
    await waitFor(() => expect(book).toBeVisible());
    await userEvent.click(book);
    await userEvent.click(body.getByRole('button', { name: 'Save' }));
    await expect(args.onSave).toHaveBeenCalledWith(expect.objectContaining({ lorebook_ids: ['b1', 'b2'] }));
  },
};
