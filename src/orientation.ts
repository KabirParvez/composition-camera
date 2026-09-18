type RollListener = (rollDeg: number) => void;

interface DeviceOrientationEventIOS {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}

let listener: ((e: DeviceOrientationEvent) => void) | null = null;

/** iOS 13+ requires a user gesture before device orientation events are allowed. */
export async function requestOrientationPermission(): Promise<boolean> {
  const ctor = window.DeviceOrientationEvent as unknown as DeviceOrientationEventIOS | undefined;
  if (ctor && typeof ctor.requestPermission === 'function') {
    try {
      return (await ctor.requestPermission()) === 'granted';
    } catch {
      return false;
    }
  }
  // Non-iOS browsers don't gate the API behind a permission prompt.
  return 'DeviceOrientationEvent' in window;
}

function screenAngle(): number {
  const orientation = window.screen?.orientation;
  if (orientation && typeof orientation.angle === 'number') return orientation.angle;
  // Older Safari fallback.
  const legacy = (window as unknown as { orientation?: number }).orientation;
  return typeof legacy === 'number' ? legacy : 0;
}

/** Converts raw beta/gamma into a single "roll" angle (0 = level), accounting
 *  for whether the phone is currently held in portrait or landscape. */
function rollFromEvent(e: DeviceOrientationEvent): number | null {
  if (e.beta == null || e.gamma == null) return null;
  const angle = ((screenAngle() % 360) + 360) % 360;
  if (angle === 90) return -e.beta;
  if (angle === 270) return e.beta;
  if (angle === 180) return -e.gamma;
  return e.gamma; // angle === 0, standard portrait
}

/** Subscribes to device tilt; calls back with roll in degrees (0 = level). */
export function subscribeToRoll(cb: RollListener): () => void {
  listener = (e: DeviceOrientationEvent) => {
    const roll = rollFromEvent(e);
    if (roll != null) cb(roll);
  };
  window.addEventListener('deviceorientation', listener);
  return unsubscribeFromRoll;
}

export function unsubscribeFromRoll(): void {
  if (listener) {
    window.removeEventListener('deviceorientation', listener);
    listener = null;
  }
}
