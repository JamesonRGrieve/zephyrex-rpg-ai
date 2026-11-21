// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { CodeRunner } from './CodeRunner';

const meta: Meta<typeof CodeRunner> = { title: 'Play/Code runner', component: CodeRunner };
export default meta;
type Story = StoryObj<typeof CodeRunner>;

/** JavaScript, run for real in the sandbox. */
export const Runs: Story = {
  args: { language: 'js', code: "const dice = [3, 5];\nconsole.log('total', dice[0] + dice[1]);" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Run' }));
    await waitFor(() => expect(canvas.getByLabelText('Output')).toHaveTextContent('total 8'), { timeout: 8000 });
  },
};

/** The sandbox refuses the network: the request fails inside it, and never reaches the page's origin. */
export const NoNetwork: Story = {
  args: { language: 'js', code: "fetch('https://example.com').then(() => 'reached')" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Run' }));
    await waitFor(() => expect(canvas.getByText(/TypeError/)).toBeInTheDocument(), { timeout: 8000 });
    // What the run reported (the figure's caption), not the code shown above it, which spells 'reached' itself.
    const report = canvasElement.querySelector('figcaption');
    await expect(report).not.toBeNull();
    await expect(report).not.toHaveTextContent('reached');
  },
};

/** A loop that never ends is stopped. */
export const Stopped: Story = {
  args: { language: 'js', code: 'while (true) {}' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Run' }));
    await waitFor(() => expect(canvas.getByText('Stopped after 3 seconds.')).toBeInTheDocument(), { timeout: 10000 });
  },
};

/** Code in another language is shown, not run. */
export const ShownOnly: Story = {
  args: { language: 'python', code: 'print("hi")' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('button', { name: 'Run' })).toBeNull();
  },
};
