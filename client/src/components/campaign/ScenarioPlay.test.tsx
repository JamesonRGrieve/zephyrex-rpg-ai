// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SABOTAGE } from './fixtures';
import { ScenarioPlay } from './ScenarioPlay';

describe('ScenarioPlay', () => {
  it('fills a clock, finds a clue and marks a beat', async () => {
    const onChange = vi.fn();
    render(<ScenarioPlay scenario={SABOTAGE} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Fill a segment of The pump fails' }));
    expect(onChange).toHaveBeenLastCalledWith({ clocks: [{ ...SABOTAGE.clocks[0], filled: 4 }] });
    await userEvent.click(screen.getByRole('checkbox', { name: 'Her gloves' }));
    expect(onChange.mock.lastCall?.[0].secrets[0].clues[1].found).toBe(true);
    await userEvent.click(screen.getByRole('checkbox', { name: 'The buyer hails' }));
    expect(onChange).toHaveBeenLastCalledWith({ beats: [{ text: 'The buyer hails', done: true }] });
  });

  it('says what happens when a clock is full, and stops it at full', () => {
    render(
      <ScenarioPlay
        scenario={{ ...SABOTAGE, clocks: [{ ...SABOTAGE.clocks[0], filled: 4 } as (typeof SABOTAGE.clocks)[number]] }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText('Full: the ship drifts')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fill a segment of The pump fails' })).toBeDisabled();
  });
});
