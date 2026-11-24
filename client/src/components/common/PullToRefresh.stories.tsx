// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, waitFor, within } from 'storybook/test';
import { PullToRefresh } from './PullToRefresh';

const meta: Meta<typeof PullToRefresh> = { title: 'Common/Pull to refresh', component: PullToRefresh };
export default meta;
type Story = StoryObj<typeof PullToRefresh>;

/** A touch event at a height on the page, as a finger on a phone sends it. */
function touch(type: 'touchstart' | 'touchmove' | 'touchcancel', target: Element, clientY: number): void {
  const point = new Touch({ identifier: 1, target, clientX: 100, clientY });
  target.dispatchEvent(
    new TouchEvent(type, {
      bubbles: true,
      touches: type === 'touchcancel' ? [] : [point],
      changedTouches: [point],
    }),
  );
}

/**
 * A pull that starts on the app bar shows the arrow, which says to let go once it has been pulled far
 * enough. The pull here is taken back before it ends, so the page is not reloaded.
 */
export const PullFromTheBar: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const body = canvasElement.ownerDocument.body;
    await expect(canvas.queryByRole('status')).toBeNull();
    // The component listens once its effect has run, which can come after the story's first touch: the pull
    // is begun again until it's seen (test-storybook, 2026-11-24: a probe showed the touches arrive and the arrow
    // shows; only the first touch came before the listener).
    await waitFor(() => {
      touch('touchstart', body, 20);
      touch('touchmove', body, 60);
      expect(page.getByRole('status', { name: 'Pull to reload' })).toBeInTheDocument();
    });
    touch('touchmove', body, 140);
    await expect(await page.findByRole('status', { name: 'Release to reload' })).toBeInTheDocument();
    // Back up under the mark, then the touch ends without a reload.
    touch('touchmove', body, 30);
    touch('touchcancel', body, 30);
    await waitFor(() => expect(page.queryByRole('status')).toBeNull());
  },
};
