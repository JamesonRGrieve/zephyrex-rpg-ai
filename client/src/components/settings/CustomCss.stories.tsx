// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import { CustomCssEditor } from './CustomCss';

function Harness({ initial = '' }: { initial?: string }): React.ReactElement {
  const [css, setCss] = useState(initial);
  return (
    <>
      <CustomCssEditor key={css} css={css} onApply={setCss} />
      {css === '' ? null : <style>{css}</style>}
      <p className='story-sample mt-4'>Sample text the CSS can restyle.</p>
    </>
  );
}

const meta: Meta<typeof Harness> = { title: 'Settings/Custom CSS', component: Harness };
export default meta;
type Story = StoryObj<typeof Harness>;

/** Nothing applied: typing holds a draft, Apply restyles the sample. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole('textbox', { name: 'Custom CSS' }), '.story-sample {{ font-style: italic; }');
    await expect(canvas.getByText('Not applied yet')).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Apply' }));
    await expect(canvas.getByText('Applied')).toBeInTheDocument();
    await expect(getComputedStyle(canvas.getByText('Sample text the CSS can restyle.')).fontStyle).toBe('italic');
  },
};

/** Already applied: Clear removes it. */
export const Applied: Story = {
  args: { initial: '.story-sample { text-decoration: underline; }' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Clear' }));
    await expect(canvas.getByText('No custom styles')).toBeInTheDocument();
  },
};
