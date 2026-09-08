/**
 * The tail of a feed, and how much of it is being left out.
 *
 * A conversation is read from the bottom: what you are looking at is the last thing said, and the
 * three thousand messages a project keeps in memory were all being painted anyway. Only the last
 * `limit` are drawn, and whoever asks can walk further back — a window, not a virtual list, because
 * that is all a feed anchored to its own end actually needs.
 */
export function windowOf<T>(items: T[], limit: number): { shown: T[]; hidden: number } {
  if (limit <= 0) {
    return { shown: [], hidden: items.length };
  }
  if (limit >= items.length) {
    return { shown: items, hidden: 0 };
  }
  return {
    shown: items.slice(-limit),
    hidden: items.length - limit
  };
}
