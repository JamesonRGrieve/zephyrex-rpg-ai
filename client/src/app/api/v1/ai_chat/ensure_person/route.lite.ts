// SPDX-License-Identifier: AGPL-3.0-or-later
import { ensurePerson } from '~/lib/generate';

// POST /v1/ai_chat/ensure_person: someone the narrator voiced, made a person and cast (lib/generate.ts).
export const POST = ensurePerson;
