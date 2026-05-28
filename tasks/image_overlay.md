# 3-DOF Editor

## Status: Done

## Problem Statement

The user takes a screenshot of a route from a navigation app (primarily Google Maps) and overlays it on the geo-browser detail map to see which neighborhoods a route passes through. The overlay is session-only — it does not persist.

### Use Case (primary)

1. User is navigating with Google Maps and has route options.
2. User captures a screenshot of the route.
3. User pastes it into geo-browser via the toolbar.
4. User scales/adjusts the overlay via pinch or mouse wheel to align it with the base map.
5. User uses the opacity slider to compare the overlay against the base map.

### Step 1: Test Scaffold

Two permanent test buttons load pre-baked images without touching the clipboard:
- `google_maps.png` — Google Maps screenshot (Bellevue/Kirkland)
- `apple_maps.png` — Apple Maps screenshot (Redmond/Bellevue)

These are always visible because the scenario is important for development and testing.

---

## Design Decisions (settled)

### Mode
**Detail view, browse mode.** Overlay is ephemeral — no manifest or `protocols.ts` changes.

### Input
Toolbar button triggers paste via `ClipboardService`. The app is touch-first — no keyboard shortcut. Paste button may be disabled if the platform exposes clipboard content query (iOS/Android may not support this); if not queryable, it is always enabled and shows an error toast on failure.

`ClipboardService` is abstracted as a contract in `contracts.ts`, with a `BrowserClipboardService` in `runtime/`. The test buttons bypass the service and load images directly.

### Placement on Insert
Image is centered on the map container. No drag-to-reposition for now — the user uses scale to align.

### Scale
Pinch (touch) or mouse wheel **when the pointer is over the image** scales the image. Wheel/pinch **outside the image** routes normally to Leaflet (map zoom). The image overlay intercepts wheel events and stops propagation to Leaflet when the pointer is inside.

No scale slider in the toolbar — gesture only for now.

### Opacity
Slider in the toolbar. Visible only when an overlay is active.

### Capacity
One image at a time. Pasting a new image replaces the existing one.

### Remove
"Remove" button in the toolbar. Visible only when an overlay is active.

### Coordinate System
Device coordinates (CSS `position: absolute` over the map container). No Leaflet `imageOverlay` — the image is not geo-anchored yet. The map pans and zooms independently beneath it. Geo-anchoring and "best fit" alignment are future work.

---

## Toolbar Layout (Step 1)

```
[ Google Maps ] [ Apple Maps ]    [ opacity ─────── ]  [ ✕ ]
                                   (active only)      (active only)
```

Future state (paste replaces test buttons):

```
[ Paste ]    [ opacity ─────── ]  [ ✕ ]
             (active only)      (active only)
```

---

## Service Seams (for future work)

### ClipboardService
```ts
// contracts.ts
interface ClipboardService {
    readImage(): Promise<Blob | null>;
    hasImage(): Promise<boolean>; // optional query; may throw on unsupported platforms
}
```

### MapImageAnalysisService (future — not in Step 1)
```ts
// contracts.ts
interface MapImageAnalysisService {
    analyze(image: Blob): Promise<MapImageFeatures>;
}

interface MapImageFeatures {
    estimatedBounds?: LatLngBounds; // for "best fit" geo-anchoring
    // landmarks, route polylines, etc. — TBD
}
```

---

## Settled: Formerly Open Questions

1. **Scale origin**: Always the image center (which is anchored to the map center on insert). No pointer-relative scaling for now.

2. **Error UX for paste failure**: `console.error` / logger only for Step 1. Error UX deferred — tracked as a known gap.

3. **Paste button enabled state**: Conditional on platform capability.
   - `ClipboardService.hasImage()` returns `Promise<boolean>`. If the browser supports `ClipboardItem.types` (Chromium), it resolves to `true` only when an image MIME type is present → button reflects that.
   - If the platform cannot query clipboard contents (Safari, most mobile), `hasImage()` throws or returns `null` → treat as unknown → button always enabled, fails gracefully on actual paste attempt.

---

## Out of Scope (Step 1)

- Drag to reposition
- Geo-anchoring / map coordinate binding
- "Best fit" image recognition
- Multiple overlays
- Persistence
