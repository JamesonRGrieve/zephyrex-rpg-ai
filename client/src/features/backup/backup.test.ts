// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { BACKUP_RESOURCES, BackupFileError, makeBackup, parentsFirst, readBackup, restoredFields } from './backup';

const spec = (resource: string) =>
  BACKUP_RESOURCES.find((one) => one.resource === resource) as (typeof BACKUP_RESOURCES)[number];

describe('backups', () => {
  it('writes every resource after the ones it points at', () => {
    const order = BACKUP_RESOURCES.map((one) => one.resource);
    for (const one of BACKUP_RESOURCES) {
      for (const ref of one.refs) {
        const targets = 'scopeField' in ref ? Object.values(ref.byScope) : [ref.resource];
        for (const target of targets)
          if (target !== one.resource) expect(order.indexOf(target)).toBeLessThan(order.indexOf(one.resource));
      }
    }
  });

  it('points references at the new ids, drops server-set fields, and loses what was not restored', () => {
    const ids = new Map([
      ['character', new Map([['c-old', 'c-new']])],
      ['lorebook', new Map([['b-old', 'b-new']])],
    ]);
    const chat = {
      id: 'chat-old',
      created_at: 'x',
      updated_at: 'y',
      title: 'Chat',
      character_ids: ['c-old', 'c-gone'],
      muted_ids: [],
      lorebook_ids: ['b-old'],
      persona_id: 'p-gone',
      preset_id: null,
    };
    expect(restoredFields(spec('chat'), chat, ids)).toEqual({
      title: 'Chat',
      character_ids: ['c-new'],
      muted_ids: [],
      // A backup from before vox_ids restores with none on vox.
      vox_ids: [],
      lorebook_ids: ['b-new'],
      persona_id: null,
      preset_id: null,
    });
    const document = { id: 'd', name: 'Notes', text: 'x', scope: 'character', scope_id: 'c-old' };
    expect(restoredFields(spec('data_document'), document, ids)).toMatchObject({ scope: 'character', scope_id: 'c-new' });
    expect(restoredFields(spec('model_endpoint'), { id: 'e', name: 'Local', has_api_key: true }, ids)).toEqual({
      name: 'Local',
    });
  });

  it('orders a chat’s messages parents first', () => {
    const messages = [
      { id: 'c', parent_id: 'b' },
      { id: 'a', parent_id: null },
      { id: 'b', parent_id: 'a' },
    ];
    expect(parentsFirst(messages).map((message) => message.id)).toEqual(['a', 'b', 'c']);
  });

  it('reads back only its own files', () => {
    const backup = makeBackup({ persona: [] }, new Date('2026-11-20T00:00:00Z'));
    expect(readBackup(JSON.parse(JSON.stringify(backup)))).toEqual(backup);
    expect(() => readBackup({ format: 'other' })).toThrow(BackupFileError);
  });
});
