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

export interface TreeRow<M extends TreeMessage> {
  message: M;
  /** How many forks deep it sits: a single line of turns stays at one depth. */
  depth: number;
  /** Whether it is on the branch shown. */
  onPath: boolean;
  /** Whether nothing follows it (where a branch ends). */
  leaf: boolean;
}

/**
 * The whole tree as rows, depth first in the order given, for a tree view (A8). Depth grows only at
 * a fork, so a straight run of turns reads as one column. `messages` must be oldest first.
 */
export function treeRows<M extends TreeMessage>(messages: readonly M[], pathIds: ReadonlySet<string>): TreeRow<M>[] {
  const children = new Map<string | null, M[]>();
  for (const message of messages) children.set(message.parent_id, [...(children.get(message.parent_id) ?? []), message]);
  const walk = (parentId: string | null, depth: number, seen: ReadonlySet<string>): TreeRow<M>[] => {
    const under = (children.get(parentId) ?? []).filter((message) => !seen.has(message.id));
    const childDepth = under.length > 1 ? depth + 1 : depth;
    return under.flatMap((message) => {
      const next = new Set(seen).add(message.id);
      const rows = walk(message.id, childDepth, next);
      return [{ message, depth: childDepth, onPath: pathIds.has(message.id), leaf: (children.get(message.id) ?? []).length === 0 }, ...rows];
    });
  };
  return walk(null, 0, new Set());
}
