// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextResponse } from 'next/server';

/**
 * The server-side extensions this API serves, as server-framework lists its own
 * (`GET /v1/extension`). The UI turns a feature on when the extension serving it is listed, so
 * lite lists exactly what its own routes answer: characters and personas, lorebooks, chats and
 * their generation. Accounts, plans and the world and table (the wiki and VTT products) stay off because
 * their extensions are absent.
 */
export const LITE_EXTENSIONS = [
  {
    id: 'lite-ai_character',
    name: 'ai_character',
    friendly_name: 'Characters',
    description: 'Character cards and personas',
  },
  {
    id: 'lite-ai_lorebook',
    name: 'ai_lorebook',
    friendly_name: 'Lorebooks',
    description: 'World Info: lorebooks and their entries',
  },
  {
    id: 'lite-ai_campaign',
    name: 'ai_campaign',
    friendly_name: 'Campaigns',
    description: 'Campaign frames: the table’s agreement, read every turn',
  },
  {
    id: 'lite-ai_chat',
    name: 'ai_chat',
    friendly_name: 'Chats',
    description: 'Chats, messages, presets, model endpoints and generation',
  },
] as const;

export function GET(): NextResponse {
  return NextResponse.json({ extensions: LITE_EXTENSIONS });
}
