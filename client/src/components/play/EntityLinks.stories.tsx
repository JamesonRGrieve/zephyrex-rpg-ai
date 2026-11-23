// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, within } from 'storybook/test';
import { EntityLinksProvider, Linked } from './EntityLinks';

const meta: Meta<typeof Linked> = { title: 'Play/Entity links', component: Linked };
export default meta;
type Story = StoryObj<typeof Linked>;

/** Outside the app wrapper (no drawer) the text reads as written; inside it, each name is a link. */
export const PlainOutsideTheWrapper: Story = {
  render: () => (
    <EntityLinksProvider campaignId='c1' entities={[{ id: 'p1', name: 'Mags Thornbury', kind: 'person' }]}>
      <p>
        <Linked text='Mags Thornbury wipes the bar of the Leaning Lantern.' />
      </p>
    </EntityLinksProvider>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/Mags Thornbury wipes the bar/)).toBeInTheDocument();
  },
};
