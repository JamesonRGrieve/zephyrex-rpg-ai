// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MoreSamplers } from './MoreSamplers';

describe('MoreSamplers (audit gap 2)', () => {
  it('sets a sampler within its range, and clearing it takes it off', () => {
    const onChange = vi.fn();
    const { rerender } = render(<MoreSamplers value={{}} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Min P'), { target: { value: '1.7' } });
    expect(onChange).toHaveBeenLastCalledWith({ min_p: 1 });
    fireEvent.change(screen.getByLabelText('Mirostat mode (1 or 2)'), { target: { value: '1.6' } });
    expect(onChange).toHaveBeenLastCalledWith({ mirostat_mode: 2 });

    rerender(<MoreSamplers value={{ min_p: 0.05, seed: 7 }} onChange={onChange} />);
    expect(screen.getByText('More samplers (2 set)')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Min P'), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith({ seed: 7 });
  });

  it('keeps banned strings one per line, and says which servers take each', () => {
    const onChange = vi.fn();
    render(<MoreSamplers value={{}} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Banned strings'), { target: { value: 'As an AI\n\nI cannot' } });
    expect(onChange).toHaveBeenLastCalledWith({ banned_strings: ['As an AI', 'I cannot'] });
    expect(screen.getByLabelText('Seed')).toHaveAccessibleDescription('Every server.');
    expect(screen.getByLabelText('DRY base')).toHaveAccessibleDescription(
      'Text servers and AI Horde, with DRY multiplier set.',
    );
  });
});
