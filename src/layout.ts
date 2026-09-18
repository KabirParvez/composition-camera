import { ASPECT_RATIOS, type AspectKey } from './types';

export interface FrameRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The centered rectangle (in CSS px, within a `cw`x`ch` container) that the
 *  chosen aspect ratio crops down to. "4:3"/"16:9" are stored as width:height
 *  for a landscape frame; on a portrait screen we crop to the same ratio
 *  rotated (3:4, 9:16), matching how phone camera apps present these. */
export function computeFrameRect(cw: number, ch: number, aspect: AspectKey): FrameRect {
  const ratio = ASPECT_RATIOS[aspect];
  if (ratio == null || cw <= 0 || ch <= 0) {
    return { left: 0, top: 0, width: cw, height: ch };
  }
  const containerRatio = cw / ch;
  const target = containerRatio >= 1 ? ratio : 1 / ratio;

  if (target < containerRatio) {
    // Target is narrower than the container: pillarbox left/right.
    const height = ch;
    const width = ch * target;
    return { left: (cw - width) / 2, top: 0, width, height };
  }
  // Target is wider than (or equal to) the container: letterbox top/bottom.
  const width = cw;
  const height = cw / target;
  return { left: 0, top: (ch - height) / 2, width, height };
}

export interface SourceCropRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/** The rectangle, in source video pixel coordinates, that is actually
 *  visible on screen: first the `object-fit: cover` crop that fills the
 *  display box, then a further centered crop to the chosen aspect ratio.
 *  Shared by capture (what gets exported) and detection (where a subject's
 *  box lands relative to the guide overlay). */
export function computeSourceCropRect(video: HTMLVideoElement, aspect: AspectKey): SourceCropRect | null {
  const vw = video.videoWidth, vh = video.videoHeight;
  const r = video.getBoundingClientRect();
  if (!vw || !vh || !r.width || !r.height) return null;

  const scale = Math.max(r.width / vw, r.height / vh);
  let sw = r.width / scale, sh = r.height / scale;
  let sx = (vw - sw) / 2, sy = (vh - sh) / 2;

  const ratio = ASPECT_RATIOS[aspect];
  if (ratio != null) {
    const containerRatio = r.width / r.height;
    const target = containerRatio >= 1 ? ratio : 1 / ratio;
    const currentRatio = sw / sh;
    if (target < currentRatio) {
      const newSw = sh * target;
      sx += (sw - newSw) / 2;
      sw = newSw;
    } else if (target > currentRatio) {
      const newSh = sw / target;
      sy += (sh - newSh) / 2;
      sh = newSh;
    }
  }
  return { sx, sy, sw, sh };
}

/** Maps a point in source video pixel space to 0-100 percent of the visible,
 *  aspect-cropped frame (the same space the guide overlay is drawn in), or
 *  null if the point falls outside what's currently visible. */
export function mapSourcePointToFrame(crop: SourceCropRect, px: number, py: number): { x: number; y: number } | null {
  const p = mapSourcePointToFrameUnclamped(crop, px, py);
  if (p.x < 0 || p.x > 100 || p.y < 0 || p.y > 100) return null;
  return p;
}

/** Same mapping, but never returns null — values run past 0/100 when the
 *  point is outside the visible frame. Use this for anything you're going to
 *  clamp or clip yourself (like a detection box that's partly cropped off);
 *  use the bounds-checked version above when "not currently visible" should
 *  mean "give up on this point" instead. */
export function mapSourcePointToFrameUnclamped(crop: SourceCropRect, px: number, py: number): { x: number; y: number } {
  return { x: ((px - crop.sx) / crop.sw) * 100, y: ((py - crop.sy) / crop.sh) * 100 };
}

