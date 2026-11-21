// SPDX-License-Identifier: AGPL-3.0-or-later
import { collectionRoutes, localOwner } from '@zephyrex/lite';
import { chatSessions } from '~/lib/sessionRecords';

// GET /v1/chat_session (a campaign's sessions, by number; ?chat_id=) and POST /v1/chat_session.
export const { GET, POST } = collectionRoutes(chatSessions, localOwner);
