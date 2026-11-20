// SPDX-License-Identifier: AGPL-3.0-or-later
import { collectionRoutes, localOwner } from '@zephyrex/lite';
import { regexScripts } from '~/lib/regexRecords';

// GET /v1/regex_script (list, in the order they run) and POST /v1/regex_script (create).
export const { GET, POST } = collectionRoutes(regexScripts, localOwner);
