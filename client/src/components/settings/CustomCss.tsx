// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * Custom CSS (A49, SillyTavern's "Custom CSS"): the person's own stylesheet over the theme, kept
 * with this device's settings and applied on this device only. The editor holds a draft until
 * Apply, so a half-typed rule never restyles the page under the person's fingers.
 */
import { type ReactElement, useId, useState, useSyncExternalStore } from 'react';
import { Button } from 'zephyrex/ui/button';
import { Textarea } from 'zephyrex/ui/textarea';
import { CUSTOM_CSS_LIMIT, DEFAULT_DEVICE_SETTINGS, customCssOf } from '~/features/settings/deviceSettings';
import { deviceSettingsStore } from '~/features/settings/useDeviceSettings';

export function CustomCssEditor({ css, onApply }: { css: string; onApply: (css: string) => void }): ReactElement {
  const [draft, setDraft] = useState(css);
  const id = useId();
  const changed = draft !== css;
  return (
    <section aria-labelledby={`${id}-title`} className='grid gap-2'>
      <h2 id={`${id}-title`} className='text-sm font-medium'>
        Custom CSS
      </h2>
      <p id={`${id}-help`} className='text-sm text-muted-foreground'>
        Your own styles over the theme. They apply on this device only.
      </p>
      <Textarea
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-help`}
        className='min-h-40 font-mono text-sm'
        spellCheck={false}
        maxLength={CUSTOM_CSS_LIMIT}
        placeholder='.message { line-height: 1.7; }'
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      <div className='flex flex-wrap items-center gap-2'>
        <Button type='button' className='h-11' disabled={!changed} onClick={() => onApply(customCssOf(draft))}>
          Apply
        </Button>
        <Button
          type='button'
          variant='outline'
          className='h-11'
          disabled={draft === '' && css === ''}
          onClick={() => {
            setDraft('');
            onApply('');
          }}
        >
          Clear
        </Button>
        <span className='text-sm text-muted-foreground' aria-live='polite'>
          {changed ? 'Not applied yet' : css === '' ? 'No custom styles' : 'Applied'}
        </span>
      </div>
    </section>
  );
}

/** The editor, bound to this device's settings. */
export function CustomCss(): ReactElement {
  const css = useCustomCss();
  // Keyed on the applied CSS, so a change from another tab replaces the draft.
  return <CustomCssEditor key={css} css={css} onApply={(next) => deviceSettingsStore.change({ customCss: next })} />;
}

const serverCss = (): string => DEFAULT_DEVICE_SETTINGS.customCss;

function useCustomCss(): string {
  return useSyncExternalStore(
    (listener) => deviceSettingsStore.subscribe(listener),
    () => deviceSettingsStore.snapshot().customCss,
    serverCss,
  );
}

/** The applied stylesheet, after the app's own so it wins ties; nothing when there is none. */
export function CustomStyle(): ReactElement | null {
  const css = useCustomCss();
  return css === '' ? null : <style data-custom-css=''>{css}</style>;
}
