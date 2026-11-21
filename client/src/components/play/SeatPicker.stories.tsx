// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { type SeatChoice, SeatPicker } from './SeatPicker';

const PARTY = [
  { id: 'gus', name: 'Gus Veridan', avatar: null },
  { id: 'az', name: 'A.Z.', avatar: null },
];
const EVERYONE = [...PARTY, { id: 'massen', name: 'Massen', avatar: null }];

function Harness({ onChange }: { onChange: (seat: SeatChoice) => void }): React.ReactElement {
  const [seat, setSeat] = useState<SeatChoice>(null);
  return (
    <SeatPicker
      seat={seat}
      party={PARTY}
      everyone={EVERYONE}
      onChange={(next) => {
        setSeat(next);
        onChange(next);
      }}
    />
  );
}

const meta: Meta<typeof Harness> = { title: 'Play/Seat picker', component: Harness, args: { onChange: fn() } };
export default meta;
type Story = StoryObj<typeof Harness>;

/** From the GM's seat to a party member, then to an NPC from outside the party: any character at all. */
export const SwapSeats: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole('button', { name: 'Your seat: the GM' }));
    await userEvent.click(page.getByRole('button', { name: /A\.Z\./ }));
    await expect(args.onChange).toHaveBeenLastCalledWith('az');
    await userEvent.click(canvas.getByRole('button', { name: 'Your seat: A.Z.' }));
    await userEvent.type(page.getByLabelText('Find a character'), 'mass');
    await userEvent.click(page.getByRole('button', { name: /Massen/ }));
    await expect(args.onChange).toHaveBeenLastCalledWith('massen');
  },
};
