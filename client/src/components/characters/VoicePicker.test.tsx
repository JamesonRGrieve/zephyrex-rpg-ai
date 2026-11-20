// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_VOICE } from '~/features/speech/voice';
import { VoicePicker } from './VoicePicker';

describe('VoicePicker (A29)', () => {
  it('names a server voice even where the browser cannot speak, and clears it to the default', () => {
    // jsdom has no speech synthesis: only the server voice and the speed are offered.
    const onChange = vi.fn();
    const { rerender } = render(<VoicePicker name='Ada' value={DEFAULT_VOICE} onChange={onChange} />);
    expect(screen.queryByLabelText(/Pitch on this device/)).toBeNull();
    fireEvent.change(screen.getByLabelText('Voice on your speech model'), { target: { value: ' onyx ' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_VOICE, server: 'onyx' });

    rerender(<VoicePicker name='Ada' value={{ ...DEFAULT_VOICE, server: 'onyx' }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Voice on your speech model'), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith(DEFAULT_VOICE);
  });

  it('sets the speed both voices use', () => {
    const onChange = vi.fn();
    render(<VoicePicker name='Ada' value={DEFAULT_VOICE} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/Speed/), { target: { value: '1.5' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_VOICE, rate: 1.5 });
  });
});
