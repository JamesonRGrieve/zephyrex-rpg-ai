// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, within } from 'storybook/test';
import { ZephyrexProvider } from 'zephyrex';
import config from '~/zephyrex.config';
import { PersonVoice } from './PersonVoice';

const meta: Meta<typeof PersonVoice> = {
  title: 'Play/Person voice',
  component: PersonVoice,
  // It reads the person through the app's client, which needs the framework's provider.
  decorators: [(Story) => <ZephyrexProvider config={config}>{Story()}</ZephyrexProvider>],
};
export default meta;
type Story = StoryObj<typeof PersonVoice>;

/** Without a server that keeps tts_voice on its persons, there is nothing to pick. */
export const OlderServer: Story = {
  args: { personId: 'p1' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByLabelText('Voice')).toBeNull();
  },
};
