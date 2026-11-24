// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { type TargetOption, TargetPicker } from './TargetPicker';

const PRESENT: TargetOption[] = [
  { id: 'wren', name: 'Wren' },
  { id: 'mags', name: 'Mags the barkeep' },
  { id: 'osk', name: 'Sergeant Osk', via: 'vox' },
];

function Harness({ onChange }: { onChange: (next: { id: string | null; name: string }) => void }): React.ReactElement {
  const [value, setValue] = useState<{ id: string | null; name: string }>({ id: null, name: '' });
  return (
    <TargetPicker
      label='To whom'
      none='everyone'
      prefix='to'
      options={PRESENT}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

const meta: Meta<typeof Harness> = { title: 'Play/Target picker', component: Harness, args: { onChange: fn() } };
export default meta;
type Story = StoryObj<typeof Harness>;

/** No target reads as everyone; a known target is picked from the list, with how a remote one is reached. */
export const PickSomeonePresent: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await expect(canvas.getByRole('combobox', { name: 'To whom' })).toHaveTextContent('to everyone');
    await userEvent.click(canvas.getByRole('combobox', { name: 'To whom' }));
    await expect(await page.findByText('vox')).toBeInTheDocument();
    await userEvent.click(page.getByRole('option', { name: /Mags the barkeep/ }));
    await expect(args.onChange).toHaveBeenLastCalledWith({ id: 'mags', name: '' });
    await expect(canvas.getByRole('combobox', { name: 'To whom' })).toHaveTextContent('to Mags the barkeep');
  },
};

/** Any name may be typed and used as written, for someone or something the list doesn't know. */
export const TypeAName: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole('combobox', { name: 'To whom' }));
    await userEvent.type(await page.findByPlaceholderText('Someone or something…'), 'the hearth');
    await userEvent.click(page.getByRole('option', { name: 'Use “the hearth”' }));
    await expect(args.onChange).toHaveBeenLastCalledWith({ id: null, name: 'the hearth' });
    await expect(canvas.getByRole('combobox', { name: 'To whom' })).toHaveTextContent('to the hearth');
  },
};
