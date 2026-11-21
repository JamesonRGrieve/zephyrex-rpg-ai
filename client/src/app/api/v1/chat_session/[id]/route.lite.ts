// SPDX-License-Identifier: AGPL-3.0-or-later
import { localOwner, recordRoutes } from '@zephyrex/lite';
import { chatSessions } from '~/lib/sessionRecords';

// GET, PUT (If-Match) and DELETE (If-Match) /v1/chat_session/{id}.
export const { GET, PUT, DELETE } = recordRoutes(chatSessions, localOwner);
