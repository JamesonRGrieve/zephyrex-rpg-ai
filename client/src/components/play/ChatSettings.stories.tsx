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
      canon_checks: true,
      narrator_style: {},
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

/**
 * The sheet fades in: the play test waits for it before reading it. Lorebooks are no longer picked here (the
 * wiki owns them, d66915a), so a save keeps the chat's own as they were.
 */
export const Open: Story = {
  play: async ({ args }) => {
    const body = within(document.body);
    const save = (await body.findAllByRole('button', { name: 'Save' })).at(-1)!;
    await waitFor(() => expect(save).toBeVisible(), { timeout: 5000 });
    await userEvent.click(save);
    await expect(args.onSave).toHaveBeenCalledWith(expect.objectContaining({ lorebook_ids: args.value?.lorebook_ids }));
  },
};

/** Connection profiles (audit gap 8): one tap sets the preset and the model together. */
export const WithProfiles: Story = {
  args: { profiles: [{ id: 'c1', name: 'Long scenes', endpoint_id: 'e1', preset_id: 's1' }] },
  play: async ({ args }) => {
    const body = within(document.body);
    // The profiles sit under Advanced, closed until opened (6a969a3), in the open sheet (a story before this one
    // leaves its closing sheet in the page).
    await userEvent.click((await body.findAllByText('Advanced')).at(-1)!);
    const chip = (await body.findAllByRole('radio', { name: 'Long scenes' })).at(-1)!;
    await waitFor(() => expect(chip).toBeVisible(), { timeout: 5000 });
    await userEvent.click(chip);
    await userEvent.click(body.getAllByRole('button', { name: 'Save' }).at(-1)!);
    await expect(args.onSave).toHaveBeenCalledWith(expect.objectContaining({ preset_id: 's1', endpoint_id: 'e1' }));
  },
};
