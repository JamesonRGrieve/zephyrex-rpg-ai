// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The lore relevance gate (A15): only when the keyword-matched entries don't fit the lore budget
 * is a decision model asked which to keep, from those entries only; its pick is applied in its
 * order, each entry kept while it still fits (the operator, 2026-11-20: "When too many match").
 * The server twin is server/extensions/ai_lorebook/LoreGate.py; both run
 * contract/lore-gate-cases.json.
 */

export interface CostedEntry {
  id: string;
  tokens: number;
}

/** Whether the matched entries overflow the budget, so the model must choose. */
export function loreGateNeeded(tokens: readonly number[], budget: number): boolean {
  return tokens.reduce((sum, count) => sum + count, 0) > budget;
}

/** The ids kept from the model's pick: offered ones only, each once, in its order, while they fit. */
export function applyLorePick(entries: readonly CostedEntry[], picked: readonly string[], budget: number): string[] {
  const offered = new Map(entries.map((entry) => [entry.id, entry.tokens]));
  const kept: string[] = [];
  let used = 0;
  for (const id of picked) {
    const tokens = offered.get(id);
    if (tokens === undefined || kept.includes(id) || used + tokens > budget) continue;
    kept.push(id);
    used += tokens;
  }
  return kept;
}
