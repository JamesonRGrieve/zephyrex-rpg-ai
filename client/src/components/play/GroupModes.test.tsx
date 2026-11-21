// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { GroupSettings } from '~/features/chat/groupSettings';
import { GroupModes } from './GroupModes';

function Harness({ onChange }: { onChange: (next: GroupSettings) => void }) {
  const [value, setValue] = useState<GroupSettings>({});
  return (
    <GroupModes
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

describe('GroupModes (audit gap 6)', () => {
  it('sets joined cards with their affixes, pooled order, auto-reply and a group scenario', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    expect(screen.queryByLabelText('Before each card')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'Every member’s card' }));
    expect(screen.getByLabelText('Before each card')).toHaveValue('<{{char}}>');
    expect(screen.getByLabelText('Let a member answer themself')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'Everyone once' }));
    expect(screen.queryByLabelText('Let a member answer themself')).not.toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('Reply by themselves after (seconds)'));
    await userEvent.type(screen.getByLabelText('Reply by themselves after (seconds)'), '30');
    await userEvent.type(screen.getByLabelText('Group scenario'), 'A storm.');
    expect(onChange).toHaveBeenLastCalledWith({
      card_mode: 'join',
      order: 'pooled',
      auto_seconds: 30,
      scenario: 'A storm.',
    });
  });
});
