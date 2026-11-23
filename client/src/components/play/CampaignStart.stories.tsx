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

/** A start under way: the copy step, its bar creeping while the server copies the scenario. */
export const Copying: Story = {
  args: { starting: true, step: 0, creep: 0.4 },
  play: async ({ canvasElement }) => {
    // The progress covers the whole page, rendered on the page's body.
    const canvas = within(canvasElement.ownerDocument.body);
    await expect(canvas.getByRole('progressbar', { name: 'Starting the campaign' })).toBeVisible();
    await expect(canvas.getByText(/Copying the scenario for your campaign… \(1 of 4\)/)).toBeVisible();
    // The progress is the whole page: nothing to edit while it starts.
    await expect(canvas.queryByRole('button', { name: /Start the campaign|Starting/ })).toBeNull();
    await expect(canvas.queryByRole('radio')).toBeNull();
  },
};

/** A character of their own: a freeform one, named, played from the start; none in a mechanical campaign. */
export const MakeYourOwn: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('radio', { name: /A character/ }));
    await userEvent.click(canvas.getByRole('button', { name: /Freeform character/ }));
    await expect(canvas.getByRole('button', { name: 'Start the campaign' })).toBeDisabled();
    await userEvent.type(canvas.getByLabelText('Their name'), 'Wren');
    await userEvent.click(canvas.getByRole('button', { name: 'Start the campaign' }));
    await expect(args.onStart).toHaveBeenCalledWith({
      seat: 'player',
      playing: null,
      party: ['gus', 'az'],
      make: { kind: 'freeform', name: 'Wren' },
    });
  },
};

/** Described: who they are, in the person's words; the builder's picks are made from it after the copy. */
export const Described: Story = {
  args: { mechanical: true },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('radio', { name: /A character/ }));
    await userEvent.click(canvas.getByRole('button', { name: /Describe them/ }));
    await userEvent.type(canvas.getByLabelText('Their name'), 'Pip');
    await expect(canvas.getByRole('button', { name: 'Start the campaign' })).toBeDisabled();
    await userEvent.type(canvas.getByLabelText('Who they are'), 'A sly halfling dock runner');
    await userEvent.click(canvas.getByRole('button', { name: 'Start the campaign' }));
    await expect(args.onStart).toHaveBeenCalledWith({
      seat: 'player',
      playing: null,
      party: ['gus', 'az'],
      make: { kind: 'described', name: 'Pip', concept: 'A sly halfling dock runner' },
    });
  },
};

export const Mechanical: Story = {
  args: { mechanical: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('radio', { name: /A character/ }));
    await expect(canvas.getByRole('button', { name: /New character/ })).toBeVisible();
    await expect(canvas.queryByRole('button', { name: /Freeform character/ })).toBeNull();
  },
};
