import { computeSourceCropRect } from './layout';
import type { AspectKey } from './types';

export interface CaptureOptions {
  aspect: AspectKey;
  burnGuideSvg?: SVGSVGElement | null;
}

/** Crops the live video the same way `object-fit: cover` displays it, then
 *  further crops to the chosen aspect ratio, centered — so the exported
 *  photo matches exactly what was framed on screen. */
export async function capturePhoto(video: HTMLVideoElement, opts: CaptureOptions): Promise<Blob> {
  const crop = computeSourceCropRect(video, opts.aspect);
  if (!crop) throw new Error('Video has no frame yet');
  const { sx, sy, sw, sh } = crop;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sw));
  canvas.height = Math.max(1, Math.round(sh));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

  if (opts.burnGuideSvg) {
    await burnSvgOntoCanvas(canvas, ctx, opts.burnGuideSvg);
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error('Could not encode photo'))),
      'image/jpeg',
      0.92
    );
  });
}

/** Rasterizes the guide SVG (its 0-100 viewBox maps 1:1 to the cropped frame)
 *  on top of the captured canvas. */
async function burnSvgOntoCanvas(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  svg: SVGSVGElement
): Promise<void> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('width', String(canvas.width));
  clone.setAttribute('height', String(canvas.height));
  const xml = new XMLSerializer().serializeToString(clone);
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);

  const img = new Image();
  img.decoding = 'sync';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Could not rasterize guide overlay'));
    img.src = url;
  });
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
}

export function flashScreen(flashEl: HTMLElement): void {
  flashEl.classList.add('on');
  requestAnimationFrame(() => requestAnimationFrame(() => flashEl.classList.remove('on')));
}
