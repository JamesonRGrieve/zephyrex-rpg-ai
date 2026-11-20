// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LORE } from '~/contract';
import { ChatSettings } from './ChatSettings';

const VALUE = { title: 'Chat with Ada', persona_id: null, preset_id: null, endpoint_id: null, author_note: '', lorebook_ids: [], lore_settings: {}, system_prompt: '' };

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
});
