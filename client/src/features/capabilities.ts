// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * What this deployment's back end can do, read from the back end itself: the same UI runs on the
 * lite and SaaS editions and never asks which one it is (docs/DESIGN.md, Editions).
 *
 * A feature turns on when the extension serving it is listed (`GET /v1/extension`). The world
 * and the table come from the other suite products when their extensions are loaded beside this
 * one (docs/SUITE.md, How the three compose).
 */
import { useServerExtensions } from 'zephyrex';

export interface Capabilities {
  /** The back end's answer has arrived. */
  loaded: boolean;
  /** Character cards and personas. */
  characters: boolean;
  /** Lorebooks (World Info). */
  lorebooks: boolean;
  /** Chats and generation. */
  chats: boolean;
  /** Accounts: the same records on every device the person signs in on. */
  accounts: boolean;
  /** The world (zephyrex-rpg-wiki's extensions). */
  world: boolean;
  /** The table (zephyrex-vtt's extensions). */
  table: boolean;
}

export function capabilitiesOf(names: ReadonlySet<string>, loaded: boolean): Capabilities {
  return {
    loaded,
    characters: names.has('ai_character'),
    lorebooks: names.has('ai_lorebook'),
    chats: names.has('ai_chat'),
    accounts: names.has('auth_session'),
    world: names.has('rpg_log') || names.has('world_narrative'),
    table: names.has('rpg_state') || names.has('rpg_scene'),
  };
}

export function useCapabilities(): Capabilities {
  const extensions = useServerExtensions();
  const names = new Set((extensions.data ?? []).map((extension) => extension.name));
  return capabilitiesOf(names, extensions.data !== undefined);
}
