# Composition Camera

Phase 1 of the composition-guide camera: live preview, guide overlays, and a
shutter that captures exactly what's framed on screen.

## Run it

```bash
npm install
npm run dev            # http://localhost:5173 — camera works here (localhost is HTTPS-exempt)
npm run dev -- --host  # expose on your LAN to test on a phone (needs HTTPS, see below)
npm run build           # type-checks + production build to dist/
npm run preview         # serve the production build locally
```

## Testing on a phone

`getUserMedia` requires a secure context. `localhost` is exempt, but your
phone hitting your laptop's LAN IP is not. Easiest options:

- Deploy `dist/` to Vercel or Netlify (both give you HTTPS for free) and open
  that URL on the phone.
- Or add [`@vitejs/plugin-basic-ssl`](https://www.npmjs.com/package/@vitejs/plugin-basic-ssl)
  for a local self-signed cert during `npm run dev -- --host`.

The level/horizon toggle additionally needs `DeviceOrientationEvent`, which
iOS only grants after a user gesture — that's why it's requested inside the
"Level" button's click handler, not on page load.

## Camera controls (zoom, filters, adjustments, focus)

- **Zoom** (`+`/`-`, or the slider above the shutter) — tries hardware zoom
  first via the track's `zoom` constraint (mainly Chrome on Android; rare
  elsewhere). Falls back to a digital zoom otherwise: a CSS `transform:
  scale()` on the preview, with the *same* zoom factor folded into
  `computeSourceCropRect` in `layout.ts` so the captured photo always crops
  to match what was on screen — this is why the crop math takes an explicit
  `displayRect` (the `#stage` element, not the video's own possibly-scaled
  bounding box) rather than measuring the video directly.
- **Filters** — `src/adjustments.ts` defines six presets (Mono, Sepia,
  Noir, Vivid, Cool, Warm) plus brightness/contrast/saturation sliders,
  compiled into one CSS `filter` string. That string is applied to the
  `<video>` for the live preview and to the capture canvas via `ctx.filter`
  before drawing — one source of truth, so the exported photo always
  matches what you saw, not a re-interpretation of it.
- **Focus** (`A` to open the panel) — real hardware control via the track's
  `focusMode`/`focusDistance` constraints, feature-detected. Most laptop
  and phone cameras don't expose this to the browser at all; when a device
  doesn't, the focus section stays hidden and a note says so, rather than
  showing a slider that silently does nothing.

## What's here (Phase 1)

- **`src/camera.ts`** — starts/stops the `getUserMedia` stream, switches
  between front and rear cameras, and turns `getUserMedia` errors into
  readable messages.
- **`src/guides.ts`** — draws the six guides (off, thirds, golden grid,
  golden spiral, diagonals, center cross) into the overlay SVG. The spiral is
  built from the Fibonacci-square construction, one quarter-circle arc per
  square, so it stays crisp at any size and can be flipped/rotated in four
  orientations.
- **`src/layout.ts`** — pure geometry for cropping the live view to a chosen
  aspect ratio (full / 4:3 / 1:1 / 16:9), centered, letterboxed or
  pillarboxed depending on device orientation.
- **`src/orientation.ts`** — reads `deviceorientation` events and converts
  tilt into a single "roll" angle for the level line, correcting for the
  screen's current rotation (portrait vs. landscape).
- **`src/capture.ts`** — crops the captured frame to match `object-fit:
  cover` exactly, then to the active aspect ratio, then (optionally) burns
  the active guide into the exported JPEG.
- **`src/ui.ts`** — wires all of the above to the DOM; the only file that
  touches `document.querySelector`.
- **`public/manifest.webmanifest` + `public/sw.js`** — installable PWA shell
  with a network-first service worker. The icons in `public/icons/` are
  placeholders — swap them for real artwork before shipping.

Extras implemented beyond the original single-file prototype: diagonals and
center-cross guides, aspect-ratio switch, grid opacity/color controls,
front/rear camera toggle, and a device-tilt level/horizon line.

## Phase 2 (subject detection + framing hints) — done, first pass

Toggle **Smart** (or press `S`) to turn on-device subject detection on. What it does:

- **`src/detection.ts`** — lazy-loads two MediaPipe Tasks Vision models only
  when Smart mode is switched on: `ObjectDetector` (EfficientDet-Lite0) finds
  the main subject and its box, and a dedicated `FaceDetector`
  (BlazeFace short-range) finds an actual face and its eye keypoints. Both
  run fully on-device — no frames leave the browser — and fall back from the
  GPU delegate to CPU if WebGL isn't available. If the face model fails to
  load, Smart mode still works off the object detector alone.
- **Why two models:** the first version anchored "where on the subject" to
  score using a fraction of the *object* detector's full-body box (roughly
  eye-level down from the top). That breaks the moment a limb reshapes the
  box — a raised arm, a bag strap, anything — because a fixed fraction of a
  box that no longer means "head to torso" lands nowhere near the actual
  face. The face detector's eye-midpoint keypoint tracks the real face
  regardless of body pose, so that's now the primary anchor; the body-box
  fraction is only a fallback for when no face is found.
- **`src/scoring.ts`** — given the active guide and that anchor point, finds
  the nearest "power point" (the four thirds/phi intersections, the spiral's
  eye, dead center) or nearest point on a diagonal, and turns the offset into
  a short hint like "Move right and up a bit" or "Nicely framed" once the
  anchor is within ~4% of the target.
- **`src/layout.ts`** has both a bounds-checked and an unclamped
  video-pixel-to-frame-percent mapping. The unclamped one matters for the
  subject box: a detection that runs off the edge of the visible (aspect-
  cropped) frame — very common when you're close to the camera — used to
  make the whole box disappear because the bounds-checked mapping returned
  null for any out-of-range corner, even though downstream code was already
  written to clip it. The box now clips to what's visible instead of vanishing.
- The subject's bounding box, a target-point marker, and the hint bubble
  turn green together once framing "snaps."

Still open from the original Phase 2 list: **auto-suggesting which guide
fits a scene** (e.g. picking Center for a tight portrait, Thirds for a wider
one). `computeHint` already scores any guide against a subject, so this is
mostly a small heuristic — a natural next step, not a re-architecture.

Known limitations worth knowing about: both models load together (a few
more seconds and a couple more MB the first time), so Smart mode's loading
state takes a bit longer than the object detector alone; BlazeFace short-
range is tuned for close-up, selfie-camera-distance faces, not a face across
a room; detection runs at ~6–7 fps (every 150 ms) rather than every frame to
stay light; and the object detector still treats the single largest
detection as "the subject," which is a reasonable default but not always
the intended one in a busy scene.
