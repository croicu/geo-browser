# User Data Share

**Status: Done**

## Problem

Users collect trip points throughout the day via long-press. There is no way to get that data off the device. The primary scenario is: collect points while exploring → export to a GeoJSON file in the evening.

A secondary scenario (not in scope now) is importing "planned points" for the next day.

## Design Decisions

- **Export only** for now. Import is deferred.
- **Format**: GeoJSON (standard, opens in QGIS, Google Maps, etc.)
- **Scope**: current area only (`areaId`-scoped, matching how the store works)
- **Filename**: `{areaId}-user-points.geojson`
- **UI**: "Download points" button inside the `MapLayerFlyoutControl` panel, below the layer list. Shown only in detail view.
- **Sink abstraction**: export calls `_userPointsStore.getPoints(areaId)` — the same path that will work with the future Cloudflare Worker implementation without any changes here.

## Weight Fix (prerequisite)

`getWeight()` in `layerView.ts` reads `properties.weight` and defaults to `1` when absent. User points are stored with `properties.pressure` only, so every user point renders at hardcoded weight=1 in heatmap mode, ignoring the recorded pressure.

Fix:
- `userPointsStore.addPoint`: store `weight: pressure` alongside `pressure`
- `readPressure()` in `userLayerView.ts`: also check `weight` as fallback (backward compat for existing stored points)

After the fix, the exported GeoJSON naturally carries `timestamp`, `weight`, and `pressure` on every feature.

## Implementation Plan

### 1. Fix weight storage (`src/runtime/userPointsStore.ts`)
- In `addPoint`, add `weight: pressure` to feature properties.

### 2. Update `readPressure` fallback (`src/view/detail/userLayerView.ts`)
- Read `pressure ?? weight` so old stored points (no `weight`) still render correctly.

### 3. Extend `WidgetFactory` (`src/contracts.ts`)
- Add `onExportUserPoints?: () => void` to the options of `createMapLayerFlyout`.

### 4. `MapLayerFlyoutControl` (`src/view/detail/leafletFactories.ts`)
- Render a "Download points" button when `onExportUserPoints` is provided.
- Button sits below the layer list, detail view only.

### 5. `DetailView.exportUserPoints()` (`src/view/detail/detailView.ts`)
- Call `await this._userPointsStore.getPoints(this._area.id)`.
- Guard: if `features.length === 0`, log and return (no empty downloads).
- Serialize to JSON blob, trigger `<a download>` with filename `{areaId}-user-points.geojson`.
- Log start, end, error.

### 6. Wire up in `DetailView.createMap()`
- Pass `onExportUserPoints: () => this.exportUserPoints()` when creating the flyout.

### 7. Unit tests
- `userPointsStore`: verify `weight` is stored equal to `pressure`.
- `detailView`: verify export triggers `getPoints` and produces a download (stub store).
