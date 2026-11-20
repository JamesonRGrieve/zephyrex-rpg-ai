// SPDX-License-Identifier: AGPL-3.0-or-later
import { generate } from '~/lib/generate';

// POST /v1/ai_chat/generate: a character's next reply, streamed (lib/generate.ts).
export const POST = generate;
