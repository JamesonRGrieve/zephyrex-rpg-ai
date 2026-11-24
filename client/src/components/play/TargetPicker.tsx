// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * Who a line is aimed at (the operator, 2026-11-22: "now the targeting is ONLY a text field with no select.
 * Select is the default, with a combo box I can type anything in"): a select of the valid targets that
 * opens a searchable list, where any other name may be typed and used as written.
 */
import { Check, ChevronsUpDown } from 'lucide-react';
import { type ReactElement, useState } from 'react';
import { Button } from 'zephyrex/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from 'zephyrex/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from 'zephyrex/ui/popover';
import { cn } from '~/lib/utils';

export interface TargetOption {
  id: string;
  name: string;
  /** How they're reached, for a remote target (vox, the Message spell). */
  via?: string;
}

export function TargetPicker({
  label,
  none,
  prefix,
  options,
  value,
  onChange,
}: {
  /** The control's name ("To whom", "At whom"). */
  label: string;
  /** What no target reads as ("everyone", "no one"). */
  none: string;
  /** The word before a name ("to", "at"). */
  prefix: string;
  options: readonly TargetOption[];
  /** The chosen target: a known one's id, or a typed name. */
  value: { id: string | null; name: string };
  onChange: (next: { id: string | null; name: string }) => void;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const shown = value.id !== null ? (options.find((one) => one.id === value.id)?.name ?? value.name) : value.name;
  const pick = (next: { id: string | null; name: string }) => {
    onChange(next);
    setTyped('');
    setOpen(false);
  };
  const custom = typed.trim();
  const known = options.some((one) => one.name.toLowerCase() === custom.toLowerCase());
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type='button'
          variant='outline'
          role='combobox'
          aria-expanded={open}
          aria-label={label}
          className='h-9 min-w-36 flex-1 justify-between px-2 font-normal'
        >
          <span className={cn('truncate', shown === '' && 'text-muted-foreground')}>
            {prefix} {shown === '' ? none : shown}
          </span>
          <ChevronsUpDown className='ml-1 size-4 shrink-0 opacity-50' aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className='w-64 p-0' align='start' aria-label={label}>
        <Command>
          <CommandInput placeholder='Someone or something…' value={typed} onValueChange={setTyped} />
          <CommandList>
            <CommandEmpty>{custom === '' ? 'No one to suggest.' : null}</CommandEmpty>
            <CommandGroup>
              <CommandItem value={`__none ${none}`} onSelect={() => pick({ id: null, name: '' })}>
                <Check className={cn('size-4', shown === '' ? 'opacity-100' : 'opacity-0')} aria-hidden />
                {prefix} {none}
              </CommandItem>
              {options.map((one) => (
                <CommandItem key={one.id} value={one.name} onSelect={() => pick({ id: one.id, name: '' })}>
                  <Check className={cn('size-4', value.id === one.id ? 'opacity-100' : 'opacity-0')} aria-hidden />
                  <span className='truncate'>{one.name}</span>
                  {one.via !== undefined && one.via !== '' && (
                    <span className='ml-auto text-xs text-muted-foreground'>{one.via}</span>
                  )}
                </CommandItem>
              ))}
              {custom !== '' && !known && (
                <CommandItem value={`__typed ${custom}`} onSelect={() => pick({ id: null, name: custom })}>
                  Use “{custom}”
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
