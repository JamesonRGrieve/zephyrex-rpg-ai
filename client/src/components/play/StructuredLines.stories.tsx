// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, within } from 'storybook/test';
import { readLines, type ShownLine, StructuredLines } from './StructuredLines';

const meta: Meta<typeof StructuredLines> = { title: 'Play/Structured lines', component: StructuredLines };
export default meta;
type Story = StoryObj<typeof StructuredLines>;

const TAVERN = [
  'Narrator: The lights flicker over the bar.',
  'Mags (to Wren): "Last orders."',
  'Wren (to Mags, whispers): "Not yet."',
  'Mags pours another tankard.',
  'Wren drinks deeply.',
].join('\n');

/**
 * A message in the structured form, read as the story renders it under Mags: narration, her words as a
 * bubble tagged with whom they're to, Wren's whisper captioned with his name, and each action credited.
 */
export const FromAMessage: Story = {
  args: { speaker: 'Mags', lines: readLines(TAVERN, ['Mags', 'Wren']) ?? [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('The lights flicker over the bar.')).toBeInTheDocument();
    await expect(canvasElement.querySelectorAll('blockquote')).toHaveLength(2);
    await expect(canvas.getByText('to Wren')).toBeInTheDocument();
    await expect(canvas.getByText('Wren · whispers, to Mags')).toBeInTheDocument();
    // The speaker's own action drops her name (the header says who) and starts with a capital.
    await expect(canvas.getByText('Pours another tankard.')).toBeInTheDocument();
    // Another's action keeps the name, with the icon for its kind.
    await expect(canvas.getByLabelText('Drinks')).toBeInTheDocument();
  },
};

/**
 * An action told by its possessive (build60's live run, 2026-11-24: "she set down her cup and it wasn't action
 * tagged"): an action box with its actor's name once, in her own message too.
 */
export const APossessiveAction: Story = {
  args: {
    speaker: 'Delphine Halloway',
    lines:
      readLines("Delphine Halloway's spine stiffens further.\nDelphine Halloway sets down the cup with deliberate care.", [
        'Delphine Halloway',
        'Bram Holloway',
      ]) ?? [],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Delphine Halloway')).toBeInTheDocument();
    await expect(canvas.getByText("'s spine stiffens further.")).toBeInTheDocument();
    await expect(canvas.getByText('Sets down the cup with deliberate care.')).toBeInTheDocument();
    await expect(canvasElement.querySelectorAll('p.border')).toHaveLength(2);
  },
};

const MANNERS: ShownLine[] = [
  { kind: 'say', speaker: 'Osk', target: null, manner: 'speak', text: 'Hold the line.' },
  { kind: 'say', speaker: 'Osk', target: 'Wren', manner: 'whisper', text: 'Watch the door.' },
  { kind: 'say', speaker: 'Osk', target: null, manner: 'shout', text: 'Down!' },
  { kind: 'say', speaker: 'Osk', target: 'Command', manner: 'vox', text: 'Contact, east stair.' },
  { kind: 'say', speaker: 'Osk', target: null, manner: 'voxcast', text: 'All squads, fall back.' },
];

/** Every manner of speech, each styled apart: speak, whisper, shout, vox and voxcast. */
export const Manners: Story = {
  args: { speaker: 'Osk', lines: MANNERS },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelectorAll('blockquote')).toHaveLength(5);
    await expect(canvas.getByText('whispers, to Wren')).toBeInTheDocument();
    await expect(canvas.getByText('shouts')).toBeInTheDocument();
    await expect(canvas.getByText('vox, to Command')).toBeInTheDocument();
    await expect(canvas.getByText('voxcast')).toBeInTheDocument();
  },
};
