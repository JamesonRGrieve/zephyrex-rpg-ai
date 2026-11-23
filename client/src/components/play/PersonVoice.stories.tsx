// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, within } from 'storybook/test';
import { PersonVoice } from './PersonVoice';

const meta: Meta<typeof PersonVoice> = { title: 'Play/Person voice', component: PersonVoice };
export default meta;
type Story = StoryObj<typeof PersonVoice>;

/** Without a server that keeps tts_voice on its persons, there is nothing to pick. */
export const OlderServer: Story = {
  args: { personId: 'p1' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByLabelText('Voice')).toBeNull();
  },
};
