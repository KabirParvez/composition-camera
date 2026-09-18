export type FilterPreset = 'none' | 'mono' | 'sepia' | 'noir' | 'vivid' | 'cool' | 'warm';

export const FILTER_PRESETS: { id: FilterPreset; label: string }[] = [
  { id: 'none', label: 'Off' },
  { id: 'mono', label: 'Mono' },
  { id: 'sepia', label: 'Sepia' },
  { id: 'noir', label: 'Noir' },
  { id: 'vivid', label: 'Vivid' },
  { id: 'cool', label: 'Cool' },
  { id: 'warm', label: 'Warm' }
];

const PRESET_FILTERS: Record<FilterPreset, string> = {
  none: '',
  mono: 'grayscale(1)',
  sepia: 'sepia(0.75) saturate(1.3)',
  noir: 'grayscale(1) contrast(1.35) brightness(0.92)',
  vivid: 'saturate(1.5) contrast(1.1)',
  cool: 'hue-rotate(-8deg) saturate(1.1) brightness(1.03)',
  warm: 'hue-rotate(8deg) saturate(1.15) sepia(0.12)'
};

export interface Adjustments {
  filter: FilterPreset;
  brightness: number; // percent, 100 = neutral
  contrast: number;   // percent, 100 = neutral
  saturation: number; // percent, 100 = neutral
}

export const DEFAULT_ADJUSTMENTS: Adjustments = {
  filter: 'none',
  brightness: 100,
  contrast: 100,
  saturation: 100
};

/** Compiles the preset + sliders into one CSS `filter` value, applied
 *  identically to the live `<video>` preview and the capture canvas (via
 *  `ctx.filter`) so the exported photo always matches what was on screen. */
export function buildFilterString(a: Adjustments): string {
  const parts: string[] = [];
  const preset = PRESET_FILTERS[a.filter];
  if (preset) parts.push(preset);
  if (a.brightness !== 100) parts.push(`brightness(${a.brightness / 100})`);
  if (a.contrast !== 100) parts.push(`contrast(${a.contrast / 100})`);
  if (a.saturation !== 100) parts.push(`saturate(${a.saturation / 100})`);
  return parts.join(' ');
}
