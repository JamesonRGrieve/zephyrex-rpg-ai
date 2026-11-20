// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LORE } from '~/contract';
import { ChatSettings } from './ChatSettings';

const VALUE = { title: 'Chat with Ada', persona_id: null, preset_id: null, endpoint_id: null, author_note: '', lorebook_ids: [], lore_settings: {}, system_prompt: '', summary: '', tags: [], folder: '', muted_ids: [], background: null, objectives: [], content_rating: null, lines: [], veils: [], table_notes: [] };

describe('ChatSettings', () => {
  it('saves the lorebooks picked, World Info settings within range, and leaves blank settings out', async () => {
    const onSave = vi.fn();
    render(
      <ChatSettings
        open
        onOpenChange={vi.fn()}
        value={VALUE}
        personas={[]}
        presets={[]}
        endpoints={[]}
        lorebooks={[{ id: 'b1', name: 'The Kestrel' }]}
        onSave={onSave}
      />,
    );
    await userEvent.click(await screen.findByLabelText('The Kestrel'));
    await userEvent.type(screen.getByLabelText('Messages scanned'), '5000');
    await userEvent.click(screen.getByLabelText('Keys match whole words only'));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        lorebook_ids: ['b1'],
        lore_settings: { scan_depth: LORE.ranges.scan_depth[1], match_whole_words: true },
      }),
    );
  });

  it('fills the summary from the model, for the person to edit before saving', async () => {
    const onSave = vi.fn();
    render(
      <ChatSettings
        open
        onOpenChange={vi.fn()}
        value={VALUE}
        personas={[]}
        presets={[]}
        endpoints={[]}
        lorebooks={[]}
        onSave={onSave}
        onSummarize={async () => 'They docked at Vell.'}
      />,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Summarise the story so far' }));
    const summary = await screen.findByDisplayValue('They docked at Vell.');
    await userEvent.type(summary, ' It rained.');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ summary: 'They docked at Vell. It rained.' }));
  });

  it('files the chat in a folder with tags', async () => {
    const onSave = vi.fn();
    render(<ChatSettings open onOpenChange={vi.fn()} value={VALUE} personas={[]} presets={[]} endpoints={[]} lorebooks={[]} folders={['Kestrel']} onSave={onSave} />);
    await userEvent.type(await screen.findByLabelText('Folder'), ' Kestrel ');
    await userEvent.type(screen.getByLabelText('Tags'), 'heist, , Vell, heist');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ folder: 'Kestrel', tags: ['heist', 'Vell'] }));
  });

  it('leaves a group member out of the turn order', async () => {
    const onSave = vi.fn();
    render(
      <ChatSettings
        open
        onOpenChange={vi.fn()}
        value={VALUE}
        personas={[]}
        presets={[]}
        endpoints={[]}
        lorebooks={[]}
        cast={[
          { id: 'a', name: 'Ada' },
          { id: 'b', name: 'Bram' },
        ]}
        onSave={onSave}
      />,
    );
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Bram' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ muted_ids: ['b'] }));
  });

  it('sets the table’s safety tools', async () => {
    const onSave = vi.fn();
    render(<ChatSettings open onOpenChange={vi.fn()} value={VALUE} personas={[]} presets={[]} endpoints={[]} lorebooks={[]} onSave={onSave} />);
    await userEvent.click(await screen.findByRole('radio', { name: 'Teen' }));
    await userEvent.type(screen.getByLabelText('Lines (never, even off-screen)'), 'spiders, ');
    await userEvent.type(screen.getByLabelText('Veils (off-screen only)'), 'gore');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ content_rating: 'teen', lines: ['spiders'], veils: ['gore'] }));
  });
});

