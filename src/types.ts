export type GuideName = 'off' | 'thirds' | 'phi' | 'spiral' | 'diagonals' | 'center';

export type AspectKey = 'full' | '4:3' | '1:1' | '16:9';

export interface SpiralOrientation {
  rot: number;   // 0-3, number of 90deg rotations
  flip: boolean; // mirror horizontally before rotating
}

export interface AppState {
  guide: GuideName;
  orient: SpiralOrientation;
  aspect: AspectKey;
  facing: 'environment' | 'user';
  gridOpacity: number; // 0-100
  gridColor: string;   // hex
  levelOn: boolean;
  smartOn: boolean;
}

export const ASPECT_RATIOS: Record<AspectKey, number | null> = {
  full: null,
  '4:3': 4 / 3,
  '1:1': 1,
  '16:9': 16 / 9
};

/** A detected subject's box, in 0-100 percent of the visible (aspect-cropped) frame. */
export interface Subject {
  x: number; // center
  y: number; // center
  w: number;
  h: number;
  score: number;
  label: string;
}

export interface FrameHint {
  targetX: number;
  targetY: number;
  distance: number; // 0-100 space
  snapped: boolean;
  text: string;
}

