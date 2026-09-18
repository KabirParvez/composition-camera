import { computeSourceCropRect } from './layout';
import type { AspectKey } from './types';

export interface RecordingFrameParams {
  aspect: AspectKey;
  zoom: number; // digital zoom factor only (1 when zoom is native/hardware)
  filter: string; // CSS filter syntax
  displayRect: { width: number; height: number }; // pass #stage's rect
}

export interface RecordingHandle {
  /** Stops recording and resolves with the finished clip. */
  stop: () => Promise<{ blob: Blob; mimeType: string }>;
}

const CANDIDATE_MIME_TYPES = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
  'video/mp4'
];

export function isRecordingSupported(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    'captureStream' in HTMLCanvasElement.prototype
  );
}

function pickMimeType(): string | undefined {
  return CANDIDATE_MIME_TYPES.find(t => MediaRecorder.isTypeSupported?.(t));
}

/** Settings are captured once, at the moment recording starts, and held for
 *  the whole clip — mid-recording changes to aspect ratio, zoom, or filters
 *  don't retroactively (or live) alter an in-progress recording. That keeps
 *  the canvas size and CSS filter stable for the encoder's whole session
 *  rather than juggling a resize or a filter change mid-stream. */
export function startRecording(video: HTMLVideoElement, params: RecordingFrameParams, fps = 30): RecordingHandle | null {
  if (!isRecordingSupported()) return null;
  const crop = computeSourceCropRect(video, params.aspect, params.displayRect, params.zoom);
  if (!crop) return null;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, Math.round(crop.sw));
  canvas.height = Math.max(2, Math.round(crop.sh));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.filter = params.filter || 'none';

  let rafId = 0;
  const draw = () => {
    ctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvas.width, canvas.height);
    rafId = requestAnimationFrame(draw);
  };
  draw();

  const stream = canvas.captureStream(fps);
  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = e => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const stopped = new Promise<Blob>(resolve => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType || 'video/webm' }));
  });

  recorder.start();

  return {
    stop: async () => {
      cancelAnimationFrame(rafId);
      if (recorder.state !== 'inactive') recorder.stop();
      stream.getTracks().forEach(t => t.stop());
      const blob = await stopped;
      return { blob, mimeType: mimeType || 'video/webm' };
    }
  };
}

export function fileExtensionFor(mimeType: string): string {
  if (mimeType.includes('mp4')) return 'mp4';
  return 'webm';
}
