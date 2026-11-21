// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * The tools a chat's model may call (A46): every tool this install has is on by default, and each
 * can be switched off for this chat (the operator, 2026-11-20). A tool the install lacks (no search
 * source set, the VTT not loaded) is listed as unavailable, with why, and can't be switched on.
 */
import { type ReactElement, useId } from 'react';
import { Label } from 'zephyrex/ui/label';
import { Switch } from 'zephyrex/ui/switch';

export interface ChatTool {
  /** The name the model calls it by. */
  name: string;
  label: string;
  /** What it does, in a line. */
  hint: string;
  /** Why it can't be used here, or null when it can. */
  unavailable: string | null;
}

function ToolRow({ tool, on, onChange }: { tool: ChatTool; on: boolean; onChange: (on: boolean) => void }): ReactElement {
  const id = useId();
  const hint = `${id}-hint`;
  return (
    <li className='flex items-start justify-between gap-3 py-2'>
      <div className='grid gap-0.5'>
        <Label htmlFor={id}>{tool.label}</Label>
        <p id={hint} className='text-xs text-muted-foreground'>
          {tool.unavailable ?? tool.hint}
        </p>
      </div>
      <Switch
        id={id}
        className='mt-1'
        aria-describedby={hint}
        checked={tool.unavailable === null && on}
        disabled={tool.unavailable !== null}
        onCheckedChange={onChange}
      />
    </li>
  );
}

/** The chat's tool switches; `off` names the tools switched off for this chat. */
export function ToolSwitches({
  tools,
  off,
  onChange,
}: {
  tools: readonly ChatTool[];
  off: readonly string[];
  onChange: (off: string[]) => void;
}): ReactElement {
  return (
    <fieldset className='grid gap-1'>
      <legend className='text-sm font-medium'>Tools the model may use</legend>
      <p className='text-xs text-muted-foreground'>
        A model that supports tools may call these while it replies. It can never call one that is off.
      </p>
      <ul className='divide-y'>
        {tools.map((tool) => (
          <ToolRow
            key={tool.name}
            tool={tool}
            on={!off.includes(tool.name)}
            onChange={(on) => onChange(on ? off.filter((name) => name !== tool.name) : [...off, tool.name])}
          />
        ))}
      </ul>
    </fieldset>
  );
}
