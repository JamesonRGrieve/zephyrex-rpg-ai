// SPDX-License-Identifier: AGPL-3.0-or-later
'use client';
/**
 * "End session" (A24): when the AI GM runs the game, pressing it writes the session's report into
 * the wiki campaign the chat's frame is linked to (the operator, 2026-11-21: only a button). Offered
 * when the world is loaded beside this app and the chat plays in a campaign frame; the server
 * answers 422 when that frame isn't linked to a wiki campaign, and says so.
 */
import { useState } from 'react';
import { useClient, writeProblem } from 'zephyrex';
import { notify } from 'zephyrex/hooks/useToast';
import { z } from 'zod';
import { useCapabilities } from '~/features/capabilities';

const endedSchema = z.object({ report_id: z.string(), title: z.string(), mentions: z.number() });

/** What a written report says to the person. */
export function endedNotice(mentions: number): string {
  if (mentions === 0) return 'The report is in the campaign log.';
  return `The report is in the campaign log, linked to ${mentions} ${mentions === 1 ? 'page' : 'pages'} it names.`;
}

export function useEndSession(chat: { id: string; campaign_id: string | null }): {
  available: boolean;
  ending: boolean;
  problem: string | null;
  end: () => Promise<void>;
} {
  const { world } = useCapabilities();
  const client = useClient();
  const [ending, setEnding] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  return {
    available: world && chat.campaign_id !== null,
    ending,
    problem,
    end: async () => {
      setEnding(true);
      let mentions = 0;
      const failed = await writeProblem(
        client.post('/v1/session_end', { session_end: { chat_id: chat.id } }).then((answer) => {
          mentions = endedSchema.parse(answer).mentions;
        }),
        'The session report was not written',
      );
      setProblem(failed);
      setEnding(false);
      if (failed === null) notify('Session ended', endedNotice(mentions));
    },
  };
}
