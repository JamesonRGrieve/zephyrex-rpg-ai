// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync } from 'node:fs';
import path from 'path';
import type { StorybookConfig } from '@storybook/nextjs';

const APP_SRC = path.resolve(import.meta.dirname, '../src');
// public/ holds only what is fetched into it , so it may not exist.
const PUBLIC = path.resolve(import.meta.dirname, '../public');

// The suite's own guides, from the wiki's and the VTT's checkouts beside this one (the operator, 2026-11-23:
// "import the storybooks for wiki and vtt to keep things DRY"): one copy of each, theirs, never ours.
const SIBLING_DOCS = [
  path.resolve(import.meta.dirname, '../../../zephyrex-rpg-wiki/client/packages/wiki/src/docs'),
  path.resolve(import.meta.dirname, '../../../zephyrex-vtt/client/src/docs'),
].filter((folder) => existsSync(folder));

const config: StorybookConfig = {
  stories: [
    '../src/**/*.mdx',
    '../src/**/*.stories.@(js|jsx|mjs|ts|tsx)',
    ...SIBLING_DOCS.map((folder) => `${folder}/**/*.mdx`),
  ],
  // Storybook 10 folds actions/controls/interactions/viewport into core; links, a11y and docs (the MDX
  // guides) remain as separate addons here.
  addons: ['@storybook/addon-links', '@storybook/addon-a11y', '@storybook/addon-docs'],
  framework: {
    name: '@storybook/nextjs',
    options: {},
  },
  staticDirs: existsSync(PUBLIC) ? ['../public'] : [],
  core: {
    disableTelemetry: true,
  },
  webpackFinal: async (webpackConfig) => {
    webpackConfig.resolve = webpackConfig.resolve || {};
    // This app's `~/*` alias (tsconfig paths); the framework is a compiled package.
    webpackConfig.resolve.alias = { ...(webpackConfig.resolve.alias || {}), '~': APP_SRC };
    // The VTT's play UI ships as TypeScript source (next.config.js transpiles it, as transpilePackages); the
    // stories build compiles it with the same rule as the app's own TypeScript, or webpack can't parse it
    // (2026-11-24: "Module parse failed" on vtt-play's extension.tsx and index.ts stopped every story test).
    webpackConfig.module = webpackConfig.module || {};
    const rules = (webpackConfig.module.rules = webpackConfig.module.rules || []);
    const typescript = rules.find(
      (rule): rule is { test: RegExp; use?: unknown; loader?: unknown; options?: unknown } =>
        typeof rule === 'object' &&
        rule !== null &&
        'test' in rule &&
        rule.test instanceof RegExp &&
        rule.test.test('a.tsx') &&
        ('use' in rule || 'loader' in rule),
    );
    if (typescript !== undefined) {
      // Its own rule (the app's rule leaves node_modules out, where pnpm links the package).
      rules.push({
        test: /\.[cm]?[jt]sx?$/,
        include: /[\\/]vtt-play[\\/]src[\\/]/,
        ...(typescript.use === undefined ? {} : { use: typescript.use }),
        ...(typescript.loader === undefined ? {} : { loader: typescript.loader, options: typescript.options }),
      } as (typeof rules)[number]);
    }
    return webpackConfig;
  },
};

export default config;
