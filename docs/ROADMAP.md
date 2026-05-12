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

## Recommended Next Branches

### 1. Detail Map Click Logging

Goal:

```text
Click detail map
→ get GPS coordinates
→ log coordinates
```

Keep through renderer abstraction:

```ts
interface MapClickEvent {
    lat: number;
    lng: number;
}

interface MapHandle {
    remove(): void;
    onClick(handler: (event: MapClickEvent) => void): void;
}
```

Log through `Context.logger` or current logger service bridge.

### 2. Viewport Synchronization

Goal:

```text
Leaflet moveend / zoomend
→ update SummaryViewState / DetailViewState
→ persist
→ restore after navigation/reload
```

Do summary and detail separately if needed.

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

### 4. Design Mode Host Bridge

Add:

```text
src/host/ or src/runtime host service implementation
```

Keep Python out of geo-browser.

### 5. Better Summary Markers

Current BubbleWidget uses simple circle markers.

Future:

- custom image markers
- labels
- LOD image choice
- area radius visualization

### 6. Area Detail Default View

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

### 7. Geolocation Service

Goal:

```text
User grants browser geolocation permission
→ GeoLocationService resolves current position
→ "Center on my location" widget appears bottom-right of map
→ clicking it pans the map to current position
```

Design notes:

- `GeoLocationService` is a pluggable seam in `contracts.ts` — production wraps `navigator.geolocation`, tests inject a stub.
- Service exposes availability as a first-class concept; widget only renders when geolocation is supported and permission has not been denied.
- Widget lives in `DetailView` and `SummaryView` independently (both maps may want it).
- Keep widget creation/teardown inside the view lifecycle, consistent with existing widget ownership pattern.

```ts
interface GeoLocationService {
    isAvailable(): boolean;
    getCurrentPosition(): Promise<[number, number]>;
}
```

### 8. Production Cache Headers

Static hosting should use:

```text
/catalog.head.json         Cache-Control: no-store
/catalogs/catalog.*.json   Cache-Control: immutable
/areas/**/manifest.json    Cache-Control: immutable if content-addressed/versioned
/areas/**/*.geojson        Cache-Control: immutable
/areas/**/images           Cache-Control: immutable
```

If `manifest.json` is mutable at a stable URL, do not mark immutable unless its URL is versioned.
