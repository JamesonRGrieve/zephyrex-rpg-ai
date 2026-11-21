// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { ExtraBodyField, extraBodyText } from './ExtraBodyField';

function Harness({ start = '' }: { start?: string }) {
  const [text, setText] = useState(start);
  return <ExtraBodyField text={text} onChange={setText} />;
}

describe('ExtraBodyField', () => {
  it('says why typed fields cannot be kept, and clears once they can', async () => {
    render(<Harness />);
    const box = screen.getByLabelText('Extra request fields (JSON)');
    await userEvent.type(box, '{{"stream": false}');
    expect(screen.getByRole('alert')).toHaveTextContent("Extra request fields can't set stream");
    expect(box).toHaveAttribute('aria-invalid', 'true');
    await userEvent.clear(box);
    await userEvent.type(box, '{{"reasoning_effort": "none"}');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await userEvent.clear(box);
    await userEvent.type(box, 'nope');
    expect(screen.getByRole('alert')).toHaveTextContent('Extra request fields must be valid JSON');
  });

  it('starts blank for none and as pretty JSON for stored fields', () => {
    expect(extraBodyText({})).toBe('');
    expect(extraBodyText(undefined)).toBe('');
    expect(extraBodyText({ reasoning_effort: 'none' })).toBe('{\n  "reasoning_effort": "none"\n}');
  });
});
