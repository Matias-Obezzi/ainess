/**
 * Resolves each delegation against the children list (by lowercased name or exact id).
 * Returns `resolved` (the found agents) in the same order as the delegations,
 * and `unknown` (the non-matching names) without duplicates.
 */
export function resolveDelegations<T extends { id: string; name: string }>(
  delegations: { agent: string }[],
  children: T[]
): { resolved: T[]; unknown: string[] } {
  const resolved: T[] = [];
  const unknown = new Set<string>();

  for (const task of delegations) {
    const child = children.find(
      c => c.id === task.agent || c.name.toLowerCase() === task.agent.toLowerCase()
    );
    if (child) {
      resolved.push(child);
    } else {
      unknown.add(task.agent);
    }
  }

  return { resolved, unknown: Array.from(unknown) };
}
