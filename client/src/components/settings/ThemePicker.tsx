// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * Appearance (A49): the framework's themes (light, dark and the colour-blind pair), chosen here and
 * kept in the theme cookie by zephyrex's useTheme, so the page renders in it from the server on.
 */
import type { ReactElement } from 'react';
import { chipGroup } from 'zephyrex/hooks/chipKeys';
import { ChoiceChip } from 'zephyrex/ui/choice-chip';
import { useTheme } from 'zephyrex/components/theme/useTheme';

const LABELS: Record<string, string> = {
  light: 'Light',
  dark: 'Dark',
  colorblind: 'Colour-blind',
  'colorblind-dark': 'Colour-blind dark',
};

/** A theme's name as people read it. */
export function themeLabel(theme: string): string {
  return LABELS[theme] ?? theme.replace(/[-_]+/g, ' ').replace(/^\w/, (first) => first.toUpperCase());
}

export function ThemeChips({
  themes,
  current,
  onChange,
}: {
  themes: readonly string[];
  current: string;
  onChange: (theme: string) => void;
}): ReactElement {
  return (
    <section aria-labelledby='appearance-title' className='grid gap-2'>
      <h2 id='appearance-title' className='text-sm font-medium'>
        Appearance
      </h2>
      <div ref={chipGroup} role='radiogroup' aria-labelledby='appearance-title' className='flex flex-wrap gap-2'>
        {themes.map((theme) => (
          <ChoiceChip key={theme} checked={current === theme} className='h-11 px-4' onClick={() => onChange(theme)}>
            {themeLabel(theme)}
          </ChoiceChip>
        ))}
      </div>
    </section>
  );
}

/** The chips, bound to the theme in force. */
export function ThemePicker(): ReactElement {
  const { themes, currentTheme, setTheme } = useTheme();
  return <ThemeChips themes={themes} current={currentTheme} onChange={setTheme} />;
}
