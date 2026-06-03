# `__void__` Virtual Layer

## Status: Done

## Problem Statement

A runtime-computed heatmap layer that highlights geographic emptiness — grid cells with low POI density relative to the currently visible layers. The inverse signal to the amenity heatmap.
`__void__` is a UI artifact only. It is not persisted, not sent to the builder, and not part of the composite signal algorithm. It is rebuilt fresh on demand.

---

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

---

## Behavior

- Appears in the layer list and toggles like any other layer.
- On toggle-on: begin async computation (see algorithm below). Render progressively as passes complete.
- On toggle-off: abort any in-progress computation. Clear rendered output.
- On sibling layer visibility change while `__void__` is visible: abort current computation, discard output, restart from scratch.
- Reads sibling layer GeoJSON via `GeoArea` (read-only). Writes computed output directly into its own layer state. No Controller involvement.

---

## Algorithm

### Inputs

- **Point features** from all currently visible GeoJSON layers (excluding `__void__` and `__poi__`)
- **Polygon features** from all currently visible GeoJSON layers → exclusion mask (parks, water bodies, nature reserves)

The exclusion mask prevents open green/blue space from being misclassified as desolate. A park is not a void — it is deliberately empty. Polygon features in OSM already encode this distinction.

### Progressive computation

Three passes in sequence, time-boxed to ~3 seconds total:

| Pass | Grid spacing |
|------|-------------|
| 1    | 200m        |
| 2    | 100m        |
| 3    | 50m         |

Each pass replaces the previous rendered output. The user sees a rough void map immediately; it sharpens while they look at it.

### Per-pass steps

1. Sample the area bounding box on a regular lat/lon grid at the current spacing.
2. For each grid cell centroid:
   - If it falls inside any polygon feature in the exclusion mask → skip (no weight, no marker).
   - Otherwise: find the nearest POI from the point feature set; use `distance_meters` as the void weight (far from POIs = high weight = void).
3. Normalize weights across the grid.
4. Emit as GeoJSON Point features with a `weight` property.
5. Feed into `leaflet.heat` via the existing heatmap pipeline.

### Performance

Use spatial bucketing for nearest-POI lookup: divide the bounding box into a coarse bucket grid, assign each POI to its bucket, then for each sample point check only the neighboring buckets. This reduces the effective complexity from O(n²) to near-linear in practice.

### Abort contract

Check for an abort signal between grid rows in each pass. If the layer is toggled off or any sibling layer visibility changes mid-pass, stop immediately and discard partial output.

---

## What `__void__` is not

- **Not persisted.** Rebuilt each session on demand.
- **Not sent to the builder.** The builder has no interest in derived UI state.
- **Not part of the composite signal.** It is a visualization aid. The underlying liveliness signal is still driven by POI density in the data layers.
- **Not a replacement for the amenity heatmap.** The two layers are complementary: the heatmap shows where life is; `__void__` shows where it isn't.
