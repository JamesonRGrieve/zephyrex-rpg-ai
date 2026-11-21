// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import { type CharacterDraft, CharacterForm } from './CharacterForm';
import { ADA_DRAFT } from './fixtures';

function Controlled({ initial }: { initial: CharacterDraft }) {
  const [value, setValue] = useState(initial);
  return <CharacterForm value={value} onChange={setValue} />;
}

const meta: Meta<typeof Controlled> = {
  title: 'Characters/Character form',
  component: Controlled,
  args: { initial: ADA_DRAFT },
  decorators: [(Story) => <div className='max-w-2xl'>{Story()}</div>],
};
export default meta;
type Story = StoryObj<typeof Controlled>;

export const Filled: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Add a greeting' }));
    await expect(canvas.getByLabelText('Alternate greeting 2')).toBeInTheDocument();
  },
};

export const Blank: Story = {
  args: {
    initial: { ...ADA_DRAFT, name: 'New character', description: '', first_message: '', alternate_greetings: [], tags: [] },
  },
};

/** As the character editor lays it out: the card first, then what only this app keeps, the folder last. */
export const InTheEditor: Story = {
  render: (args) => (
    <CharacterForm
      value={args.initial}
      onChange={() => undefined}
      beforeNotes={
        <section aria-labelledby='story-app' className='grid gap-2'>
          <h2 id='story-app' className='text-lg font-semibold'>
            In this app
          </h2>
          <p className='text-sm text-muted-foreground'>Lorebook, voice, expressions, memory across chats.</p>
        </section>
      }
      notesExtra={<p className='text-sm'>Folder</p>}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const headings = canvas.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent?.trim());
    await expect(headings).toEqual([
      'Who they are',
      'How they open',
      'How the model is steered',
      'In this app',
      'About the card',
    ]);
    await expect(canvas.getByRole('region', { name: 'About the card' })).toContainElement(canvas.getByText('Folder'));
  },
};
