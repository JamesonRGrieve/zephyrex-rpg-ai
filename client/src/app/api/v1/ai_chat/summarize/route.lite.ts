// SPDX-License-Identifier: AGPL-3.0-or-later
import { summarize } from '~/lib/generate';

// POST /v1/ai_chat/summarize: the branch so far, summarised by the chat's model (lib/generate.ts).
export const POST = summarize;
