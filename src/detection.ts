import { FilesetResolver, ObjectDetector, FaceDetector, type Detection } from '@mediapipe/tasks-vision';

// Pinned to match the installed npm package version (package.json) so the
// WASM runtime fetched from the CDN at runtime is guaranteed compatible.
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const OBJECT_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite';
const FACE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';

export interface RawDetection {
  originX: number;
  originY: number;
  width: number;
  height: number;
  score: number;
  label: string;
}

export interface FaceAnchor {
  x: number; // source video pixel space
  y: number;
  score: number;
}

type Fileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;

let objectDetector: ObjectDetector | null = null;
let faceDetector: FaceDetector | null = null;
let loadingPromise: Promise<void> | null = null;

export function isDetectorReady(): boolean {
  return objectDetector !== null;
}

export function isFaceDetectorReady(): boolean {
  return faceDetector !== null;
}

async function createObjectDetector(fileset: Fileset): Promise<ObjectDetector> {
  const opts = { scoreThreshold: 0.4, runningMode: 'VIDEO' as const, maxResults: 5 };
  try {
    return await ObjectDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: OBJECT_MODEL_URL, delegate: 'GPU' },
      ...opts
    });
  } catch {
    // Some browsers/GPUs don't support the WebGL delegate; fall back to CPU.
    return await ObjectDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: OBJECT_MODEL_URL, delegate: 'CPU' },
      ...opts
    });
  }
}

async function createFaceDetector(fileset: Fileset): Promise<FaceDetector> {
  try {
    return await FaceDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate: 'GPU' },
      runningMode: 'VIDEO'
    });
  } catch {
    return await FaceDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate: 'CPU' },
      runningMode: 'VIDEO'
    });
  }
}

/** Downloads the WASM runtime and both models (a few MB total, cached by the
 *  browser after the first run) and initializes both detectors. The object
 *  detector is required for Smart mode; the face detector is a best-effort
 *  addition for a much better framing anchor on people — if it fails to
 *  load, Smart mode still works, just falls back to a cruder body-box
 *  estimate (see the caller of `detectFaceAnchor`). */
export async function loadDetector(): Promise<void> {
  if (objectDetector) return;
  if (!loadingPromise) {
    loadingPromise = (async () => {
      const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
      objectDetector = await createObjectDetector(fileset);
      try {
        faceDetector = await createFaceDetector(fileset);
      } catch {
        faceDetector = null;
      }
    })();
  }
  await loadingPromise;
}

function area(d: Detection): number {
  return d.boundingBox ? d.boundingBox.width * d.boundingBox.height : 0;
}

function largestDetection(detections: Detection[]): Detection {
  let best = detections[0], bestArea = area(best);
  for (const d of detections) {
    const a = area(d);
    if (a > bestArea) { best = d; bestArea = a; }
  }
  return best;
}

/** Runs one detection pass on the current video frame and returns the
 *  largest detection (treated as the "main subject"), in source video pixel
 *  coordinates. Returns null if nothing was detected or the detector isn't
 *  loaded yet. `timestampMs` must be monotonically increasing per call
 *  (each detector instance tracks its own clock, so sharing one clock
 *  across `detectMainSubject` and `detectFaceAnchor` is fine). */
export function detectMainSubject(video: HTMLVideoElement, timestampMs: number): RawDetection | null {
  if (!objectDetector) return null;
  const result = objectDetector.detectForVideo(video, timestampMs);
  if (!result.detections.length) return null;

  const best = largestDetection(result.detections);
  const box = best.boundingBox;
  if (!box) return null;
  return {
    originX: box.originX,
    originY: box.originY,
    width: box.width,
    height: box.height,
    score: best.categories[0]?.score ?? 0,
    label: best.categories[0]?.categoryName || 'object'
  };
}

/** Runs the dedicated face detector and returns the eye-midpoint of the
 *  largest face, in source video pixel coordinates. This is a far more
 *  reliable "where to frame a person" anchor than a fraction of a full-body
 *  box — a raised arm, a bag strap, or anything else that changes the
 *  body box's shape doesn't move it. Falls back to the face box's center if
 *  eye keypoints aren't in the result. Returns null if no face is found or
 *  the face detector didn't load. */
export function detectFaceAnchor(video: HTMLVideoElement, timestampMs: number): FaceAnchor | null {
  if (!faceDetector) return null;
  const result = faceDetector.detectForVideo(video, timestampMs);
  if (!result.detections.length) return null;

  const best = largestDetection(result.detections);
  const score = best.categories[0]?.score ?? 0;

  // BlazeFace's first two keypoints are the right and left eye; they're
  // normalized 0-1 relative to the full video frame.
  if (best.keypoints.length >= 2) {
    const [rightEye, leftEye] = best.keypoints;
    return {
      x: ((rightEye.x + leftEye.x) / 2) * video.videoWidth,
      y: ((rightEye.y + leftEye.y) / 2) * video.videoHeight,
      score
    };
  }
  const box = best.boundingBox;
  if (!box) return null;
  return { x: box.originX + box.width / 2, y: box.originY + box.height / 2, score };
}

export function disposeDetector(): void {
  objectDetector?.close();
  objectDetector = null;
  faceDetector?.close();
  faceDetector = null;
  loadingPromise = null;
}
