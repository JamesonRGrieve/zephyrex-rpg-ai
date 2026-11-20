// SPDX-License-Identifier: AGPL-3.0-or-later
import { localOwner, recordRoutes } from '@zephyrex/lite';
import { regexScripts } from '~/lib/regexRecords';

// GET, PUT (If-Match) and DELETE (If-Match) /v1/regex_script/{id}.
export const { GET, PUT, DELETE } = recordRoutes(regexScripts, localOwner);
