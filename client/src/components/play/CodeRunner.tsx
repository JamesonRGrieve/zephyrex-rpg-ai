// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * A code block in a message (A55, SillyTavern's Code Runner): shown as code, and for JavaScript a
 * Run button. A run happens only when the person asks, in the sandbox `runnerDocument` builds; the
 * page keeps the frame only while it runs, and ends it itself if no report comes back in time.
 */
import { Play, Square } from 'lucide-react';
import { type ReactElement, useEffect, useId, useState } from 'react';
import { Button } from 'zephyrex/ui/button';
import { RUN_LIMIT_MS, type RunReport, isRunnable, runReport, runnerDocument } from '~/features/chat/codeBlocks';

/** A little longer than the sandbox's own limit, so the sandbox normally reports first. */
const PAGE_LIMIT_MS = RUN_LIMIT_MS + 2000;

type Outcome = { state: 'idle' } | { state: 'running'; run: string } | { state: 'done'; report: RunReport };

export function CodeRunner({ language, code }: { language: string; code: string }): ReactElement {
  const id = useId();
  const [outcome, setOutcome] = useState<Outcome>({ state: 'idle' });
  const run = outcome.state === 'running' ? outcome.run : null;

  useEffect(() => {
    if (run === null) return undefined;
    const onMessage = (event: MessageEvent): void => {
      const report = runReport(event.data, run);
      if (report !== null) setOutcome({ state: 'done', report });
    };
    window.addEventListener('message', onMessage);
    const limit = window.setTimeout(
      () => setOutcome({ state: 'done', report: { run, lines: [], error: null, stopped: true } }),
      PAGE_LIMIT_MS,
    );
    return () => {
      window.removeEventListener('message', onMessage);
      window.clearTimeout(limit);
    };
  }, [run]);

  const runnable = isRunnable(language);
  return (
    <figure className='my-2 grid gap-1'>
      <pre
        aria-label={language === '' ? 'Code' : `${language} code`}
        className='overflow-x-auto rounded-md bg-muted p-3 text-sm'
      >
        <code>{code}</code>
      </pre>
      {runnable && (
        <div className='flex flex-wrap items-center gap-2'>
          {run === null ? (
            <Button
              type='button'
              variant='outline'
              className='h-11'
              onClick={() => setOutcome({ state: 'running', run: `${id}-${crypto.randomUUID()}` })}
            >
              <Play aria-hidden /> Run
            </Button>
          ) : (
            <Button type='button' variant='outline' className='h-11' onClick={() => setOutcome({ state: 'idle' })}>
              <Square aria-hidden /> Stop
            </Button>
          )}
          <span className='text-sm text-muted-foreground'>Runs here, sandboxed, with no network.</span>
        </div>
      )}
      {run !== null && (
        <iframe
          title='Code runner'
          data-run={run}
          sandbox='allow-scripts'
          srcDoc={runnerDocument(run, code)}
          className='hidden'
        />
      )}
      {outcome.state === 'done' && <RunOutput report={outcome.report} />}
    </figure>
  );
}

function RunOutput({ report }: { report: RunReport }): ReactElement {
  return (
    <figcaption aria-live='polite' className='grid gap-1 text-sm'>
      {report.lines.length > 0 && (
        <pre aria-label='Output' className='overflow-x-auto rounded-md border p-2'>
          {report.lines.join('\n')}
        </pre>
      )}
      {report.error !== null && <p className='text-destructive'>{report.error}</p>}
      {report.stopped && <p className='text-destructive'>Stopped after {RUN_LIMIT_MS / 1000} seconds.</p>}
      {report.lines.length === 0 && report.error === null && !report.stopped && (
        <p className='text-muted-foreground'>Ran, with no output.</p>
      )}
    </figcaption>
  );
}
