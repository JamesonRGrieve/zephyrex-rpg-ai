// SPDX-License-Identifier: AGPL-3.0-or-later
// The wiki's lite API (docs/SUITE.md, Together: rpg-ai composes the wiki), mounted from
// @zephyrex-rpg/wiki/lite. rpg-ai's own routes beside it answer first.
import { wikiLite } from '@zephyrex-rpg/wiki/lite';
import { prisma } from '~/lib/prisma';

export const { GET, POST, PUT, DELETE } = wikiLite({ prisma });
