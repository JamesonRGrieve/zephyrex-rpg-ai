// SPDX-License-Identifier: AGPL-3.0-or-later
import { inspectPrompt } from '~/lib/generate';

// POST /v1/ai_chat/prompt: what the model would be given, without asking it (lib/generate.ts).
export const POST = inspectPrompt;
