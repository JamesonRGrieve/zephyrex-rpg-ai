// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A wiki campaign's own framing as the prompt's frame (Zephyrex RPG, 2026-11-22: the operator's
 * scenarios came from vault_import, framed in the wiki campaign itself, with no campaign frame row):
 * its description and Framing section are the premise, its setting the genre, its play styles the
 * themes, and its GM notes the GM's style (read by the GM's voices only). Pure, and held to
 * contract/campaign-framing-cases.json with ai_chat/CampaignFraming.py.
 */
export interface CampaignFraming {
  name: string;
  description: string;
  framing: string;
  gm_notes: string;
  setting: { id: string; name: string; tone: string } | null;
  play_styles: string[];
}

/** The frame the prompt reads (Prompt frameText / gmStyleText); null when the framing says nothing. */
export function frameFromFraming(framing: CampaignFraming | null): Record<string, unknown> | null {
  if (framing === null) return null;
  const premise = [framing.description, framing.framing].map((part) => part.trim()).filter((part) => part !== '');
  const setting = framing.setting;
  const genre =
    setting === null
      ? ''
      : // The setting's tone is its whole entry: its first paragraph is the genre line's.
        [setting.name.trim(), (setting.tone.trim().split(/\n\s*\n/u)[0] ?? '').trim()]
          .filter((part) => part !== '')
          .join(': ');
  const themes = framing.play_styles.map((style) => style.trim()).filter((style) => style !== '');
  const gmStyle = framing.gm_notes.trim();
  if (premise.length === 0 && genre === '' && themes.length === 0 && gmStyle === '') return null;
  return { premise: premise.join('\n\n'), genre, themes, gm_style: gmStyle };
}
