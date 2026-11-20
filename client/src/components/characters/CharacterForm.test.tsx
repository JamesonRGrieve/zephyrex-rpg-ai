// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { type CharacterDraft, CharacterForm, parseTags } from './CharacterForm';
import { ADA_DRAFT } from './fixtures';

function Harness({ onSeen }: { onSeen: (draft: CharacterDraft) => void }) {
  const [value, setValue] = useState(ADA_DRAFT);
  return (
    <CharacterForm
      value={value}
      onChange={(next) => {
        setValue(next);
        onSeen(next);
      }}
    />
  );
}

describe('CharacterForm', () => {
  it('edits the name, and adds and removes greetings', async () => {
    let last = ADA_DRAFT;
    render(<Harness onSeen={(draft) => (last = draft)} />);
    const name = screen.getByLabelText('Name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Ada');
    expect(last.name).toBe('Ada');
    await userEvent.click(screen.getByRole('button', { name: 'Add a greeting' }));
    expect(last.alternate_greetings).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: 'Remove alternate greeting 1' }));
    expect(last.alternate_greetings).toEqual(['']);
  });

  it('reads tags as a comma-separated list without blanks or repeats', () => {
    expect(parseTags(' fantasy, mentor,,fantasy ')).toEqual(['fantasy', 'mentor']);
  });
});
