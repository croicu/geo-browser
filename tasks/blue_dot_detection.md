# Blue Dot Detection

## Status: Implementation

## Problem Statement

When the user pastes a navigation app screenshot, auto-detect the "you are here" marker
(a blue dot with a white ring) and, if confidence is high enough, automatically start the
editor in 1-DOF mode with the dot as the pin anchor. Below the confidence threshold the
editor starts in 3-DOF as today — the user pins manually.

---

## Confidence Threshold

| Score | Behaviour |
|-------|-----------|
| ≥ 0.6 | Auto-pin at detected center → start in 1-DOF |
| < 0.6 | Start in 3-DOF; user pins manually |

The user can switch modes at any time regardless of how the editor started.

---

## Why App-Agnostic Works

All major navigation apps (Google Maps, Apple Maps, Waze, HERE, Bing Maps) share the same
visual convention for the current location marker:

- **Blue fill**: HSL hue ~210–230°, saturation > 55%, lightness 40–65%
- **White border ring**: lightness > 85%, saturation < 25%
- **Small circle**: radius ~5–25 px at typical screenshot resolutions

We never need to know the source app at paste time.

---

## Key Insight: Fixed-Size Sliding Window

The "you are here" dot is a **fixed-size UI element** — it does not scale with map zoom.
This means we know exactly what size window to search for, and we can crop the heading cone
out of the picture by sizing the window to just the dot's white ring.

### Step 1 — Downsample
Draw the image onto an offscreen `<canvas>` at a fixed working width (512 px, preserving
aspect ratio). After normalisation, the dot's white ring consistently falls in the range of
**14–28 px diameter** across typical phone screenshots at various DPI densities:

| Device class | Physical dot px | After → 512 px |
|---|---|---|
| 1× Android (720 px wide) | ~20 px | ~14 px |
| 2× Retina (1080 px wide) | ~40 px | ~19 px |
| 3× Retina (1179 px wide) | ~60 px | ~26 px |

### Step 2 — Multi-scale window scan
For each candidate window diameter W in **{ 14, 18, 22, 26 }** px:

Slide a W×W window across the downsampled image (stride = W/2 for speed).
For each window position apply a **three-stage funnel** — cheapest check first:

```
Stage 1 — center pixel (1 px lookup):
    Is the single center pixel "blue"?
    No  → skip entire window  (eliminates ~90 % of positions instantly)

Stage 2 — inner circle (≈ π(W/4)² px):
    blue_score = fraction of pixels within radius W/4 that are "blue"
    blue_score < 0.4  → skip ring computation

Stage 3 — white ring (annulus W/4 < r ≤ W/2):
    ring_score = fraction of annulus pixels that are "white-ish"
    dot_score  = blue_score × ring_score
```

Color definitions (HSL):
- **blue**: hue ∈ [205°, 235°], saturation > 55%, lightness ∈ [38%, 68%]
- **white-ish**: lightness > 82%, saturation < 28%

Track the global maximum `dot_score` and the window position + scale that produced it.

The vast majority of windows fail Stage 1 on a single pixel read. Stage 3 (the ring scan)
runs only for windows that are already a strong blue-center candidate.

### Step 3 — Pick winner
Return the centroid of the best window in normalised image coordinates (0–1).
`confidence = max dot_score` (ranges 0–1; product of two fractions).

### Why this beats connected components

| Problem | Connected-component | Sliding window |
|---|---|---|
| Heading cone attached to dot | Inflates blob, drops circularity | Cone outside window → ignored |
| River / ocean fill | Large blob, size filter needed | Ring zone also blue → ring_score ≈ 0 |
| Route line | Elongated blob, low circularity | Narrow → low blue_score in round window |
| Multiple scales | One pass per component | One pass per scale (4 passes total) |

---

## Module Location

```
src/vision/
  blueDotDetector.ts    — detectBlueDot(img) → DetectionResult | null
```

`src/vision/` is intentionally thin for now. Future additions (e.g. route line extraction,
map scale reading) belong here too.

### Public interface

```ts
export interface DetectionResult {
    confidence: number;   // 0–1
    x: number;            // normalised 0–1 within image natural dimensions
    y: number;
}

// Synchronous; runs on downsampled canvas (< 100 ms typical).
// Returns null if no blue candidate found at all.
export function detectBlueDot(img: HTMLImageElement): DetectionResult | null;
```

---

## Integration in ImageOverlayWidget

In the `img "load"` handler, **after** applying the fresh default state (scale=1, offset=0)
and **before** calling `showActiveControls`:

```ts
if (!restore) {
    const hit = detectBlueDot(img);
    if (hit && hit.confidence >= 0.6) {
        const imgRect       = img.getBoundingClientRect();
        const containerRect = this._map.getContainer().getBoundingClientRect();
        const cx = imgRect.left + hit.x * imgRect.width  - containerRect.left;
        const cy = imgRect.top  + hit.y * imgRect.height - containerRect.top;
        this.pin(cx, cy);
        getLogger().info("image_overlay.auto_pin", { confidence: hit.confidence });
    }
}
```

No changes to the snapshot/restore path — auto-detection only runs on fresh pastes.

---

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Blue ocean / lake fills | Ring zone is also blue → ring_score ≈ 0 → dot_score ≈ 0 |
| Blue route / highway lines | Elongated → low blue_score in circular inner zone |
| Heading cone attached to dot | Outside window at correct scale → not counted |
| Other round blue UI elements (pins, waypoints) | Typically lack the white ring → low ring_score |
| Dark-mode maps | Hue/saturation ranges unchanged; may need lightness floor lowered to ~30% |
| Dot partially off-screen edge of screenshot | Window clamps to image bounds; partial match still scores if ring is visible |

---

## Out of Scope

- Worker/off-thread processing (sync canvas scan is fast enough for now)
- ML-based detection (add only if heuristic accuracy proves insufficient)
- Detecting other map elements (route lines, destination pins)
