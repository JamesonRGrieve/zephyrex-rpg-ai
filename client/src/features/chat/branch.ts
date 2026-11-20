// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A chat is a tree: each message names its parent, and a fork is two children of one message.
 * What is shown, and what a model is given, is one branch: the path from the root to a leaf.
 */

export interface TreeMessage {
  id: string;
  parent_id: string | null;
}

/** The messages from the root to `leafId`, oldest first; empty when the leaf is unknown. */
export function branchTo<M extends TreeMessage>(messages: readonly M[], leafId: string): M[] {
  const byId = new Map(messages.map((message) => [message.id, message]));
  const path: M[] = [];
  const seen = new Set<string>();
  let current = byId.get(leafId);
  while (current !== undefined && !seen.has(current.id)) {
    seen.add(current.id);
    path.push(current);
    current = current.parent_id === null ? undefined : byId.get(current.parent_id);
  }
  return path.reverse();
}

/** The children of `parentId` (null: the chat's first messages), in the order given. */
export function childrenOf<M extends TreeMessage>(messages: readonly M[], parentId: string | null): M[] {
  return messages.filter((message) => message.parent_id === parentId);
}

/**
 * The newest leaf under `fromId`: follow the last child at every fork, so a chat opens where it
 * was last written. `messages` must be oldest first.
 */
export function latestLeaf<M extends TreeMessage>(messages: readonly M[], fromId: string | null = null): M | undefined {
  const children = childrenOf(messages, fromId);
  const last = children.at(-1);
  if (last === undefined) return fromId === null ? undefined : messages.find((message) => message.id === fromId);
  return latestLeaf(messages, last.id) ?? last;
}
