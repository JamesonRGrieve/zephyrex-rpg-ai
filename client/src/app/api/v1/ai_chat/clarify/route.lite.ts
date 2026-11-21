// SPDX-License-Identifier: AGPL-3.0-or-later
import { clarify } from '~/lib/generate';

// POST /v1/ai_chat/clarify: the GM's question when the person's action is ambiguous (lib/generate.ts).
export const POST = clarify;
