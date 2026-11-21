// SPDX-License-Identifier: AGPL-3.0-or-later
import { canonCheck } from '~/lib/canonCheck';

// POST /v1/canon_check: a line checked against canon (none, yellow or red; lib/canonCheck.ts).
export const POST = canonCheck;
