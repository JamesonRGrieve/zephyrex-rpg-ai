// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Where the SaaS e2e server (../server/e2e_server.py) writes the magic links it would email: one
 * file per address, the newest link last. The config and the specs both compute it from the
 * environment alone, so every Playwright worker finds the same directory.
 */
import { tmpdir } from 'node:os';
import path from 'node:path';

export const OUTBOX = path.join(process.env.E2E_SCRATCH ?? tmpdir(), 'rpg-ai-e2e-outbox');
