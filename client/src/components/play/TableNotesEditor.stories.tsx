// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Meta, StoryObj } from '@storybook/nextjs';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import { type TableNoteValue, TableNotesEditor } from './TableNotesEditor';

function Harness(): React.ReactElement {
  const [value, setValue] = useState<TableNoteValue[]>([{ kind: 'house_rule', text: 'Critical hits explode' }]);
  return <TableNotesEditor value={value} onChange={setValue} />;
}

const meta: Meta<typeof Harness> = { title: 'Play/Table notes', component: Harness, decorators: [(Story) => <div className='max-w-lg'>{Story()}</div>] };
export default meta;
type Story = StoryObj<typeof Harness>;

export const AddANote: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.selectOptions(canvas.getByLabelText('Kind of note'), 'tone');
    await userEvent.type(canvas.getByLabelText('New table note'), 'Grim but hopeful{Enter}');
    await expect(canvas.getByText('Grim but hopeful')).toBeInTheDocument();
  },
};
