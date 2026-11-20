// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { LIMITS } from '~/contract';
import type { EntryFields } from '~/features/import/stLorebook';
import { clampTo, EntryForm, parseKeys } from './EntryForm';
import { BLANK_ENTRY } from './fixtures';

function Harness({ seen }: { seen: (entry: EntryFields) => void }) {
  const [value, setValue] = useState(BLANK_ENTRY);
  return (
    <EntryForm
      value={value}
      onChange={(next) => {
        setValue(next);
        seen(next);
      }}
    />
  );
}

describe('EntryForm', () => {
  it('takes keys one per line, shows the group options only with a group, and depth only at a depth', async () => {
    let last = BLANK_ENTRY;
    render(<Harness seen={(entry) => (last = entry)} />);
    const keys = screen.getByLabelText('Keys');
    await userEvent.type(keys, 'spanner{Enter}/a,b/i{Enter}spanner');
    fireEvent.blur(keys);
    expect(last.keys).toEqual(['spanner', '/a,b/i']);

    expect(screen.queryByLabelText('Group weight')).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Inclusion group'), 'rumour');
    expect(screen.getByLabelText('Group weight')).toBeInTheDocument();

    expect(screen.queryByLabelText('As')).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Position'), 'at_depth');
    expect(last.position).toBe('at_depth');
    expect(screen.getByLabelText('As')).toBeInTheDocument();
  });

  it('turns matching back to the chat’s setting', async () => {
    let last = BLANK_ENTRY;
    render(<Harness seen={(entry) => (last = entry)} />);
    await userEvent.selectOptions(screen.getByLabelText('Case-sensitive'), 'on');
    expect(last.case_sensitive).toBe(true);
    await userEvent.selectOptions(screen.getByLabelText('Case-sensitive'), 'book');
    expect(last.case_sensitive).toBeNull();
  });
});

describe('entry helpers', () => {
  it('keeps keys within the limits', () => {
    expect(parseKeys('a\n\n a \nb')).toEqual(['a', 'b']);
    expect(parseKeys('x'.repeat(LIMITS.lore_key_characters + 1))).toEqual([]);
  });

  it('clamps a number into its range, and keeps the old value for nonsense', () => {
    expect(clampTo('250', 'probability', 100)).toBe(100);
    expect(clampTo('-3', 'depth', 4)).toBe(0);
    expect(clampTo('', 'order', 100)).toBe(100);
  });
});
