// Scrolling a container by holding a dragged thing near its edge.
//
// A board wider than its window cannot be crossed while dragging a card: the columns you want are
// off screen and letting go to scroll drops the card where you did not mean it. So the edges pull.
// Pure maths over a rectangle and a pointer — who listens and who scrolls is the caller's business.

/** How wide the pulling zone is at each edge, in pixels. */
export const EDGE_ZONE_PX = 72;

/** Fastest pull, in pixels per frame, reached at the very edge. */
export const EDGE_MAX_SPEED = 18;

/**
 * How far to scroll this frame for a pointer at `x`, negative towards the start.
 *
 * Zero anywhere outside the two zones, and ramped inside them rather than constant: a step that
 * begins the moment you enter the zone yanks the board out from under the card, and one that does
 * not grow makes the far end of a wide board a long wait.
 */
export function edgeScrollStep(
  x: number,
  rect: { left: number; right: number },
  opts?: { zone?: number; max?: number },
): number {
  const zone = opts?.zone ?? EDGE_ZONE_PX;
  const max = opts?.max ?? EDGE_MAX_SPEED;
  if (zone <= 0 || rect.right <= rect.left) return 0;

  // A container narrower than two zones would have them overlap, and a pointer in the middle would
  // be pulled both ways. Splitting it in half lets each edge keep its own side.
  const half = (rect.right - rect.left) / 2;
  const reach = Math.min(zone, half);

  const fromLeft = x - rect.left;
  if (fromLeft < reach) return -ramp(reach - fromLeft, reach, max);

  const fromRight = rect.right - x;
  if (fromRight < reach) return ramp(reach - fromRight, reach, max);

  return 0;
}

/** 0 at the edge of the zone, `max` at the edge of the container, and nothing beyond either. */
function ramp(depth: number, reach: number, max: number): number {
  return Math.round(Math.min(1, Math.max(0, depth / reach)) * max);
}
