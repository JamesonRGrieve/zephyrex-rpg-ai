// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import { type CharacterVoice, DEFAULT_VOICE } from '~/features/speech/voice';
import { VoicePicker } from './VoicePicker';

function Harness(): React.ReactElement {
  const [voice, setVoice] = useState<CharacterVoice>(DEFAULT_VOICE);
  return <VoicePicker name='Ada Vance' value={voice} onChange={setVoice} />;
}

const meta: Meta<typeof Harness> = {
  title: 'Characters/Voice picker',
  component: Harness,
  decorators: [(Story) => <div className='max-w-lg'>{Story()}</div>],
};
export default meta;
type Story = StoryObj<typeof Harness>;

/** The server voice and speed on every device; the browser's voices and pitch where it can speak. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('group', { name: 'Voice' })).toBeInTheDocument();
    await expect(canvas.getByLabelText(/Speed/)).toHaveValue('1');
    const server = canvas.getByLabelText('Voice on your speech model');
    await userEvent.type(server, 'onyx');
    await expect(server).toHaveValue('onyx');
    if ('speechSynthesis' in window) await expect(canvas.getByLabelText(/Pitch on this device/)).toHaveValue('1');
  },
};
