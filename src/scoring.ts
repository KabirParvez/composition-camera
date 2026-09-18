import type { FrameHint, GuideName, SpiralOrientation } from './types';
import { spiralEyePoint } from './guides';

const SNAP_THRESHOLD = 4; // % of frame — inside this, call it "snapped"

const THIRDS_POINTS = [
  { x: 100 / 3, y: 100 / 3 }, { x: 200 / 3, y: 100 / 3 },
  { x: 100 / 3, y: 200 / 3 }, { x: 200 / 3, y: 200 / 3 }
];
const PHI_POINTS = [
  { x: 38.2, y: 38.2 }, { x: 61.8, y: 38.2 },
  { x: 38.2, y: 61.8 }, { x: 61.8, y: 61.8 }
];

function nearestOf(points: { x: number; y: number }[], p: { x: number; y: number }): { x: number; y: number } {
  let best = points[0], bestD = Infinity;
  for (const c of points) {
    const d = Math.hypot(c.x - p.x, c.y - p.y);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

/** Perpendicular foot of `p` on the infinite line through `a` and `b`. */
function projectOnLine(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) {
  const abx = b.x - a.x, aby = b.y - a.y;
  const apx = p.x - a.x, apy = p.y - a.y;
  const t = (apx * abx + apy * aby) / (abx * abx + aby * aby);
  return { x: a.x + t * abx, y: a.y + t * aby };
}

function nearestOnDiagonals(p: { x: number; y: number }) {
  const p1 = projectOnLine(p, { x: 0, y: 0 }, { x: 100, y: 100 });
  const p2 = projectOnLine(p, { x: 100, y: 0 }, { x: 0, y: 100 });
  const d1 = Math.hypot(p1.x - p.x, p1.y - p.y);
  const d2 = Math.hypot(p2.x - p.x, p2.y - p.y);
  return d1 <= d2 ? p1 : p2;
}

function nearestTarget(
  guide: GuideName,
  orient: SpiralOrientation,
  subject: { x: number; y: number }
): { x: number; y: number } | null {
  switch (guide) {
    case 'off': return null;
    case 'center': return { x: 50, y: 50 };
    case 'thirds': return nearestOf(THIRDS_POINTS, subject);
    case 'phi': return nearestOf(PHI_POINTS, subject);
    case 'spiral': return spiralEyePoint(orient);
    case 'diagonals': return nearestOnDiagonals(subject);
  }
}

function describeMove(dx: number, dy: number, distance: number): string {
  const parts: string[] = [];
  if (Math.abs(dx) > 2) parts.push(dx > 0 ? 'right' : 'left');
  if (Math.abs(dy) > 2) parts.push(dy > 0 ? 'down' : 'up');
  if (!parts.length) return 'Nicely framed';
  const mag = distance > 22 ? 'a lot' : distance > 10 ? 'a bit' : 'a touch';
  return `Move ${parts.join(' and ')} ${mag}`;
}

/** Compares a detected subject's center to the active guide's nearest power
 *  point (or, for diagonals, nearest point on the line) and returns a short
 *  human hint plus enough geometry to draw a target marker. Returns null
 *  when the guide has no meaningful target (guide is off). */
export function computeHint(
  guide: GuideName,
  orient: SpiralOrientation,
  subject: { x: number; y: number }
): FrameHint | null {
  const target = nearestTarget(guide, orient, subject);
  if (!target) return null;
  const dx = target.x - subject.x, dy = target.y - subject.y;
  const distance = Math.hypot(dx, dy);
  const snapped = distance < SNAP_THRESHOLD;
  return { targetX: target.x, targetY: target.y, distance, snapped, text: describeMove(dx, dy, distance) };
}
