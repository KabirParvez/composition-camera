export interface CameraError {
  message: string;
}

let currentStream: MediaStream | null = null;
let currentTrack: MediaStreamTrack | null = null;

export function isCameraSupported(): boolean {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

/** Starts (or restarts) the camera with the given facing mode. Stops any
 *  previous stream first so the old camera light turns off. */
export async function startCamera(
  video: HTMLVideoElement,
  facing: 'environment' | 'user'
): Promise<void> {
  stopCamera();
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: facing },
      width: { ideal: 1920 },
      height: { ideal: 1080 }
    },
    audio: false
  });
  currentStream = stream;
  currentTrack = stream.getVideoTracks()[0] ?? null;
  video.srcObject = stream;
  await video.play();
}

export function stopCamera(): void {
  if (currentStream) {
    currentStream.getTracks().forEach(t => t.stop());
    currentStream = null;
    currentTrack = null;
  }
}

/** True if the device exposes more than one camera, so a flip button is worth showing. */
export async function hasMultipleCameras(): Promise<boolean> {
  if (!navigator.mediaDevices?.enumerateDevices) return false;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(d => d.kind === 'videoinput').length > 1;
  } catch {
    // Labels/counts are sometimes hidden until permission is granted; default to true
    // so the toggle is available rather than silently missing.
    return true;
  }
}

export function describeGetUserMediaError(e: unknown): string {
  const name = e && typeof e === 'object' && 'name' in e ? String((e as { name: unknown }).name) : '';
  if (name === 'NotAllowedError') {
    return 'Camera access was blocked. Allow it in your browser settings, then try again.';
  }
  if (name === 'NotFoundError') {
    return 'No camera was found on this device.';
  }
  return `Could not start the camera (${name || 'unknown error'}). Check that no other app is using it.`;
}

// ---- Zoom and focus ----
// `zoom`, `focusMode`, and `focusDistance` are part of the Media Capture
// Extensions spec, not the core Media Capture and Streams spec TypeScript's
// bundled DOM types cover, so they're missing from MediaTrackCapabilities /
// MediaTrackConstraintSet. Support is real but inconsistent: mainly Chrome
// on Android for `zoom`, and rarely anything at all for manual focus.
interface ExtendedCapabilities {
  zoom?: { min: number; max: number; step: number };
  focusMode?: string[];
  focusDistance?: { min: number; max: number; step: number };
}
interface ExtendedConstraintSet extends MediaTrackConstraintSet {
  zoom?: number;
  focusMode?: string;
  focusDistance?: number;
}
interface ExtendedSettings {
  zoom?: number;
  focusMode?: string;
  focusDistance?: number;
}

function extendedCapabilities(): ExtendedCapabilities {
  return (currentTrack?.getCapabilities?.() ?? {}) as ExtendedCapabilities;
}

export interface ZoomInfo {
  native: boolean; // hardware zoom via the track vs. a digital fallback the UI handles
  min: number;
  max: number;
  step: number;
  current: number;
}

/** Digital zoom's own range when the hardware doesn't expose one. */
const DIGITAL_ZOOM_RANGE = { min: 1, max: 3, step: 0.1 };

export function getZoomInfo(): ZoomInfo {
  const zoom = extendedCapabilities().zoom;
  if (zoom) {
    const current = (currentTrack?.getSettings() as ExtendedSettings)?.zoom ?? zoom.min;
    return { native: true, min: zoom.min, max: zoom.max, step: zoom.step || 0.1, current };
  }
  return { native: false, ...DIGITAL_ZOOM_RANGE, current: 1 };
}

/** Applies hardware zoom. Only call this when `getZoomInfo().native` is
 *  true — otherwise there's no track-level constraint to set and the UI
 *  should fall back to the digital zoom (CSS transform + crop math) instead. */
export async function setNativeZoom(value: number): Promise<void> {
  if (!currentTrack) return;
  await currentTrack.applyConstraints({ advanced: [{ zoom: value } as ExtendedConstraintSet] });
}

export interface FocusInfo {
  supported: boolean;
  modes: string[];
  manual: boolean; // true if a numeric focusDistance range is also available
  min?: number;
  max?: number;
  step?: number;
}

export function getFocusInfo(): FocusInfo {
  const caps = extendedCapabilities();
  if (!caps.focusMode || !caps.focusMode.length) return { supported: false, modes: [], manual: false };
  return {
    supported: true,
    modes: caps.focusMode,
    manual: caps.focusMode.includes('manual') && !!caps.focusDistance,
    min: caps.focusDistance?.min,
    max: caps.focusDistance?.max,
    step: caps.focusDistance?.step
  };
}

export async function setFocusMode(mode: string): Promise<void> {
  if (!currentTrack) return;
  await currentTrack.applyConstraints({ advanced: [{ focusMode: mode } as ExtendedConstraintSet] });
}

export async function setFocusDistance(value: number): Promise<void> {
  if (!currentTrack) return;
  await currentTrack.applyConstraints({
    advanced: [{ focusMode: 'manual', focusDistance: value } as ExtendedConstraintSet]
  });
}
