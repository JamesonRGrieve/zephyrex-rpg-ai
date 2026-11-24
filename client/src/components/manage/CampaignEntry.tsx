// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
import { Check, Pencil, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, type ReactElement, useState } from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from 'zephyrex/ui/alert-dialog';
import { Button } from 'zephyrex/ui/button';
import { Input } from 'zephyrex/ui/input';

export interface CampaignEntryProps {
  href: string;
  /** Who the person plays in it (the seat's character), or "Game master". */
  name: string;
  /** The player's own title for it ("Clusterfuck Express"), or none. */
  title: string | null;
  /** Its status line or summary sentence. */
  line: string;
  updated: string;
  /** Sets the title (an empty one clears it). */
  onRename: (title: string) => Promise<void> | void;
  /** Deletes the campaign: its chat and its playthrough. */
  onDelete: () => Promise<void> | void;
}

/** What the person types to delete it (the operator, 2026-11-24): its title if it has one, else its character. */
export function confirmName(name: string, title: string | null): string {
  return (title ?? name).trim();
}

/**
 * Deleting is never one tap (the operator, 2026-11-24: "These absolutely must have a 'type the name of the
 * campaign to confirm' delete box"): Delete stays disabled until the campaign's name is typed exactly.
 */
function DeleteCampaign({ name, title, onDelete }: Pick<CampaignEntryProps, 'name' | 'title' | 'onDelete'>): ReactElement {
  const wanted = confirmName(name, title);
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [open, setOpen] = useState(false);
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setTyped('');
      }}
    >
      <AlertDialogTrigger asChild>
        <Button type='button' size='icon' variant='ghost' aria-label={`Delete ${wanted}`} className='size-11 shrink-0'>
          <Trash2 aria-hidden className='size-4' />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this campaign?</AlertDialogTitle>
          <AlertDialogDescription>
            Its chat, its sessions and its copy of the world go, and it can&apos;t be undone. The scenario stays. Type{' '}
            <strong>{wanted}</strong> to confirm.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Input
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          aria-label={`Type ${wanted} to confirm`}
          autoComplete='off'
          className='h-11'
        />
        <AlertDialogFooter>
          <AlertDialogCancel className='h-11'>Keep it</AlertDialogCancel>
          <Button
            type='button'
            variant='destructive'
            className='h-11'
            disabled={typed.trim() !== wanted || deleting}
            onClick={async () => {
              setDeleting(true);
              try {
                await onDelete();
                setOpen(false);
              } finally {
                setDeleting(false);
              }
            }}
          >
            Delete
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * One campaign under its scenario (the operator, 2026-11-24): the character's name, then an optional title the
 * player sets at any time, never the scenario's name again. The pencil names it in place.
 */
export function CampaignEntry({ href, name, title, line, updated, onRename, onDelete }: CampaignEntryProps): ReactElement {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title ?? '');
  const [saving, setSaving] = useState(false);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await onRename(draft.trim());
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };
  if (editing)
    return (
      <form onSubmit={save} className='flex min-h-11 items-center gap-2 rounded-md border px-3 py-1.5 text-sm'>
        <span className='shrink-0 font-medium'>{name}</span>
        <Input
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setEditing(false);
          }}
          placeholder='A title for this campaign (optional)'
          aria-label={`Title for ${name}'s campaign`}
          className='h-9 min-w-0 flex-1'
        />
        <Button type='submit' size='icon' variant='ghost' aria-label='Save the title' disabled={saving} className='size-11'>
          <Check aria-hidden className='size-4' />
        </Button>
        <Button
          type='button'
          size='icon'
          variant='ghost'
          aria-label='Cancel'
          onClick={() => setEditing(false)}
          className='size-11'
        >
          <X aria-hidden className='size-4' />
        </Button>
      </form>
    );
  return (
    <div className='flex min-h-11 items-center gap-1 rounded-md border text-sm hover:bg-muted'>
      <Link href={href} className='flex min-h-11 min-w-0 flex-1 items-center justify-between gap-2 px-3 py-1.5'>
        <span className='min-w-0'>
          <span className='block truncate'>
            <span className='font-medium'>{name}</span>
            {title !== null && <span className='text-muted-foreground'> · {title}</span>}
          </span>
          {line !== '' && <span className='line-clamp-2 block text-xs text-muted-foreground'>{line}</span>}
        </span>
        <span className='shrink-0 text-xs text-muted-foreground'>{new Date(updated).toLocaleDateString()}</span>
      </Link>
      <Button
        type='button'
        size='icon'
        variant='ghost'
        aria-label={title === null ? `Name ${name}'s campaign` : `Rename ${name}'s campaign`}
        onClick={() => {
          setDraft(title ?? '');
          setEditing(true);
        }}
        className='size-11 shrink-0'
      >
        <Pencil aria-hidden className='size-4' />
      </Button>
      <DeleteCampaign name={name} title={title} onDelete={onDelete} />
    </div>
  );
}
