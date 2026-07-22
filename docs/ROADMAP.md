# Roadmap

## Current Completed Foundation

- Static catalog discovery with HEAD pointer.
- Catalog/area/layer runtime wrappers.
- Unified map (`MapView`) — one shared, session-lifetime Leaflet map; every area independently renders `circle`/`outline`/`loaded` based on on-screen bbox size and a global zoom floor (`AreaLifecycleTracker`), any number concurrently `loaded`, one "current" area at a time owning the virtual-layer bundle/toolbox (`CurrentAreaBundle`). Replaced the earlier Summary/Detail two-map mode split (back-to-summary widget, per-area hard `maxBounds`/`minZoom` restriction, zoom-threshold auto-navigation between modes, and `lastView` mode/area restoration all retired along with it — see [Layer Lifecycle](../tasks/layer_lifecycle.md)).
- LayerView rendering pipeline.
- Point rendering from GeoJSON.
- Heatmap rendering through `leaflet.heat`.
- Optional point overlay for heatmap debugging.
- Layer selection widget with incremental reconciliation.
- Runtime Context skeleton.
- Offline unit test strategy.
- Map click logging (GPS coordinates logged on tap).
- Viewport synchronization — moveend/zoomend → `AreaLifecycleTracker.recompute()` → state → persist/restore (`MapViewState`/`AreaViewState`) across navigation and reload.
- Geolocation service — blue dot, accuracy ring, follow toggle; session-level, always available (no longer gated to a current area's bounds).
- Bbox highlight rectangle — an area's `outline` render kind, tappable (tap-to-jump).
- POI layer (`__poi__`) — tappable markers from `hasDetails` features; popup with name, amenity, cuisine, address, hours, website, review links (Google Maps, Street View, Yelp, Foursquare, TripAdvisor).
- Enriched POI markers — `wikipedia`, `wikidata`, `stars`, `outdoor_seating` fields; enhanced ring border (two-element SVG pattern); Wikidata thumbnail image; English Wikipedia via GoToLinkedPage redirect.
- User trip layer (`__user__`) — points created via tap-callout star rating or bookmark toggle (long-press/right-click creation and instant right-click delete removed, see [Explicit Point Delete](../tasks/explicit_point_delete.md)); localStorage + gateway storage; pressure-based HSL color.
- Image overlay — paste/Google/Apple image sources; 3-DOF editor (translate, scale, opacity); geo-lock pin; 1-DOF anchor pin variant.
- Blue dot detection — canvas pixel scan auto-aligns a pasted map image to the GPS position; "I feel lucky" manual trigger.
- Tile provider abstraction — CARTO Voyager default, OSM available; one persistent `MapLayerFlyoutControl` owns the tile layer for the whole session.
- Map layer flyout — `MapLayerFlyoutControl` replaced the old `TileProviderControl` + `LayerControl`; single topright control with Map type always, plus Map Details layer list while a current area exists.
- Viewport & per-area state persistence — shared map center/zoom (`MapViewState`) and per-area layer visibility (`AreaViewState`) persist independently; no "last view" mode/area to restore.
- Single-tap layer visibility toggle — removed two-tap expand behavior.
- All interactive controls at topright (map layer flyout, search, image toolbar), geolocation at bottomright.
- Nominatim place search (`__search__`) — bounded to area bbox; ephemeral result marker; promote to trip point on tap.
- Empty-space tap callout — lat/lng + Google/Apple Maps/Street View links; second tap dismisses.
- User star ratings (1–5) and bookmarks on trip points — ring overlays, mutually exclusive, POI callout can create either directly.
- User trip data export — GeoJSON download/share from the layer flyout.
- Void ("Mundane") layer — precomputed in `geo-builder`, minimal-superset variant resolution in `geo-browser`; replaced the earlier live client-side grid computation.
- Area grouping — `group`-based catalog filtering via `?group=`/`?debug=`; `"debug"` group is opt-in-only.
- Destination marker + bearing cone — fixed pin and live-position bearing cone toward a single global destination, pure client runtime.
- Categorized logging — `LogCategory` (`src/logging.ts`); `?debug` shows every category, a normal run shows only `"general"`; `?logCategory=a,b` as a manual override.

## Recommended Next Branches

### 3. Data Source Abstraction

Move direct fetch behind `GeoDataService`:

```ts
interface GeoDataService {
    getCatalog(): Promise<unknown>;
    getAreaDetail(areaId: string): Promise<unknown>;
    getLayerPayload(areaId: string, layerId: string): Promise<unknown>;
}
```

Implement:

- StaticDataService using fetch/static URLs.
- WebViewDataService using `window.geoHost` for design mode.

### 2. Design Mode Host Bridge

Add:

```text
src/host/ or src/runtime host service implementation
```

Keep Python out of geo-browser.

### 4. Richer Area Markers

`AreaMarkerView`'s `circle`/`outline` render kinds (see [Layer Lifecycle](../tasks/layer_lifecycle.md)) are still plain shapes — fixed-diameter unfilled circle, bbox rectangle outline.

Future:

- custom image markers
- labels
- LOD image choice
- area radius visualization

### 5. Preferred Tap-to-Jump Framing

`MapView.jumpToArea()` currently always fits the area's bbox exactly (`getBoundsZoom`). Consider extending `AreaDetail` with a manifest-provided preferred center/zoom instead:

```ts
interface AreaDetail {
    id: string;
    defaultView?: {
        center: [number, number];
        zoom: number;
    };
    layers: Layer[];
}
```

### 6. Production Cache Headers

Static hosting should use:

```text
/catalog.head.json         Cache-Control: no-store
/catalog.json              Cache-Control: no-store
/areas/**/manifest.json    Cache-Control: immutable if content-addressed/versioned
/areas/**/*.geojson        Cache-Control: immutable
/areas/**/images           Cache-Control: immutable
```

If `manifest.json` is mutable at a stable URL, do not mark immutable unless its URL is versioned.
