// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The end-to-end suite runs every spec against both editions, on desktop and on a phone, with a
 * local model server (e2e/support/model-server.mjs) that answers as an OpenAI-compatible endpoint:
 *
 * - `lite`: this app's own API routes (RPG_AI_VARIANT=lite) on a throwaway SQLite file, with one
 *   local person.
 * - `saas`: the same UI over the SaaS server (../server, e2e_server.py) on a throwaway database.
 *   People sign up and in by magic link through the pages; the server writes each link to the
 *   suite's outbox (e2e/support/outbox.ts) in place of email.
 *
 * Each server has its own port and build directory, so the suite runs beside a dev server. The model
 * server is a stub: it streams a fixed sentence, and no model is downloaded or loaded.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { OUTBOX } from './e2e/support/outbox';

export const PORTS = { model: 47211, lite: 47212, server: 47213, saas: 47214 } as const;
const host = (port: number) => `http://127.0.0.1:${port}`;
const scratch = mkdtempSync(path.join(process.env.E2E_SCRATCH ?? tmpdir(), 'rpg-ai-e2e-'));
// Production builds, each in its own build directory: two `next dev` servers from one client/
// directory reload each other through next-env.d.ts (found by Chronos's suite).
const NEXT = './node_modules/.bin/next';
const serve = (port: number) => `${NEXT} build && ${NEXT} start -p ${port} -H 127.0.0.1`;
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

const saas = {
  NEXT_TELEMETRY_DISABLED: '1',
  RPG_AI_VARIANT: 'saas',
  NEXT_DIST_DIR: '.next-e2e-saas',
  PORT: String(PORTS.saas),
  APP_URI: host(PORTS.saas),
  RPG_AI_SERVER_URI: host(PORTS.server),
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
    { name: 'saas', use: { ...desktop, baseURL: host(PORTS.saas) }, grepInvert: /@phone-only/ },
    { name: 'lite-phone', use: { ...phone, baseURL: host(PORTS.lite) }, grep: /@phone/ },
    { name: 'saas-phone', use: { ...phone, baseURL: host(PORTS.saas) }, grep: /@phone/ },
  ],
  webServer: [
    {
      command: `node e2e/support/model-server.mjs ${PORTS.model}`,
      url: `${host(PORTS.model)}/health`,
      reuseExistingServer: false,
      timeout: STARTUP_MS,
    },
    {
      command: `.venv/bin/python e2e_server.py --port ${PORTS.server} --client ${host(PORTS.saas)} --outbox ${OUTBOX}`,
      cwd: '../server',
      url: `${host(PORTS.server)}/health`,
      reuseExistingServer: false,
      timeout: STARTUP_MS,
      env: { E2E_SCRATCH: scratch },
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: serve(PORTS.saas),
      url: `${host(PORTS.saas)}/healthz`,
      reuseExistingServer: false,
      timeout: STARTUP_MS,
      env: saas,
    },
    {
      command: `./node_modules/.bin/prisma migrate deploy && ${serve(PORTS.lite)}`,
      url: `${host(PORTS.lite)}/api/v1/alive`,
      reuseExistingServer: false,
      timeout: STARTUP_MS,
      env: lite,
    },
  ],
});
