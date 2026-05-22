# Roadmap

## Current Completed Foundation

- Static catalog discovery with HEAD pointer.
- Catalog/area/layer runtime wrappers.
- Summary Leaflet map with area bubbles/markers.
- Detail Leaflet map.
- LayerView rendering pipeline.
- Point rendering from GeoJSON.
- Heatmap rendering through `leaflet.heat`.
- Optional point overlay for heatmap debugging.
- Layer selection widget with incremental reconciliation.
- Back-to-summary Leaflet widget.
- Runtime Context skeleton.
- Offline unit test strategy.
- Detail map click logging (GPS coordinates logged on tap).
- Viewport synchronization — moveend/zoomend → state → persist/restore across navigation and reload.
- Geolocation service — blue dot, accuracy ring, follow toggle, disable outside area bounds.
- Area bounds restriction — hard pan/zoom limit in detail view with padded maxBounds and dynamic minZoom.
- Bbox highlight rectangle — subtle fill overlay showing area extent on detail map.
- Auto-navigate summary → detail — zoom past threshold (≥ 11) with area bbox on screen opens detail.
- Auto-navigate detail → summary — zoom out past minZoom returns to summary, preserving map center.

## Recommended Next Branches

### 1. POI Heat Layer (`poi-heat`)

New layer type combining heatmap density with tappable POI markers from a single GeoJSON file. Full plan of record in `docs/POI_LAYER.md`.

- All points contribute to heat.
- `hasDetails: true` features render as prominent interactive circle markers on top.
- Popup shows baked name, cuisine, address, phone, website, opening hours.
- Review links (Foursquare, Google Maps) computed at render time from `name + lat/lng`.
- `protocols.ts` needs a new feature properties shape for `poi-heat` — coordinate with geo-builder before emitting data.

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

### 4. Better Summary Markers

Current BubbleWidget uses simple circle markers.

Future:

- custom image markers
- labels
- LOD image choice
- area radius visualization

### 5. Area Detail Default View

Consider extending `AreaDetail`:

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
/catalogs/catalog.*.json   Cache-Control: immutable
/areas/**/manifest.json    Cache-Control: immutable if content-addressed/versioned
/areas/**/*.geojson        Cache-Control: immutable
/areas/**/images           Cache-Control: immutable
```

If `manifest.json` is mutable at a stable URL, do not mark immutable unless its URL is versioned.
