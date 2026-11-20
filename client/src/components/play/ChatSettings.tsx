// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * A chat's own settings: its title, who the person plays as, the sampler preset, the model, the
 * author's note and its own system prompt (docs/DESIGN.md A16), the lorebooks it reads and its World Info settings (A14). Native selects on purpose: on a phone they open the system's
 * own picker. Opens from the side on a wide screen and from the bottom on a phone.
 */
import { type ReactElement, useId, useState } from 'react';
import { ImageUp, Sparkles } from 'lucide-react';
import { Button } from 'zephyrex/ui/button';
import { Input } from 'zephyrex/ui/input';
import { Label } from 'zephyrex/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from 'zephyrex/ui/sheet';
import { Textarea } from 'zephyrex/ui/textarea';
import { useIsMobile } from 'zephyrex/hooks/useMobile';
import { LIMITS, LORE, SAFETY } from '~/contract';
import { chipGroup } from 'zephyrex/hooks/chipKeys';
import { ChoiceChip } from 'zephyrex/ui/choice-chip';
import { parseTags } from '~/features/chat/library';
import { type Objective, ObjectivesEditor } from './ObjectivesEditor';
import { type TableNoteValue, TableNotesEditor } from './TableNotesEditor';
import { PICTURE_TYPES, pictureFromFile } from '~/features/media/picture';

const RATING_LABELS = { general: 'General', teen: 'Teen', mature: 'Mature' } as const;

export interface ChatSettingsValue {
  title: string;
  persona_id: string | null;
  preset_id: string | null;
  endpoint_id: string | null;
  author_note: string;
  lorebook_ids: string[];
  lore_settings: LoreSettingsValue;
  system_prompt: string;
  summary: string;
  tags: string[];
  folder: string;
  muted_ids: string[];
  background: string | null;
  objectives: Objective[];
  content_rating: 'general' | 'teen' | 'mature' | null;
  lines: string[];
  veils: string[];
  table_notes: TableNoteValue[];
  campaign_id: string | null;
  scenario_id: string | null;
}

/** What a chat sets of World Info's settings; the rest take the contract's defaults. */
export type LoreSettingsValue = {
  scan_depth?: number;
  token_budget?: number;
  recursion_steps?: number;
  case_sensitive?: boolean;
  match_whole_words?: boolean;
};

export interface Option {
  id: string;
  name: string;
}

const NONE = '';

function Choice({
  label,
  value,
  options,
  noneLabel,
  onChange,
}: {
  label: string;
  value: string | null;
  options: readonly Option[];
  noneLabel: string;
  onChange: (value: string | null) => void;
}): ReactElement {
  const id = useId();
  return (
    <div className='grid gap-1.5'>
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={value ?? NONE}
        onChange={(event) => onChange(event.target.value === NONE ? null : event.target.value)}
        className='h-11 rounded-md border bg-background px-3 text-sm'
      >
        <option value={NONE}>{noneLabel}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </div>
  );
}

export function ChatSettings({
  open,
  onOpenChange,
  value,
  personas,
  presets,
  endpoints,
  lorebooks,
  folders = [],
  cast = [],
  campaigns = [],
  scenarios = [],
  onSave,
  onSummarize,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: ChatSettingsValue;
  personas: readonly Option[];
  presets: readonly Option[];
  endpoints: readonly Option[];
  lorebooks: readonly Option[];
  /** The folders other chats use, offered as suggestions. */
  folders?: readonly string[];
  /** The chat's characters; a group's members can be left out of the turn order (A52). */
  cast?: readonly Option[];
  /** The campaigns a chat can belong to (A57); its frame is read every turn. */
  campaigns?: readonly Option[];
  /** The scenarios a chat can run (A59, A60); the GM's view of it is read every turn. */
  scenarios?: readonly Option[];
  onSave: (value: ChatSettingsValue) => void;
  /** Asks the model for a summary of the branch so far (null when it could not). */
  onSummarize?: () => Promise<string | null>;
}): ReactElement {
  const mobile = useIsMobile();
  const [draft, setDraft] = useState(value);
  const [summarizing, setSummarizing] = useState(false);
  const [tagText, setTagText] = useState(value.tags.join(', '));
  const [linesText, setLinesText] = useState(value.lines.join(', '));
  const [veilsText, setVeilsText] = useState(value.veils.join(', '));
  const [pictureProblem, setPictureProblem] = useState<string | null>(null);
  const ids = {
    rating: useId(),
    lines: useId(),
    veils: useId(),
    background: useId(),
    folder: useId(),
    folderList: useId(),
    tags: useId(),
    title: useId(),
    summary: useId(),
    system: useId(),
    note: useId(),
    scan: useId(),
    budget: useId(),
    recursion: useId(),
  };
  const setLore = <K extends keyof LoreSettingsValue>(key: K, next: LoreSettingsValue[K]) =>
    set('lore_settings', { ...draft.lore_settings, [key]: next });
  const loreNumber = (key: 'scan_depth' | 'token_budget' | 'recursion_steps', text: string) => {
    const [low, high] = LORE.ranges[key];
    const value = Number.parseInt(text, 10);
    setLore(key, Number.isNaN(value) ? undefined : Math.min(high, Math.max(low, value)));
  };
  const toggleBook = (id: string) =>
    set(
      'lorebook_ids',
      draft.lorebook_ids.includes(id)
        ? draft.lorebook_ids.filter((one) => one !== id)
        : [...draft.lorebook_ids, id].slice(0, LIMITS.lorebooks_per_chat),
    );
  const set = <K extends keyof ChatSettingsValue>(key: K, next: ChatSettingsValue[K]) =>
    setDraft((current) => ({ ...current, [key]: next }));

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setDraft(value);
          setTagText(value.tags.join(', '));
          setLinesText(value.lines.join(', '));
          setVeilsText(value.veils.join(', '));
        }
        onOpenChange(next);
      }}
    >
      <SheetContent side={mobile ? 'bottom' : 'right'} className='max-h-[90svh] overflow-y-auto pb-safe'>
        <SheetHeader>
          <SheetTitle>Chat settings</SheetTitle>
          <SheetDescription>Apply to this chat only.</SheetDescription>
        </SheetHeader>
        <form
          className='grid gap-4 p-4'
          onSubmit={(event) => {
            event.preventDefault();
            // Settings left empty take the contract's defaults: they are not sent.
            const loreSettings = Object.fromEntries(
              Object.entries(draft.lore_settings).filter(([, setting]) => setting !== undefined),
            );
            onSave({
              ...draft,
              title: draft.title.trim() || value.title,
              lore_settings: loreSettings,
              tags: parseTags(tagText).slice(0, LIMITS.tags_per_record),
              folder: draft.folder.trim(),
              lines: parseTags(linesText).slice(0, LIMITS.safety_items),
              veils: parseTags(veilsText).slice(0, LIMITS.safety_items),
            });
            onOpenChange(false);
          }}
        >
          <div className='grid gap-1.5'>
            <Label htmlFor={ids.title}>Title</Label>
            <Input
              id={ids.title}
              value={draft.title}
              maxLength={LIMITS.chat_title_characters}
              className='h-11'
              onChange={(event) => set('title', event.target.value)}
            />
          </div>
          <div className='grid gap-3 sm:grid-cols-2'>
            <div className='grid gap-1.5'>
              <Label htmlFor={ids.folder}>Folder</Label>
              <Input
                id={ids.folder}
                list={ids.folderList}
                value={draft.folder}
                maxLength={LIMITS.name_characters}
                placeholder='None'
                className='h-11'
                onChange={(event) => set('folder', event.target.value)}
              />
              <datalist id={ids.folderList}>
                {folders.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </div>
            <div className='grid gap-1.5'>
              <Label htmlFor={ids.tags}>Tags</Label>
              <Input
                id={ids.tags}
                value={tagText}
                placeholder='heist, Vell'
                className='h-11'
                onChange={(event) => setTagText(event.target.value)}
              />
            </div>
          </div>
          <Choice
            label='Campaign'
            value={draft.campaign_id}
            options={campaigns}
            noneLabel='None'
            onChange={(next) => set('campaign_id', next)}
          />
          <Choice
            label='Scenario'
            value={draft.scenario_id}
            options={scenarios}
            noneLabel='None'
            onChange={(next) => set('scenario_id', next)}
          />
          <Choice
            label='You play as'
            value={draft.persona_id}
            options={personas}
            noneLabel='Your default persona'
            onChange={(next) => set('persona_id', next)}
          />
          <Choice
            label='Preset'
            value={draft.preset_id}
            options={presets}
            noneLabel='Default settings'
            onChange={(next) => set('preset_id', next)}
          />
          <Choice
            label='Model'
            value={draft.endpoint_id}
            options={endpoints}
            noneLabel='Your default model'
            onChange={(next) => set('endpoint_id', next)}
          />
          <div className='grid gap-1.5'>
            <Label htmlFor={ids.system}>System prompt</Label>
            <p id={`${ids.system}-hint`} className='text-xs text-muted-foreground'>
              Replaces the character’s own for this chat. Leave it blank to keep theirs.
            </p>
            <Textarea
              id={ids.system}
              rows={3}
              value={draft.system_prompt}
              maxLength={LIMITS.chat_system_prompt_characters}
              aria-describedby={`${ids.system}-hint`}
              onChange={(event) => set('system_prompt', event.target.value)}
            />
          </div>
          <div className='grid gap-1.5'>
            <Label htmlFor={ids.note}>Author’s note</Label>
            <p id={`${ids.note}-hint`} className='text-xs text-muted-foreground'>
              A reminder the model reads close to the end of the chat, e.g. the mood or what happens next.
            </p>
            <Textarea
              id={ids.note}
              rows={4}
              value={draft.author_note}
              maxLength={LIMITS.author_note_characters}
              aria-describedby={`${ids.note}-hint`}
              onChange={(event) => set('author_note', event.target.value)}
            />
          </div>
          <div className='grid gap-1.5'>
            <Label htmlFor={ids.summary}>Summary</Label>
            <p id={`${ids.summary}-hint`} className='text-xs text-muted-foreground'>
              The story so far, as the model reads it, so a long chat keeps what fell out of the window.
            </p>
            <Textarea
              id={ids.summary}
              rows={5}
              value={draft.summary}
              maxLength={LIMITS.chat_summary_characters}
              aria-describedby={`${ids.summary}-hint`}
              onChange={(event) => set('summary', event.target.value)}
            />
            {onSummarize !== undefined && (
              <Button
                type='button'
                variant='outline'
                className='h-11 justify-self-start'
                disabled={summarizing}
                onClick={() => {
                  setSummarizing(true);
                  void onSummarize()
                    .then((text) => {
                      if (text !== null && text !== '') set('summary', text);
                    })
                    .finally(() => setSummarizing(false));
                }}
              >
                <Sparkles aria-hidden /> {summarizing ? 'Summarising…' : 'Summarise the story so far'}
              </Button>
            )}
          </div>
          <div className='grid gap-1.5'>
            <span className='text-sm font-medium'>Background</span>
            <div className='flex flex-wrap items-center gap-3'>
              {draft.background !== null && (
                <img src={draft.background} alt='' className='h-16 w-28 rounded-md border object-cover' />
              )}
              <label
                htmlFor={ids.background}
                className='inline-flex h-11 cursor-pointer items-center gap-2 rounded-md border px-4 text-sm'
              >
                <ImageUp className='size-4' aria-hidden /> {draft.background === null ? 'Choose a picture' : 'Change'}
              </label>
              <input
                id={ids.background}
                type='file'
                accept={PICTURE_TYPES.join(',')}
                className='sr-only'
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file === undefined) return;
                  void pictureFromFile(file).then((picture) => {
                    setPictureProblem('refused' in picture ? picture.refused : null);
                    if ('url' in picture) set('background', picture.url);
                  });
                }}
              />
              {draft.background !== null && (
                <Button type='button' variant='ghost' className='h-11' onClick={() => set('background', null)}>
                  Remove
                </Button>
              )}
            </div>
            {pictureProblem !== null && (
              <p role='alert' className='text-sm text-destructive'>
                {pictureProblem}
              </p>
            )}
          </div>
          {cast.length > 1 && (
            <fieldset className='grid gap-2'>
              <legend className='text-sm font-medium'>Takes turns</legend>
              <p className='text-xs text-muted-foreground'>Members left out only speak when you pick them.</p>
              {cast.map((member) => (
                <label key={member.id} className='flex min-h-11 items-center gap-3 rounded-md border px-3 text-sm'>
                  <input
                    type='checkbox'
                    className='size-5'
                    checked={!draft.muted_ids.includes(member.id)}
                    onChange={() =>
                      set(
                        'muted_ids',
                        draft.muted_ids.includes(member.id)
                          ? draft.muted_ids.filter((id) => id !== member.id)
                          : [...draft.muted_ids, member.id],
                      )
                    }
                  />
                  {member.name}
                </label>
              ))}
            </fieldset>
          )}
          <fieldset className='grid gap-3 rounded-lg border p-3'>
            <legend className='px-1 text-sm font-medium'>Table safety</legend>
            <div className='grid gap-2'>
              <span id={ids.rating} className='text-sm'>
                Content rating
              </span>
              <div ref={chipGroup} role='radiogroup' aria-labelledby={ids.rating} className='flex flex-wrap gap-2'>
                {([null, ...SAFETY.ratings] as const).map((rating) => (
                  <ChoiceChip
                    key={rating ?? 'none'}
                    checked={draft.content_rating === rating}
                    className='h-11 px-4'
                    onClick={() => set('content_rating', rating)}
                  >
                    {rating === null ? 'Not set' : RATING_LABELS[rating]}
                  </ChoiceChip>
                ))}
              </div>
            </div>
            <div className='grid gap-1.5'>
              <Label htmlFor={ids.lines}>Lines (never, even off-screen)</Label>
              <Input
                id={ids.lines}
                value={linesText}
                placeholder='spiders, harm to children'
                className='h-11'
                onChange={(event) => setLinesText(event.target.value)}
              />
            </div>
            <div className='grid gap-1.5'>
              <Label htmlFor={ids.veils}>Veils (off-screen only)</Label>
              <Input
                id={ids.veils}
                value={veilsText}
                placeholder='torture, romance'
                className='h-11'
                onChange={(event) => setVeilsText(event.target.value)}
              />
            </div>
          </fieldset>
          <TableNotesEditor value={draft.table_notes} onChange={(next) => set('table_notes', next)} />
          <ObjectivesEditor value={draft.objectives} onChange={(next) => set('objectives', next)} />
          <fieldset className='grid gap-2'>
            <legend className='text-sm font-medium'>Lorebooks</legend>
            {lorebooks.length === 0 && <p className='text-sm text-muted-foreground'>No lorebooks yet.</p>}
            {lorebooks.map((book) => (
              <label key={book.id} className='flex min-h-11 items-center gap-3 rounded-md border px-3 text-sm'>
                <input
                  type='checkbox'
                  className='size-5'
                  checked={draft.lorebook_ids.includes(book.id)}
                  onChange={() => toggleBook(book.id)}
                />
                {book.name}
              </label>
            ))}
          </fieldset>
          <fieldset className='grid gap-3'>
            <legend className='text-sm font-medium'>World Info settings</legend>
            <div className='grid gap-3 sm:grid-cols-3'>
              <div className='grid gap-1.5'>
                <Label htmlFor={ids.scan}>Messages scanned</Label>
                <Input
                  id={ids.scan}
                  type='number'
                  inputMode='numeric'
                  className='h-11'
                  placeholder={String(LORE.defaults.scan_depth)}
                  value={draft.lore_settings.scan_depth ?? ''}
                  onChange={(event) => loreNumber('scan_depth', event.target.value)}
                />
              </div>
              <div className='grid gap-1.5'>
                <Label htmlFor={ids.budget}>Token budget</Label>
                <Input
                  id={ids.budget}
                  type='number'
                  inputMode='numeric'
                  className='h-11'
                  placeholder={String(LORE.defaults.token_budget)}
                  value={draft.lore_settings.token_budget ?? ''}
                  onChange={(event) => loreNumber('token_budget', event.target.value)}
                />
              </div>
              <div className='grid gap-1.5'>
                <Label htmlFor={ids.recursion}>Recursion steps</Label>
                <Input
                  id={ids.recursion}
                  type='number'
                  inputMode='numeric'
                  className='h-11'
                  placeholder={String(LORE.defaults.recursion_steps)}
                  value={draft.lore_settings.recursion_steps ?? ''}
                  onChange={(event) => loreNumber('recursion_steps', event.target.value)}
                />
              </div>
            </div>
            <label className='flex min-h-11 items-center gap-3 text-sm'>
              <input
                type='checkbox'
                className='size-5'
                checked={draft.lore_settings.case_sensitive ?? false}
                onChange={(event) => setLore('case_sensitive', event.target.checked)}
              />
              Keys are case-sensitive
            </label>
            <label className='flex min-h-11 items-center gap-3 text-sm'>
              <input
                type='checkbox'
                className='size-5'
                checked={draft.lore_settings.match_whole_words ?? false}
                onChange={(event) => setLore('match_whole_words', event.target.checked)}
              />
              Keys match whole words only
            </label>
          </fieldset>
          <Button type='submit' className='h-11'>
            Save
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
