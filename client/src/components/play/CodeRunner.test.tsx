// SPDX-License-Identifier: AGPL-3.0-or-later
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { CodeRunner } from './CodeRunner';

function report(run: string, data: Record<string, unknown>): void {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data: { run, ...data } }));
  });
}

describe('CodeRunner', () => {
  it('shows code without a Run button when it is not JavaScript', () => {
    render(<CodeRunner language='python' code='print(1)' />);
    expect(screen.getByLabelText('python code')).toHaveTextContent('print(1)');
    expect(screen.queryByRole('button', { name: 'Run' })).toBeNull();
  });

  it('runs only when asked, in a sandbox, and shows what it reported', async () => {
    const { container } = render(<CodeRunner language='js' code='console.log(1 + 1)' />);
    expect(container.querySelector('iframe')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Run' }));
    const frame = container.querySelector('iframe');
    expect(frame).toHaveAttribute('sandbox', 'allow-scripts');
    const run = frame?.getAttribute('data-run') ?? '';
    report('someone-else', { lines: ['forged'], error: null, stopped: false });
    expect(screen.queryByText('forged')).toBeNull();
    report(run, { lines: ['2'], error: null, stopped: false });
    expect(screen.getByLabelText('Output')).toHaveTextContent('2');
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('says when the code threw, or was stopped', async () => {
    const { container } = render(<CodeRunner language='javascript' code='while (true) {}' />);
    await userEvent.click(screen.getByRole('button', { name: 'Run' }));
    report(container.querySelector('iframe')?.getAttribute('data-run') ?? '', { lines: [], error: null, stopped: true });
    expect(screen.getByText('Stopped after 3 seconds.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Run' }));
    report(container.querySelector('iframe')?.getAttribute('data-run') ?? '', {
      lines: [],
      error: 'ReferenceError: nope is not defined',
      stopped: false,
    });
    expect(screen.getByText('ReferenceError: nope is not defined')).toBeInTheDocument();
  });

  it('can be stopped by hand', async () => {
    const { container } = render(<CodeRunner language='js' code='1' />);
    await userEvent.click(screen.getByRole('button', { name: 'Run' }));
    await userEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(container.querySelector('iframe')).toBeNull();
  });
});
