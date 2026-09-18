import type { GuideName, SpiralOrientation } from './types';

const NS = 'http://www.w3.org/2000/svg';
const PHI = 1.618034;

interface StaticGuide {
  v?: number[];   // vertical line positions, % of frame width
  h?: number[];   // horizontal line positions, % of frame height
  diagonals?: boolean;
  center?: boolean;
}

const STATIC_GUIDES: Partial<Record<GuideName, StaticGuide>> = {
  off: {},
  thirds: { v: [100 / 3, 200 / 3], h: [100 / 3, 200 / 3] },
  phi: { v: [38.2, 61.8], h: [38.2, 61.8] },
  diagonals: { diagonals: true },
  center: { center: true }
};

/** Maps a point in the unstretched golden-rectangle space (u in [0, PHI], v in
 *  [0, 1]) to frame percent space, applying the spiral's flip/rotate state. */
function makeTransform(orient: SpiralOrientation) {
  return ([u, v]: [number, number]): [number, number] => {
    let x = u / PHI, y = v;
    if (orient.flip) x = 1 - x;
    for (let k = 0; k < orient.rot; k++) [x, y] = [1 - y, x];
    return [x * 100, y * 100];
  };
}

interface Rect { x: number; y: number; w: number; h: number; }

function shrinkRect(r: Rect, i: number): Rect {
  switch (i % 4) {
    case 0: { const s = r.h; return { x: r.x + s, y: r.y, w: r.w - s, h: r.h }; }
    case 1: { const s = r.w; return { x: r.x, y: r.y + s, w: r.w, h: r.h - s }; }
    case 2: { const s = r.h; return { x: r.x, y: r.y, w: r.w - s, h: r.h }; }
    default: { const s = r.w; return { x: r.x, y: r.y, w: r.w, h: r.h - s }; }
  }
}

// Golden spiral: split a golden rectangle into squares, one quarter-circle arc per square.
function spiralPath(orient: SpiralOrientation): string {
  let r: Rect = { x: 0, y: 0, w: PHI, h: 1 };
  const segs: { a: [number, number]; b: [number, number]; s: number }[] = [];
  for (let i = 0; i < 10; i++) {
    let s: number, a: [number, number], b: [number, number];
    switch (i % 4) {
      case 0: s = r.h; a = [r.x, r.y + s]; b = [r.x + s, r.y]; break;
      case 1: s = r.w; a = [r.x, r.y]; b = [r.x + s, r.y + s]; break;
      case 2: s = r.h; a = [r.x + r.w, r.y]; b = [r.x + r.w - s, r.y + s]; break;
      default: s = r.w; a = [r.x + s, r.y + r.h]; b = [r.x, r.y + r.h - s];
    }
    segs.push({ a, b, s });
    r = shrinkRect(r, i);
  }

  const tf = makeTransform(orient);
  const swap = orient.rot % 2 === 1;
  const sweep = orient.flip ? 0 : 1;
  const f = (n: number) => n.toFixed(3);

  let d = 'M ' + tf(segs[0].a).map(f).join(' ');
  for (const g of segs) {
    let rx = (g.s / PHI) * 100, ry = g.s * 100;
    if (swap) [rx, ry] = [ry, rx];
    d += ` A ${f(rx)} ${f(ry)} 0 0 ${sweep} ${tf(g.b).map(f).join(' ')}`;
  }
  return d;
}

/** The point the golden spiral winds into — its focal "eye" — found by
 *  iterating the same square-subtraction the path itself is built from
 *  until the remaining rectangle collapses to (near) a point. */
export function spiralEyePoint(orient: SpiralOrientation): { x: number; y: number } {
  let r: Rect = { x: 0, y: 0, w: PHI, h: 1 };
  for (let i = 0; i < 40; i++) r = shrinkRect(r, i);
  const tf = makeTransform(orient);
  const [x, y] = tf([r.x + r.w / 2, r.y + r.h / 2]);
  return { x, y };
}

function el(tag: string, attrs: Record<string, string | number>): SVGElement {
  const node = document.createElementNS(NS, tag);
  for (const k in attrs) node.setAttribute(k, String(attrs[k]));
  return node;
}

/** Draws the named guide into the given SVG (viewBox 0 0 100 100) and returns
 *  whether the spiral-only controls (rotate/flip) should be shown. */
export function drawGuide(svg: SVGSVGElement, name: GuideName, orient: SpiralOrientation): boolean {
  svg.replaceChildren();

  if (name === 'spiral') {
    svg.appendChild(el('path', { d: spiralPath(orient) }));
    return true;
  }

  const g = STATIC_GUIDES[name] ?? {};
  (g.v ?? []).forEach(x => svg.appendChild(el('line', { x1: x, y1: 0, x2: x, y2: 100 })));
  (g.h ?? []).forEach(y => svg.appendChild(el('line', { x1: 0, y1: y, x2: 100, y2: y })));

  if (g.diagonals) {
    svg.appendChild(el('line', { x1: 0, y1: 0, x2: 100, y2: 100 }));
    svg.appendChild(el('line', { x1: 100, y1: 0, x2: 0, y2: 100 }));
  }

  if (g.center) {
    svg.appendChild(el('line', { x1: 50, y1: 0, x2: 50, y2: 100 }));
    svg.appendChild(el('line', { x1: 0, y1: 50, x2: 100, y2: 50 }));
    svg.appendChild(el('circle', { cx: 50, cy: 50, r: 12 }));
  }

  return false;
}
