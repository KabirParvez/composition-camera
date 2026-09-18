import type { AppState, AspectKey, GuideName } from './types';
import { drawGuide } from './guides';
import { computeFrameRect, computeSourceCropRect, mapSourcePointToFrame, mapSourcePointToFrameUnclamped } from './layout';
import {
  startCamera, isCameraSupported, hasMultipleCameras, describeGetUserMediaError,
  getZoomInfo, setNativeZoom, getFocusInfo, setFocusMode, setFocusDistance
} from './camera';
import { capturePhoto, flashScreen } from './capture';
import { requestOrientationPermission, subscribeToRoll, unsubscribeFromRoll } from './orientation';
import { computeHint } from './scoring';
import { FILTER_PRESETS, DEFAULT_ADJUSTMENTS, buildFilterString, type FilterPreset } from './adjustments';

const $ = <T extends Element>(sel: string): T => document.querySelector(sel) as T;

const LEVEL_THRESHOLD_DEG = 1.5;

export function initApp(): void {
  const video = $<HTMLVideoElement>('#cam');
  const stage = $<HTMLElement>('#stage');
  const grid = $<SVGSVGElement>('#grid');
  const mask = $<HTMLElement>('#mask');
  const horizon = $<SVGSVGElement>('#horizon');
  const horizonLine = $<SVGLineElement>('#horizonLine');
  const flash = $<HTMLElement>('#flash');
  const bar = $<HTMLElement>('#bar');
  const gate = $<HTMLElement>('#gate');
  const err = $<HTMLElement>('#err');
  const startBtn = $<HTMLButtonElement>('#start');
  const shutter = $<HTMLButtonElement>('#shutter');
  const thumb = $<HTMLAnchorElement>('#thumb');
  const rotateBtn = $<HTMLButtonElement>('#rotate');
  const flipBtn = $<HTMLButtonElement>('#flip');
  const spiralCtl = $<HTMLElement>('#spiralCtl');
  const flipCamBtn = $<HTMLButtonElement>('#flipCam');
  const levelToggle = $<HTMLButtonElement>('#levelToggle');
  const opacityInput = $<HTMLInputElement>('#opacity');
  const opacityValue = $<HTMLElement>('#opacityValue');
  const smartToggle = $<HTMLButtonElement>('#smartToggle');
  const smartEl = $<HTMLElement>('#smart');
  const subjectBox = $<HTMLElement>('#subjectBox');
  const targetDot = $<HTMLElement>('#targetDot');
  const hintBubble = $<HTMLElement>('#hintBubble');
  const zoomInput = $<HTMLInputElement>('#zoom');
  const zoomValue = $<HTMLElement>('#zoomValue');
  const adjustToggle = $<HTMLButtonElement>('#adjustToggle');
  const adjustPanel = $<HTMLElement>('#adjustPanel');
  const filterCtl = $<HTMLElement>('#filterCtl');
  const brightnessInput = $<HTMLInputElement>('#brightness');
  const brightnessValue = $<HTMLElement>('#brightnessValue');
  const contrastInput = $<HTMLInputElement>('#contrast');
  const contrastValue = $<HTMLElement>('#contrastValue');
  const saturationInput = $<HTMLInputElement>('#saturation');
  const saturationValue = $<HTMLElement>('#saturationValue');
  const focusCtl = $<HTMLElement>('#focusCtl');
  const focusModesEl = $<HTMLElement>('#focusModes');
  const focusDistanceCtl = $<HTMLElement>('#focusDistanceCtl');
  const focusDistanceInput = $<HTMLInputElement>('#focusDistance');
  const focusNote = $<HTMLElement>('#focusNote');

  const state: AppState = {
    guide: 'thirds',
    orient: { rot: 0, flip: false },
    aspect: 'full',
    facing: 'environment',
    gridOpacity: 90,
    gridColor: '#e3b23c',
    levelOn: false,
    smartOn: false,
    zoom: 1,
    zoomIsNative: false,
    adjustments: { ...DEFAULT_ADJUSTMENTS },
    focusMode: null
  };

  // ---- layout: size the grid/mask to the current aspect-ratio frame ----
  function applyFrameLayout(): void {
    const r = stage.getBoundingClientRect();
    const frame = computeFrameRect(r.width, r.height, state.aspect);
    for (const node of [grid, mask]) {
      node.style.left = `${frame.left}px`;
      node.style.top = `${frame.top}px`;
      node.style.width = `${frame.width}px`;
      node.style.height = `${frame.height}px`;
    }
    mask.classList.toggle('on', state.aspect !== 'full');
  }
  window.addEventListener('resize', applyFrameLayout);
  window.addEventListener('orientationchange', applyFrameLayout);

  // ---- guide picker ----
  function redrawGuide(): void {
    const isSpiral = drawGuide(grid, state.guide, state.orient);
    spiralCtl.classList.toggle('hidden', !isSpiral);
  }
  document.querySelectorAll<HTMLButtonElement>('#picker button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#picker button').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
      state.guide = btn.dataset.guide as GuideName;
      redrawGuide();
    });
  });
  rotateBtn.addEventListener('click', () => { state.orient.rot = (state.orient.rot + 1) % 4; redrawGuide(); });
  flipBtn.addEventListener('click', () => { state.orient.flip = !state.orient.flip; redrawGuide(); });

  // ---- aspect ratio ----
  document.querySelectorAll<HTMLButtonElement>('#aspectCtl button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#aspectCtl button').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
      state.aspect = btn.dataset.aspect as AspectKey;
      applyFrameLayout();
    });
  });

  // ---- grid opacity / color ----
  opacityInput.addEventListener('input', () => {
    state.gridOpacity = Number(opacityInput.value);
    document.documentElement.style.setProperty('--grid-opacity', String(state.gridOpacity / 100));
    opacityValue.textContent = `${state.gridOpacity}%`;
  });
  document.querySelectorAll<HTMLButtonElement>('#colorCtl button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#colorCtl button').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
      state.gridColor = btn.dataset.color ?? state.gridColor;
      document.documentElement.style.setProperty('--line', state.gridColor);
    });
  });

  // ---- zoom: hardware zoom when the track exposes it, otherwise a digital
  // fallback (CSS transform for preview + a matching crop in layout.ts) ----
  function refreshZoomInfo(): void {
    const info = getZoomInfo();
    state.zoomIsNative = info.native;
    state.zoom = info.native ? info.current : 1;
    zoomInput.min = String(info.min);
    zoomInput.max = String(info.max);
    zoomInput.step = String(info.step);
    zoomInput.value = String(state.zoom);
    zoomValue.textContent = `${state.zoom.toFixed(1)}x`;
    // Native zoom is applied by the hardware; digital zoom resets to 1x
    // (no scale) whenever the camera (re)starts, so clear any leftover
    // transform from a previous digital session either way.
    video.style.transform = '';
  }
  zoomInput.addEventListener('input', async () => {
    const value = Number(zoomInput.value);
    state.zoom = value;
    zoomValue.textContent = `${value.toFixed(1)}x`;
    if (state.zoomIsNative) {
      try { await setNativeZoom(value); } catch { /* hardware rejected it; slider still reflects intent */ }
    } else {
      video.style.transform = `scale(${value})`;
    }
  });

  // ---- filters + brightness/contrast/saturation: one CSS filter string,
  // applied to the live preview and (via capture.ts) the exported photo ----
  function applyAdjustments(): void {
    video.style.filter = buildFilterString(state.adjustments);
  }
  FILTER_PRESETS.forEach(preset => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = preset.label;
    btn.dataset.filter = preset.id;
    btn.setAttribute('aria-pressed', String(preset.id === state.adjustments.filter));
    btn.addEventListener('click', () => {
      state.adjustments.filter = preset.id as FilterPreset;
      filterCtl.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
      applyAdjustments();
    });
    filterCtl.appendChild(btn);
  });
  brightnessInput.addEventListener('input', () => {
    state.adjustments.brightness = Number(brightnessInput.value);
    brightnessValue.textContent = `${state.adjustments.brightness}%`;
    applyAdjustments();
  });
  contrastInput.addEventListener('input', () => {
    state.adjustments.contrast = Number(contrastInput.value);
    contrastValue.textContent = `${state.adjustments.contrast}%`;
    applyAdjustments();
  });
  saturationInput.addEventListener('input', () => {
    state.adjustments.saturation = Number(saturationInput.value);
    saturationValue.textContent = `${state.adjustments.saturation}%`;
    applyAdjustments();
  });

  // ---- focus: real hardware control, feature-detected. Most webcams and
  // browsers don't expose this at all — when they don't, focusCtl stays
  // hidden and focusNote says so rather than showing a control that does
  // nothing. ----
  function refreshFocusInfo(): void {
    const info = getFocusInfo();
    focusModesEl.replaceChildren();
    if (!info.supported) {
      focusCtl.classList.add('hidden');
      focusNote.classList.remove('hidden');
      state.focusMode = null;
      return;
    }
    focusNote.classList.add('hidden');
    focusCtl.classList.remove('hidden');
    const currentMode = info.modes.includes('continuous') ? 'continuous' : info.modes[0];
    state.focusMode = currentMode;

    info.modes.forEach(mode => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
      btn.dataset.mode = mode;
      btn.setAttribute('aria-pressed', String(mode === currentMode));
      btn.addEventListener('click', async () => {
        state.focusMode = mode;
        focusModesEl.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
        focusDistanceCtl.classList.toggle('hidden', !(mode === 'manual' && info.manual));
        try { await setFocusMode(mode); } catch { /* not every mode is settable on every device */ }
      });
      focusModesEl.appendChild(btn);
    });

    if (info.manual && info.min != null && info.max != null) {
      focusDistanceInput.min = String(info.min);
      focusDistanceInput.max = String(info.max);
      focusDistanceInput.step = String(info.step || (info.max - info.min) / 100);
    }
    focusDistanceCtl.classList.toggle('hidden', !(currentMode === 'manual' && info.manual));
  }
  focusDistanceInput.addEventListener('input', () => {
    void setFocusDistance(Number(focusDistanceInput.value)).catch(() => {});
  });

  adjustToggle.addEventListener('click', () => {
    const show = adjustPanel.classList.contains('hidden');
    adjustPanel.classList.toggle('hidden', !show);
    adjustToggle.setAttribute('aria-pressed', String(show));
  });

  // ---- horizon / level ----
  function setHorizonRoll(rollDeg: number): void {
    horizonLine.setAttribute('transform', `rotate(${(-rollDeg).toFixed(2)} 50 50)`);
    horizon.classList.toggle('level', Math.abs(rollDeg) < LEVEL_THRESHOLD_DEG);
  }
  function turnLevelOff(): void {
    state.levelOn = false;
    unsubscribeFromRoll();
    horizon.classList.remove('on', 'level');
    levelToggle.setAttribute('aria-pressed', 'false');
  }
  levelToggle.addEventListener('click', async () => {
    if (state.levelOn) { turnLevelOff(); return; }

    const granted = await requestOrientationPermission();
    if (!granted) {
      err.textContent = 'Motion access was denied, so the level line is unavailable.';
      return;
    }
    state.levelOn = true;
    horizon.classList.add('on');
    levelToggle.setAttribute('aria-pressed', 'true');

    let gotReading = false;
    subscribeToRoll(rollDeg => { gotReading = true; setHorizonRoll(rollDeg); });

    // Many desktops/laptops expose the DeviceOrientationEvent constructor
    // with no sensor behind it, so "permission granted" doesn't guarantee
    // any events actually arrive. If none show up shortly, the line would
    // otherwise sit frozen at dead-center forever, indistinguishable from a
    // real (always-level) reading — bail out instead of leaving that trap.
    setTimeout(() => {
      if (!gotReading && state.levelOn) {
        turnLevelOff();
        err.textContent = "This device isn't reporting tilt, so the level line isn't available here.";
      }
    }, 1200);
  });

  // ---- camera flip (front/rear) ----
  async function refreshFlipCamVisibility(): Promise<void> {
    flipCamBtn.classList.toggle('hidden', !(await hasMultipleCameras()));
  }
  flipCamBtn.addEventListener('click', async () => {
    state.facing = state.facing === 'environment' ? 'user' : 'environment';
    try {
      await startCamera(video, state.facing);
      refreshZoomInfo();
      refreshFocusInfo();
    } catch (e) {
      err.textContent = describeGetUserMediaError(e);
      state.facing = state.facing === 'environment' ? 'user' : 'environment'; // revert
    }
  });

  // ---- smart mode: on-device subject detection + framing hints ----
  let detectionMod: typeof import('./detection') | null = null;
  let smartInterval: number | null = null;

  function stopSmart(): void {
    state.smartOn = false;
    smartToggle.setAttribute('aria-pressed', 'false');
    smartEl.classList.add('hidden');
    hintBubble.classList.add('hidden');
    if (smartInterval != null) { clearInterval(smartInterval); smartInterval = null; }
  }

  function smartTick(): void {
    if (!detectionMod || !video.videoWidth) return;
    const ts = performance.now();
    const det = detectionMod.detectMainSubject(video, ts);
    const crop = computeSourceCropRect(video, state.aspect, stage.getBoundingClientRect(), state.zoomIsNative ? 1 : state.zoom);

    if (!det || !crop) {
      subjectBox.style.display = 'none';
      targetDot.style.display = 'none';
      hintBubble.textContent = det ? '' : 'Looking for a subject…';
      smartEl.classList.remove('snapped');
      hintBubble.classList.remove('snapped');
      return;
    }

    // Box corners: use the unclamped mapping and clip ourselves, so a body
    // that runs off the bottom/side of the frame (very common — you're
    // closer to the camera than the detector's full-body box expects)
    // still draws a (clipped) box instead of vanishing entirely.
    const topLeft = mapSourcePointToFrameUnclamped(crop, det.originX, det.originY);
    const bottomRight = mapSourcePointToFrameUnclamped(crop, det.originX + det.width, det.originY + det.height);

    // What to score against the guide: prefer the dedicated face detector's
    // eye-midpoint — it tracks the actual face regardless of arm position,
    // bags, or anything else that reshapes a full-body box. Only fall back
    // to a rough eye-level fraction of the body box (or its plain center for
    // non-person subjects) when no face was found.
    const face = detectionMod.detectFaceAnchor(video, ts);
    const anchorPx = face
      ? { x: face.x, y: face.y }
      : {
          x: det.originX + det.width / 2,
          y: det.label === 'person' ? det.originY + det.height * 0.35 : det.originY + det.height / 2
        };
    const center = mapSourcePointToFrame(crop, anchorPx.x, anchorPx.y);
    if (!center) {
      subjectBox.style.display = 'none';
      targetDot.style.display = 'none';
      hintBubble.textContent = 'Subject is out of frame';
      smartEl.classList.remove('snapped');
      hintBubble.classList.remove('snapped');
      return;
    }

    // Only draw the box if some part of it is actually on screen.
    if (bottomRight.x > 0 && bottomRight.y > 0 && topLeft.x < 100 && topLeft.y < 100) {
      const l = Math.max(0, topLeft.x), t = Math.max(0, topLeft.y);
      subjectBox.style.left = `${l}%`;
      subjectBox.style.top = `${t}%`;
      subjectBox.style.width = `${Math.min(100, bottomRight.x) - l}%`;
      subjectBox.style.height = `${Math.min(100, bottomRight.y) - t}%`;
      subjectBox.style.display = 'block';
    } else {
      subjectBox.style.display = 'none';
    }

    const hint = computeHint(state.guide, state.orient, center);
    if (!hint) {
      targetDot.style.display = 'none';
      hintBubble.textContent = 'Pick a guide to get framing hints';
      smartEl.classList.remove('snapped');
      hintBubble.classList.remove('snapped');
      return;
    }
    targetDot.style.left = `${hint.targetX}%`;
    targetDot.style.top = `${hint.targetY}%`;
    targetDot.style.display = 'block';
    hintBubble.textContent = hint.text;
    smartEl.classList.toggle('snapped', hint.snapped);
    hintBubble.classList.toggle('snapped', hint.snapped);
  }

  async function startSmart(): Promise<void> {
    smartToggle.disabled = true;
    const originalLabel = smartToggle.textContent;
    smartToggle.textContent = 'Loading…';
    try {
      if (!detectionMod) detectionMod = await import('./detection');
      await detectionMod.loadDetector();
    } catch {
      err.textContent = 'Could not load the on-device detector — it needs network access once (then the model is cached for next time).';
      smartToggle.disabled = false;
      smartToggle.textContent = originalLabel;
      return;
    }
    smartToggle.disabled = false;
    smartToggle.textContent = originalLabel;
    state.smartOn = true;
    smartToggle.setAttribute('aria-pressed', 'true');
    smartEl.classList.remove('hidden');
    hintBubble.classList.remove('hidden');
    smartInterval = window.setInterval(smartTick, 150);
  }

  smartToggle.addEventListener('click', () => {
    if (state.smartOn) stopSmart(); else void startSmart();
  });

  // ---- gate / start ----
  async function handleStart(): Promise<void> {
    err.textContent = '';
    if (!isCameraSupported()) {
      err.textContent = 'This browser cannot access a camera. Open the page in Chrome or Safari over HTTPS.';
      return;
    }
    try {
      await startCamera(video, state.facing);
      gate.classList.add('hidden');
      bar.classList.remove('hidden');
      applyFrameLayout();
      refreshZoomInfo();
      refreshFocusInfo();
      applyAdjustments();
      void refreshFlipCamVisibility();
    } catch (e) {
      err.textContent = describeGetUserMediaError(e);
    }
  }
  startBtn.addEventListener('click', handleStart);

  // ---- shutter ----
  shutter.addEventListener('click', async () => {
    try {
      const blob = await capturePhoto(video, {
        aspect: state.aspect,
        displayRect: stage.getBoundingClientRect(),
        digitalZoom: state.zoomIsNative ? 1 : state.zoom,
        filter: buildFilterString(state.adjustments),
        burnGuideSvg: state.guide !== 'off' ? grid : null
      });
      flashScreen(flash);
      const url = URL.createObjectURL(blob);
      if (thumb.dataset.url) URL.revokeObjectURL(thumb.dataset.url);
      thumb.dataset.url = url;
      thumb.style.backgroundImage = `url(${url})`;
      thumb.href = url;
      const filename = `composition-${Date.now()}.jpg`;
      thumb.download = filename;
      thumb.classList.add('has');
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
    } catch (e) {
      err.textContent = e instanceof Error ? e.message : 'Could not capture the photo.';
    }
  });

  // ---- keyboard shortcuts (desktop) ----
  const GUIDE_ORDER: GuideName[] = ['off', 'thirds', 'phi', 'spiral', 'diagonals', 'center'];
  function selectGuide(name: GuideName): void {
    document.querySelectorAll('#picker button').forEach(b =>
      b.setAttribute('aria-pressed', String((b as HTMLElement).dataset.guide === name))
    );
    state.guide = name;
    redrawGuide();
  }
  window.addEventListener('keydown', e => {
    if (bar.classList.contains('hidden')) return; // camera not started yet
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return; // let form fields handle their own keys
    if (e.key === ' ' || e.key === 'Enter') {
      if (tag === 'BUTTON') return; // the focused button already handles its own activation
      e.preventDefault();
      shutter.click();
      return;
    }
    const idx = Number(e.key) - 1;
    if (idx >= 0 && idx < GUIDE_ORDER.length) { selectGuide(GUIDE_ORDER[idx]); return; }
    switch (e.key.toLowerCase()) {
      case 'r': if (!spiralCtl.classList.contains('hidden')) rotateBtn.click(); break;
      case 'f': if (!spiralCtl.classList.contains('hidden')) flipBtn.click(); break;
      case 'c': if (!flipCamBtn.classList.contains('hidden')) flipCamBtn.click(); break;
      case 'l': levelToggle.click(); break;
      case 's': smartToggle.click(); break;
      case 'a': adjustToggle.click(); break;
      case '+':
      case '=':
        zoomInput.value = String(Math.min(Number(zoomInput.max), Number(zoomInput.value) + Number(zoomInput.step)));
        zoomInput.dispatchEvent(new Event('input'));
        break;
      case '-':
        zoomInput.value = String(Math.max(Number(zoomInput.min), Number(zoomInput.value) - Number(zoomInput.step)));
        zoomInput.dispatchEvent(new Event('input'));
        break;
    }
  });

  // initial paint
  redrawGuide();
  applyFrameLayout();
  document.documentElement.style.setProperty('--grid-opacity', String(state.gridOpacity / 100));
  document.documentElement.style.setProperty('--line', state.gridColor);
}
