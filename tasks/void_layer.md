# `__void__` Virtual Layer — Mundane

**Status**: Done.

## Third revision (implemented): computation moved to `geo-builder`

Supersedes both the original heatmap renderer and the `L.rectangle`-grid rendering pivot below.
`geo-builder` now precomputes smooth void polygons offline; `geo-browser` only resolves which
precomputed variant to show and renders it as a plain GeoJSON polygon — no client-side geometry
computation left at all. Full contract: [docs/LAYERS.md](../docs/LAYERS.md);
schema documented in `docs/MANIFEST.md`.

**Why:** the rectangle-grid pivot (below) fixed performance at city scale but couldn't fix two
things: jagged contours are inherent to an axis-aligned grid, and even with a bucket index +
canvas renderer the live computation was still felt on the main thread.

**What changed in `geo-browser`:**
- `voidLayerComputer.ts` and `voidSpatialIndex.ts` deleted entirely (dead — all math now lives
  in `geo-builder`'s `VoidWorker`), along with the canvas-pane/renderer plumbing added for them
  (`RendererHandle`, `LayerFactory.createCanvasRenderer`, `MapHandle.createPane`).
- `VoidLayerView` rewritten to a thin fetch-and-render: given a resolved `GeoLayer`, `load()`s
  its precomputed GeoJSON and renders it via the new `LayerFactory.createGeoJsonPolygon`.
- New `VoidVariantResolver` (pure, unit-tested): parses the `__void__`/`__void__<id>__`/
  `__void__<id>_<id>__` naming convention and resolves which variant to show via
  minimal-superset search over the currently-visible non-virtual sibling layers.
- `GeoLayer.isSourceData()` added — `isVirtual()` (url == null) stopped being a reliable proxy
  for "real acquired data layer" once `__void__*` variants carry real urls too. Fixed the two
  call sites that relied on the old assumption (`poiLayerView.ts`, `syncPoiSourceVisibility`).
- `DetailView`: single synthesized "Mundane" toggle regardless of how many `__void__*` variants
  exist in the manifest — `buildFlyoutLayers`/`buildVoidFlyoutLayer` collapse them to one row,
  keyed by the bare `__void__` id (so toggle state/callback routing stays correct) but displaying
  whichever variant's `name`/`style` is currently active.

**Verified in browser** against `geo-builder`'s real output for the local `redmond` debug area
(35,642-point-scale data isn't relevant here — this is precomputed, so size no longer matters):
flyout shows exactly one "Mundane" row; toggling it on renders the bare `__void__` polygon with
all siblings visible; isolating exactly one sibling ("Restaurants, Food") swaps the render and
label to "No Restaurants, Food" (`__void__2__`); turning that last sibling off too falls back to
"Mundane" again (zero-visible case). No console/page errors in any state.

**Known follow-up, not blocking:** every variant's manifest `style` still carries the old
heatmap-tuned `{opacity: 0.3, color: "#3f3f3f"}` in some already-published data — cosmetic only,
update per-area styles to `{opacity: 0.80, color: "#4a5568"}` (or drop the block, since those
now match the code's own defaults) whenever convenient.

**Faded edge (2026-07-12):** a hard polygon edge read poorly in manual testing. Re-added a
dedicated Leaflet pane (`void-pane`) + `MapHandle.createPane` (both had been deleted as dead
code earlier this same day, once for the rectangle-grid version) and applied `blur(5px)`
directly to the pane's SVG element — not the pane div itself, which is a zero-size positioning
wrapper and would clip the overflowing (real-sized) SVG child entirely if filtered directly.
This exact mistake was already made and fixed once before for the canvas-renderer version of
this layer (see the second-revision section below) — worth remembering as a general Leaflet
pane/CSS-filter gotcha, not just a void-layer one.

-----

## Rendering Pivot (second revision, now superseded — kept for history)

Replaced the original `leaflet.heat`-with-a-fake-solid-gradient renderer with a real grid of
`L.rectangle` cells plus a CSS `blur(5px)`. Goal: a visually prominent fog-of-war look — the
original heatmap-based version read as too subtle.

Decisions made when reopening this task, revised after browser-testing against real data
(Berlin has 35,642 point features across its heatmap layers — far more than the initial
"typical layer has <100 features" assumption):

- **Exclusion mask stays a union.** Both real `Polygon`/`MultiPolygon` geometry *and* the
  existing `radius_m`/`area_sqm`-tagged point trick (parks encoded as points with an area)
  exclude cells.
- **Nearest-POI lookup uses a bucket index (`VoidSpatialIndex`), not brute-force.** Brute-force
  was the initial call, but on Berlin's 35,642 points a single 200m pass took ~10s — untenable
  against the spec's ~3s budget. `VoidSpatialIndex` buckets sources into a 32x32 grid sized to
  the area's own bbox (not a fixed meter size — a prior bucketing attempt broke on small bboxes
  for exactly that reason) and expands outward ring-by-ring from the query cell. Cut the
  200m pass from ~10s to ~1.3s.
- **Rectangles render on a canvas renderer, not the SVG default.** A city-scale area can
  qualify hundreds of thousands of cells in the finest pass (Berlin: 279,134 at 50m). That
  many individual SVG path elements would be untenable; one shared `<canvas>`
  (`LayerFactory.createCanvasRenderer`, pane-scoped) handles it cheaply.
- **Blur is applied to the canvas element itself, not the pane div.** Leaflet pane divs are
  zero-size positioning wrappers (their content is an absolutely-positioned child that
  overflows the pane's own box). A CSS filter applied directly to a zero-size element
  rasterizes to that empty box and clips the overflowing canvas entirely — the fog silently
  disappeared until this was caught. The blur is applied to the canvas child once Leaflet
  creates it (lazily, on first rectangle add).
- **Threshold is a plain distance cutoff**, not a normalized ratio: skip cells whose nearest
  effective distance is below 30m (`VoidLayerView.MIN_DISTANCE_METERS`). No per-pass
  normalization/graded opacity — uniform `fillOpacity: 0.80`.

### Known follow-up: stale manifest style data

Every live area manifest's `__void__` layer entry (hosted in `geo-places`, outside this repo)
still carries the old heatmap-tuned style block: `{ "opacity": 0.3, "color": "#3f3f3f" }`. The
code intentionally still reads `style?.opacity ?? FILL_OPACITY` / `style?.color ?? FILL_COLOR`
(manifest-configurable, consistent with how other layer types work), so with the old values
present the new fog renders at 30% opacity instead of the intended 80% — visually almost
imperceptible. Confirmed by temporarily forcing the new defaults in a local test: at
`opacity: 0.80` / `color: #4a5568` the fog reads exactly as intended (solid haze over the
outskirts, clearing toward the lively center). **Someone needs to update every area's
`__void__` style block in `geo-places` to `{ "opacity": 0.80, "color": "#4a5568" }`** (or drop
the `style` block entirely, since those now match the code's own defaults) before this reads
correctly in production.

## Summary

A runtime-computed layer that highlights geographic emptiness — grid cells with low POI density relative to the currently visible layers. The inverse signal to the amenity heatmap.

Rendered as a fog-of-war overlay: steel-grey filled rectangles cover the map where life is absent, clearing away over lively areas. Coarse blocks resolve to finer ones progressively, like a satellite image loading in.

`__void__` is a UI artifact only. Not persisted, not sent to the builder, not part of the composite signal algorithm. Rebuilt fresh on demand.

-----

## Manifest

Add `"__void__"` to the `type` enum in `definitions/layer` in the manifest schema.

Declare in area manifests as:

```json
{
  "id": "__void__",
  "type": "__void__",
  "url": null,
  "visible": false,
  "name": "Mundane"
}
```

`url` is `null` — no backing GeoJSON file. Default `visible: false` — opt-in only.

-----

## Behavior

- Appears in the layer list and toggles like any other layer.
- On toggle-on: begin async computation (see algorithm below). Render progressively as passes complete.
- On toggle-off: abort any in-progress computation. Clear rendered rectangles.
- On sibling layer visibility change while `__void__` is visible: abort current computation, discard output, restart from scratch.
- Reads sibling layer GeoJSON via `GeoArea` (read-only). Writes computed output directly into its own layer state. No Controller involvement.

-----

## Algorithm

### Inputs

- **Point features** from all currently visible GeoJSON layers (excluding `__void__` and `__poi__`)
- **Polygon features** from all currently visible GeoJSON layers → exclusion mask (parks, water bodies, nature reserves)

The exclusion mask prevents open green/blue space from being misclassified as mundane. A park is deliberately empty — it is not a void. Polygon features in OSM already encode this distinction.

### Progressive computation

Three passes in sequence, time-boxed to ~3 seconds total:

|Pass|Grid spacing|Purpose              |
|----|------------|---------------------|
|1   |200m        |Immediate — rough fog|
|2   |100m        |Refine               |
|3   |50m         |Final detail         |

Each pass removes the previous layer of rectangles and redraws at finer granularity. The fog sharpens in place.

### Per-pass steps

1. Sample the area bounding box on a regular lat/lon grid at the current spacing.
1. For each grid cell:
- If the cell centroid falls inside any polygon feature in the exclusion mask → skip (no rectangle rendered).
- Otherwise: find the nearest POI from the point feature set; compute void score as `distance_meters` (far from POIs = high score = mundane).
- If void score is below a minimum threshold → skip (cell is near enough to a POI; lively areas stay clean).
1. Normalize scores across the grid.
1. Render each qualifying cell as an `L.rectangle` (see rendering below).

### Performance

Nearest-POI lookup uses `VoidSpatialIndex`, a bucket grid sized to the area's own bbox (see
Rendering Pivot notes above) — required once real data volumes were tested (Berlin: 35,642
points; brute-force took ~10s for a single 200m pass, versus ~1.3s with the index).

### Abort contract

Check for an abort signal between grid rows in each pass. If the layer is toggled off or any sibling layer visibility changes mid-pass, stop immediately and discard partial output.

-----

## Rendering

Render each void cell as an `L.rectangle`. Do not use `leaflet.heat`.

Apply a CSS blur filter to soften cell edges — adjacent rectangles bleed into each other, producing fuzzy borders without manual stroke math. Rectangles render into a dedicated Leaflet pane (`void-pane`, created via `MapHandle.createPane`) with a shared canvas renderer (`LayerFactory.createCanvasRenderer`) so the blur applies only to void cells, not to POI markers or any other layer sharing the map, and so a city-scale cell count (hundreds of thousands in the finest pass) renders cheaply. The blur is applied directly to the canvas element (not the pane div, which has zero size of its own and would clip the overflowing canvas if filtered directly).

### Style

|Property      |Value              |Notes                                             |
|--------------|-------------------|--------------------------------------------------|
|Fill color    |`#4a5568`          |Steel blue-grey                                   |
|Fill opacity  |`0.80`             |Opaque enough to obscure the map underneath       |
|Stroke        |none               |Blur handles edge softening                       |
|Container blur|`filter: blur(5px)`|Applied to the Leaflet layer pane or container div|

Opacity may be modulated by the normalized void score if graded coverage is desirable — cells farther from any POI render slightly more opaque. Start with uniform opacity; tune from there.

### Threshold

Do not render cells with a void score below a minimum threshold (suggested: nearest POI within 30m). This keeps the overlay absent over lively areas and avoids speckling around POI clusters.

-----

## What `__void__` is not

- **Not persisted.** Rebuilt each session on demand.
- **Not sent to the builder.** The builder has no interest in derived UI state.
- **Not part of the composite signal.** It is a visualization aid. The underlying liveliness signal is still driven by POI density in the data layers.
- **Not a replacement for the amenity heatmap.** The two layers are complementary: the heatmap shows where life is; Mundane shows where it isn’t.