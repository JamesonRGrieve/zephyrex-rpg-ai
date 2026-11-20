// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ObjectivesEditor } from './ObjectivesEditor';

const LIST = [
  { text: 'Board the Kestrel', done: true },
  { text: 'Fix the pump', done: false },
];

describe('ObjectivesEditor', () => {
  it('marks the first not done as current, and ticks, removes and adds', async () => {
    const onChange = vi.fn();
    render(<ObjectivesEditor value={LIST} onChange={onChange} />);
    expect(screen.getByText('Current').parentElement).toHaveTextContent('Fix the pump');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Done: Fix the pump' }));
    expect(onChange).toHaveBeenLastCalledWith([LIST[0], { text: 'Fix the pump', done: true }]);
    await userEvent.click(screen.getByRole('button', { name: 'Remove Board the Kestrel' }));
    expect(onChange).toHaveBeenLastCalledWith([LIST[1]]);
    await userEvent.type(screen.getByLabelText('New objective'), ' Reach Vell {Enter}');
    expect(onChange).toHaveBeenLastCalledWith([...LIST, { text: 'Reach Vell', done: false }]);
  });
});
