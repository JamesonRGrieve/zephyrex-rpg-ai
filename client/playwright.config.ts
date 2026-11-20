// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The end-to-end suite runs every spec on desktop and on a phone, against the lite edition: this
 * app's own API routes (RPG_AI_VARIANT=lite) on a throwaway SQLite file, with one local person, and
 * a local model server (e2e/support/model-server.mjs) that answers as an OpenAI-compatible endpoint.
 *
 * The SaaS projects (the same UI over ../server) join once the server's ai_character and ai_chat
 * extensions exist (docs/DESIGN.md, Phases); until then there is no SaaS back end to run against.
 *
 * Each server has its own port and build directory, so the suite runs beside a dev server.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

export const PORTS = { model: 47211, lite: 47212 } as const;
const host = (port: number) => `http://127.0.0.1:${port}`;
const scratch = mkdtempSync(path.join(process.env.E2E_SCRATCH ?? tmpdir(), 'rpg-ai-e2e-'));
const NEXT_DEV = './node_modules/.bin/next dev';
const STARTUP_MS = 300_000;

/** Where the e2e model server listens; specs add it as a model endpoint. */
export const MODEL_URL = `${host(PORTS.model)}/v1`;

const lite = {
  NEXT_TELEMETRY_DISABLED: '1',
  RPG_AI_VARIANT: 'lite',
  NEXT_DIST_DIR: '.next-e2e-lite',
  PORT: String(PORTS.lite),
  APP_URI: host(PORTS.lite),
  DATABASE_URL: `file:${path.join(scratch, 'lite.db')}`,
};

const desktop = devices['Desktop Chrome'];
const phone = devices['Pixel 7'];

export default defineConfig({
  testDir: './e2e',
  // The lite edition has one local person and one database: specs that change its records run
  // one at a time.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: { trace: 'retain-on-failure', navigationTimeout: 60_000 },
  projects: [
    { name: 'lite', use: { ...desktop, baseURL: host(PORTS.lite) }, grepInvert: /@phone-only/ },
    { name: 'lite-phone', use: { ...phone, baseURL: host(PORTS.lite) }, grep: /@phone/ },
  ],
  webServer: [
    {
      command: `node e2e/support/model-server.mjs ${PORTS.model}`,
      url: `${host(PORTS.model)}/health`,
      reuseExistingServer: false,
      timeout: STARTUP_MS,
    },
    {
      command: `./node_modules/.bin/prisma migrate deploy && ${NEXT_DEV} -p ${PORTS.lite} -H 127.0.0.1`,
      url: `${host(PORTS.lite)}/api/v1/alive`,
      reuseExistingServer: false,
      timeout: STARTUP_MS,
      env: lite,
    },
  ],
});
