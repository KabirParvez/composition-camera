export interface CameraError {
  message: string;
}

let currentStream: MediaStream | null = null;

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
  video.srcObject = stream;
  await video.play();
}

export function stopCamera(): void {
  if (currentStream) {
    currentStream.getTracks().forEach(t => t.stop());
    currentStream = null;
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
