// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, fn, userEvent, within } from 'storybook/test';
import type { Character } from '~/features/data/records';
import { CampaignStartForm } from './CampaignStart';

const card = (id: string, name: string, tags: string[], folder: string): Character =>
  ({
    id,
    name,
    tags,
    folder,
    avatar: null,
    description: '',
  }) as unknown as Character;

const CAST = [
  card('gus', 'Gus Veridan', ['PC'], 'The Cell'),
  card('az', 'A.Z.', ['PC'], 'The Cell'),
  card('massen', 'Massen', ['NPC'], 'Solenne'),
];

const meta: Meta<typeof CampaignStartForm> = {
  title: 'Play/Start the campaign',
  component: CampaignStartForm,
  args: { cast: CAST, starting: false, onStart: fn() },
  decorators: [(Story) => <div className='flex h-[40rem] max-w-md flex-col'>{Story()}</div>],
};
export default meta;
type Story = StoryObj<typeof CampaignStartForm>;

/** As the GM: the player characters are the party. */
export const AsTheGm: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('radio', { name: /The GM/ })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(canvas.getByRole('button', { name: 'Start the campaign' }));
    await expect(args.onStart).toHaveBeenCalledWith({ seat: 'gm', playing: null, party: ['gus', 'az'] });
  },
};

/** As any character, even one who isn't a player character: the rest of the party stays the AI's. */
export const AsAnyCharacter: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('radio', { name: /A character/ }));
    await expect(canvas.getByRole('button', { name: 'Start the campaign' })).toBeDisabled();
    await userEvent.type(canvas.getByLabelText('Find a character'), 'mass');
    const choices = within(canvas.getByRole('group', { name: 'Characters to play' }));
    await userEvent.click(choices.getByRole('button', { name: /Massen/ }));
    await userEvent.click(canvas.getByRole('button', { name: 'Start the campaign' }));
    await expect(args.onStart).toHaveBeenCalledWith({ seat: 'player', playing: 'massen', party: ['gus', 'az'] });
  },
};
