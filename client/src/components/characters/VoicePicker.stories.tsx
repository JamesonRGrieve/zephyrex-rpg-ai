// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { useState } from 'react';
import { expect, within } from 'storybook/test';
import { type CharacterVoice, DEFAULT_VOICE } from '~/features/speech/voice';
import { VoicePicker } from './VoicePicker';

function Harness(): React.ReactElement {
  const [voice, setVoice] = useState<CharacterVoice>(DEFAULT_VOICE);
  return <VoicePicker name='Ada Vance' value={voice} onChange={setVoice} />;
}

const meta: Meta<typeof Harness> = { title: 'Characters/Voice picker', component: Harness, decorators: [(Story) => <div className='max-w-lg'>{Story()}</div>] };
export default meta;
type Story = StoryObj<typeof Harness>;

/** The browser's voices, speed and pitch; hidden where the browser cannot speak. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    if (!('speechSynthesis' in window)) return;
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('group', { name: 'Voice' })).toBeInTheDocument();
    await expect(canvas.getByLabelText(/Speed/)).toHaveValue('1');
  },
};
