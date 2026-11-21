// SPDX-License-Identifier: AGPL-3.0-or-later
import { authMagicLinkExtension } from '@zephyrex/auth-magic-link';
import { oauthConsumerExtension } from 'zephyrex/extensions/oauth_consumer';
import type { ZephyrexClientExtension, ZephyrexConfig } from 'zephyrex';
import { RpgAiLogo } from './brand/RpgAiLogo';

/** Where a person works: their chats. `/` is the landing page for visitors. */
export const HOME_PATH = '/play';

/** The app's pages (matched as path prefixes); in the hosted build they need a signed-in person. */
const APP_ROUTES = [
  HOME_PATH,
  '/campaigns',
  '/sandbox',
  '/scenarios',
  '/characters',
  '/lorebooks',
  '/data-bank',
  '/personas',
  '/presets',
  '/models',
  '/regex',
  '/quick-replies',
  '/settings',
];

/**
 * The build edition decides only what the back end can do, never what a page shows. The hosted
 * (saas) build turns on accounts (magic-link sign-in only). The lite build is one person's app with
 * no accounts. Pages show features by capability (src/features/capabilities.ts).
 *
 * The config is imported on the client (app/Providers.tsx) and by the proxy, so it may carry
 * components (the logo).
 */
const HOSTED = process.env.NEXT_PUBLIC_RPG_AI_VARIANT === 'saas';

const rpgAiExtension: ZephyrexClientExtension = {
  name: 'rpg_ai',
  displayName: 'Zephyrex RPG AI',
  description: 'AI characters and an AI game master that play inside your world and at your table.',
  navItems: [
    // The play model (docs/DESIGN.md): campaigns are save states of scenarios; scenario framings
    // live at /campaigns (their prep at /scenarios); one-on-one chats are the sandbox, last.
    { title: 'Campaigns', url: HOME_PATH },
    { title: 'Scenarios', url: '/campaigns' },
    { title: 'Characters', url: '/characters' },
    { title: 'Lorebooks', url: '/lorebooks' },
    { title: 'Data bank', url: '/data-bank' },
    { title: 'Personas', url: '/personas' },
    { title: 'Presets', url: '/presets' },
    { title: 'Models', url: '/models' },
    { title: 'Regex', url: '/regex' },
    { title: 'Quick replies', url: '/quick-replies' },
    { title: 'Settings', url: '/settings' },
    { title: 'Sandbox', url: '/sandbox' },
  ],
};

const DEFAULT_PORT = 1109;

export const APP_NAME = 'Zephyrex RPG AI';
export const APP_SHORT_NAME = 'RPG AI';
export const APP_DESCRIPTION = 'AI characters and a game master who know your world and roll real dice.';

const OAUTH_PROVIDERS = (process.env.NEXT_PUBLIC_OAUTH_PROVIDERS ?? '')
  .split(',')
  .map((name) => name.trim())
  .filter(Boolean);
const OAUTH_LABEL = process.env.NEXT_PUBLIC_OAUTH_LABEL || 'Zephyrex';

const config: ZephyrexConfig = {
  server: {
    // Same-origin: the browser calls `/api/v1/...` on this app, answered by its own lite handlers
    // or, in the hosted build, proxied to server/ (next.config.js).
    baseUrl: '/api',
    ...(HOSTED
      ? { upstreamUrl: process.env.RPG_AI_SERVER_URI || 'http://127.0.0.1:2000' }
      : { upstreamUrl: process.env.API_UPSTREAM_URL || `http://127.0.0.1:${process.env.PORT || DEFAULT_PORT}/api` }),
  },
  app: {
    name: APP_NAME,
    description: APP_DESCRIPTION,
    logo: RpgAiLogo,
    defaultTheme: (process.env.NEXT_PUBLIC_THEME_DEFAULT_MODE as 'dark' | 'light') ?? 'dark',
    // Never send a signed-in person's email hash to Gravatar: no request leaves for a third party.
    gravatar: false,
  },
  auth: HOSTED
    ? {
        enabled: true,
        authPath: '/user',
        authModes: { basic: false },
        // Sign-in through the operator's identity provider (server ai_chat/SignIn.py), named at build
        // time: NEXT_PUBLIC_OAUTH_PROVIDERS lists the instances, NEXT_PUBLIC_OAUTH_LABEL names the button.
        oauthProviders: OAUTH_PROVIDERS,
        ...(OAUTH_PROVIDERS.length === 0
          ? {}
          : { oauthLabels: Object.fromEntries(OAUTH_PROVIDERS.map((name) => [name, OAUTH_LABEL])) }),
        home: HOME_PATH,
        deletionNote:
          'Your characters, personas, chats, presets and model settings are deleted with your account, and you are signed out.',
        privateRoutes: [...APP_ROUTES, ...(process.env.PRIVATE_ROUTES ?? '').split(',').filter(Boolean)],
      }
    : { enabled: false },
  navItems: [
    {
      title: 'Documentation',
      url: '/docs/privacy',
      children: [{ title: 'Privacy Policy', url: '/docs/privacy' }],
    },
  ],
  extensions: HOSTED
    ? [rpgAiExtension, authMagicLinkExtension, ...(OAUTH_PROVIDERS.length === 0 ? [] : [oauthConsumerExtension])]
    : [rpgAiExtension],
};

export default config;
