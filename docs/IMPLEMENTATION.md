# geo-browser Implementation Notes

## Current Directory Shape

```text
src/
  app/
    controller.ts

  catalog/
    catalog.ts
    area.ts
    layer.ts
    loader.ts
    groupFilter.ts

  designer/
    gateway.ts

  maps/
    tileProvider.ts       (TileProvider interface, osmTileProvider, cartoTileProvider, active store)
    nominatim.ts           (Nominatim search client, __search__ layer's data source)

  runtime/
    context.ts
    browserGeoLocationService.ts
    browserHeadingService.ts   (DeviceOrientationEvent wrapper — see GeoLocationWidget below)
    userPointsStore.ts     (LocalStorageUserPointsStore, GatewayUserPointsStore)
    destinationStore.ts    (LocalStorageDestinationStore — see tasks/destination_marker.md)
    localStorageService.ts
    storageGuard.ts
    webViewHostService.ts

  state/
    mapViewState.ts        (shared map center/zoom)
    areaViewState.ts       (per-area visibleLayers)
    geoState.ts            (GeoState interface)
    geoStateStore.ts

  geo/
    mercator.ts             (metersPerPixel, bboxPixelSize, boundsIntersectBbox — see areaRenderClassifier/areaLifecycleTracker)
    bearing.ts               (great-circle initial bearing — see destinationWidget)

  vision/
    blueDotDetector.ts     (canvas pixel scan for GPS-dot auto-alignment; see tasks/blue_dot_detection.md)

  view/
    statusWidget.ts

    map/                    (unified map — see tasks/layer_lifecycle.md)
      mapView.ts
      areaLifecycleTracker.ts     (pure state machine — no Leaflet/DOM)
      areaRenderClassifier.ts     (bbox-area-vs-fixed-circle + MIN_LOADED_ZOOM checks)
      currentAreaSelector.ts
      areaMarkerView.ts           (circle/outline render kinds, successor of BubbleWidget)
      areaBaseLayerRenderer.ts    (base points/heatmap layers, one per resident area)

    summary/
      bboxWidget.ts          (design-mode bbox edit widget, current area only)
      drawAreaInteraction.ts (design-mode "draw new area" drag interaction)

    detail/
      currentAreaBundle.ts   (renamed/slimmed from detailView.ts — singleton virtual-layer bundle + toolbox)
      layerView.ts
      pointLayerView.ts
      heatLayerView.ts
      poiLayerView.ts
      userLayerView.ts
      voidLayerView.ts
      voidVariantResolver.ts
      searchLayerView.ts
      starRatingControl.ts
      emptyCalloutWidget.ts
      twoTapState.ts
      layerSelectionWidget.ts
      geoLocationWidget.ts
      destinationWidget.ts
      imageOverlayWidget.ts
      manifestEditorWidget.ts    (design mode only — see tasks/... manifest editor)
      codeMirrorJsonEditorFactory.ts
      jsonColorPicker.ts
      leafletFactories.ts

  contracts.ts
  protocols.ts
  api.ts                 (Gateway wire protocol — mirrors geo-builder's api.py, see docs/MESSAGING.md)
  logging.ts              (Logger, DefaultLogger, LogCategory)
  services.ts
  errors.ts
  validate.ts
  geoHelpers.ts
```

## main.ts Responsibility

`main.ts` is the composition root.

It should:

- create/access `Context.Instance`
- bridge logger to legacy `services.ts` if still needed by `fail()`
- create catalog/controller
- call `controller.start()`

It should not contain business logic or environment policy beyond composition.

## Context

`Context` is a singleton:

```ts
const context = Context.Instance;
```

It currently parses runtime flags:

```text
?design=1 → mode = "design"
?debug=1  → debug = true
empty values are ignored
```

Tests reset it:

```ts
Context.resetForTest();
```

Recommended setup:

```ts
import { afterEach } from "vitest";
import { Context } from "../src/runtime/context";

transportAfterEach(() => {
    Context.resetForTest();
});
```

Use the correct Vitest import in the actual file:

```ts
import { afterEach } from "vitest";
```

## Error Handling

Use `fail()` for application failures:

```ts
fail("layer.not_loaded", "Layer has not been loaded.", undefined, {
    layerId: this.id,
});
```

`fail()` creates an `AppError`, logs it, and throws.

Current signature:

```ts
fail(
    code: string,
    message: string,
    cause?: unknown,
    props?: Record<string, unknown>
): never
```

Do not throw raw `Error` for app-level failures.

## Catalog Loading

`GeoArea.load()` loads only:

```text
AreaDetail manifest
Layer metadata
```

It does not load GeoJSON payloads.

`GeoLayer.load()` loads the immutable layer payload.

Rule:

```text
AreaDetail = composition
GeoJSON    = data
```

## GeoLayer

`GeoLayer` owns:

- immutable layer metadata
- immutable payload cache

It should not become renderer-aware.

Do not add renderer interpretation methods like:

```ts
features()
points()
renderHints()
```

Interpretation belongs in `LayerView` subclasses.

## Tile Provider

`src/maps/tileProvider.ts` is the single file for tile configuration. It contains:

- `TileProvider` interface (`urlTemplate`, `maxZoom`, `attribution`, optional `subdomains`)
- `osmTileProvider` constant — standard OpenStreetMap tiles, uses `dark-osm` CSS filter
- `cartoTileProvider` constant — CARTO Voyager (default), subdomains `abcd`
- `getActiveTileProvider()` / `setActiveTileProvider()` — module-level store for the selected provider; there's only ever one map now, so this mainly matters across a full page reload (it is not itself localStorage-backed, so it does not survive a reload — only in-memory recreation)

`MapLayerFlyoutControl` in `leafletFactories.ts` is a Leaflet control at `topright`, created once by `MapView.render()` and kept for the whole session (recreating it would tear down and rebuild the tile layer it owns). It manages the tile layer lifecycle and renders a flyout panel. The flyout shows a Map type section (CARTO / OSM) always; a Map Details layer list is added only while a current area exists, via `MapLayerFlyoutHandle.setLayers()` (content swap, not control recreation) — see `LayerSelectionWidget`.

Zoom buttons are disabled (`zoomControl: false` in `createMap()`).

## Viewport & Per-Area State Persistence

No more "last view"/mode to restore — see CLAUDE.md's "Viewport & Per-Area State Persistence" section for the current `MapViewState`/`AreaViewState` persistence (`geo-browser.mapViewState`, `geo-browser.areaViewState.<areaId>`).

## MapView

`MapView` (`view/map/mapView.ts`) is the session-lifetime orchestrator. It owns:

```text
Leaflet map handle (created once, never destroyed until MapView.destroy())
AreaLifecycleTracker              (pure state machine — see tasks/layer_lifecycle.md)
Map<string, AreaMarkerView>       (one per catalog area — circle/outline)
Map<string, AreaBaseLayerRenderer> (one per resident area — base points/heatmap)
0-or-1 CurrentAreaBundle          (singleton — virtual layers + toolbox for the current area)
MapLayerFlyoutHandle              (persistent, topright)
GeoLocationWidget, DestinationWidget (session-level, bottomright/destination-pane)
DesignToolbarControl              (topleft, gateway-gated design mode only)
```

Map creation in `render()`:

1. Create the Leaflet map via `MapFactory` (zoom control disabled).
2. Attach `onMoveEnd`/`onZoom` → `handleViewportChange()`.
3. Create one `AreaMarkerView` per catalog area, registering each with `AreaLifecycleTracker`.
4. Create the persistent `MapLayerFlyoutHandle`.
5. If a gateway is injected (design mode), create `DesignToolbarControl`.
6. If a geolocation service is injected, create `GeoLocationWidget`.
7. Create `DestinationWidget`, wired to `GeoLocationWidget.onPositionUpdate`.
8. Run one initial `handleViewportChange()` to seed render kinds/residency.

There is no more per-area `maxBounds`/hard pan-zoom restriction, no auto-navigate
zoom threshold, and no `switchView()` — every area's own on-screen size and the shared
zoom decide its render kind independently on every `handleViewportChange()`
(`AreaLifecycleTracker.recompute()`; see CLAUDE.md's Unified Map / Render Kinds &
Current Area sections and [tasks/layer_lifecycle.md](../tasks/layer_lifecycle.md)).

Base-layer reconciliation for one resident area (`AreaBaseLayerRenderer.sync()`):

```text
for each GeoLayer in that area:
    visible = state.isLayerVisible(layer.id) && zoom >= (layer.style.minZoom ?? -Infinity)
    existing = layerViews.get(layer.id)

    if visible and no existing:
        create concrete LayerView

    if not visible and existing:
        destroy LayerView
```

Full cleanup for one area happens in `AreaBaseLayerRenderer.destroy()`
(`GeoLayer.invalidate()` on every layer, including virtual ones) — only ever triggered
as a side effect of a genuinely new area's `toLoad`, never merely on losing current
status.

## LayerView

`LayerView` is an abstract base class because concrete layer renderers share ownership/lifecycle.

Concrete classes:

- `PointLayerView`
- `HeatLayerView`
- `PoiLayerView`
- `UserLayerView`
- `VoidLayerView`

`SearchLayerView` does **not** extend `LayerView` — it's a standalone class with a single ephemeral marker and no fetch/reconciliation lifecycle to share.

Shared helpers should be protected methods when semantically owned by LayerView.

## HeatLayerView

Heatmaps use `leaflet.heat` through `LayerFactory.createHeatLayer(...)`.

Do not import `leaflet.heat` outside `leafletFactories.ts`.

`style.radius` means heat influence radius in pixels.
`style.blur` means heat edge smoothing.
`style.opacity` means heat layer transparency.
`style.color` means single-hue gradient.

`style.showPoints` may render a source point overlay for debugging/alignment.

## PoiLayerView

POI markers derive from `hasDetails: true` features in existing layers at render time.

Each feature is a `PoiBakedFeature`. Features with `wikipedia`, `wikidata`, `stars`, or `outdoor_seating="yes"` are "enhanced" and receive a ring marker.

**Ring marker pattern**: `.poi-marker` uses `stroke: rgba(0,0,0,0); stroke-width: 40px` (CSS) to create a transparent wide touch hit area, which overrides Leaflet's SVG `stroke` attribute. Enhanced markers therefore get a second SVG element — `poi-ring-marker` (`pointer-events: none`) — whose stroke is not overridden by CSS.

Ring colors: `enhancedColor` from layer style (default `#20b7dd`) for general enrichment; `outdoorColor` (default `#f5c518`) for outdoor seating.

Popup lazy loads a Wikidata thumbnail image via `wbgetentities` P18 claim → Wikimedia Commons `Special:FilePath?width=200`. Wikipedia link routes through `Special:GoToLinkedPage/enwiki/{Q-id}` for the English article.

Popup action row (star/bookmark) is built by `buildPoiBottomRow` and is shared visually with `EmptyCalloutWidget` — see **UserLayerView** below for the full creation/deletion flow it drives.

## VoidLayerView

Thin fetch-and-render of a precomputed GeoJSON polygon — no client-side geometry computation. Which manifest `__void__*` entry to render is decided by `VoidVariantResolver` (minimal-superset search over currently-visible non-virtual layer ids; see `docs/LAYERS.md` for the full algorithm and naming convention).

Renders into a dedicated `void-pane` Leaflet pane with a CSS `blur(5px)` on the pane's SVG element (applied to the SVG child, not the zero-size pane div — a filter on the pane div clips the overflowing SVG entirely). `CurrentAreaBundle` synthesizes exactly one "Mundane" toggle in the layer flyout regardless of how many `__void__*` variants exist in the manifest.

## SearchLayerView

Renders the single ephemeral marker for the active Nominatim search result (`src/maps/nominatim.ts` is the query client). No persistence — the marker is destroyed/replaced on each new search and cleared when the search UI closes. Tapping the marker promotes it to a permanent `__user__` point via the same creation path as `UserLayerView.addMarker`.

## UserLayerView

Owns `__user__` trip-point markers. Points are always created through `EmptyCalloutWidget`'s action row (star rating and/or bookmark toggle) — there is no gesture that drops an unrated, unbookmarked point. Long-press/right-click creation and instant right-click delete were removed; see [Explicit Point Delete](../tasks/explicit_point_delete.md).

- **Rings**: a bookmark ring (`bookmarkColor`, default `#5AB5DA`) and a star-rating ring (`highlightColor` run through an atan color curve, see `starRatingControl.ts`) are mutually exclusive on the same marker — bookmark takes visual priority; `addMarkerBookmark`/`addMarkerRing` in `userLayerView.ts` enforce this.
- **Deletion**: tapping an existing marker reopens `EmptyCalloutWidget` with a delete button (`onDeleteRequested`) in place of the bookmark toggle.
- **Persistence**: `UserPointsStore` (DI) — `LocalStorageUserPointsStore` in browse mode, `GatewayUserPointsStore` in design mode (`runtime/userPointsStore.ts`). `UserPointsStore.setBookmarked` is declared but currently unused — bookmark state is only ever written as part of `addPoint`'s initial properties, never patched onto an existing point.

## AreaMarkerView

Successor of `BubbleWidget` — one instance per catalog area, created eagerly by `MapView.createMarker()` for every area in the catalog (not just resident ones). Renders exactly one of `{circle, outline, nothing}` per `MapView.render(kind)` call, driven by `AreaLifecycleTracker`'s render kind for that area (`AreaRenderKind`, see CLAUDE.md's Render Kinds & Current Area). `loaded` renders nothing here — `AreaBaseLayerRenderer` takes over the visual space once real data is shown.

```text
circle:  fixed 48px-diameter unfilled circumference, never rescaled on zoom
outline: L.rectangle over the area bbox, no fill, same stroke color as the circle
```

Both are tappable (`onSelected` callback → `MapView.jumpToArea()`, tap-to-jump): tapping pans/zooms the shared map to fit that area's bbox, letting `AreaLifecycleTracker` naturally promote it through outline → loaded → current on the next `handleViewportChange()` — there is no separate "open detail" method to call.

## AreaLifecycleTracker & CurrentAreaSelector

`AreaLifecycleTracker` (`view/map/areaLifecycleTracker.ts`) is the pure state machine behind every rendering/residency/current-area decision — no Leaflet, no `GeoArea`/`GeoLayer` references, only plain `{id, bbox, center}` tuples in and a diff out via `recompute(viewport)`. `CurrentAreaSelector.selectNearest()` (`currentAreaSelector.ts`) picks the nearest-to-viewport-center candidate among intersecting, resident areas — reused both for "which loaded area is current" and for the empty-viewport fallback pin. Full design, state table, and the two-phase Hide/Destroy discard lifecycle: [tasks/layer_lifecycle.md](../tasks/layer_lifecycle.md).

## GeoLocationWidget

`GeoLocationWidget` lives in `MapView` now — a session-level singleton, not scoped to any one area.

It owns:

```text
GeoLocationWidgetHandle (follow-toggle button)
position marker (circle)
accuracy ring (circle, drawn before marker so marker renders on top)
```

Lifecycle:

- Created in `MapView.render()` only when a `GeoLocationService` is injected.
- No bounds gate is passed (`undefined`) — the old per-area padded-bbox gate that disabled the widget outside the current area's bounds was dropped when the map stopped being scoped to one area at a time. Confirmed, intentional behavior change: see [tasks/layer_lifecycle.md](../tasks/layer_lifecycle.md)'s Confirmed Behavior Changes.

Position handling:

```text
onPosition(position):
    update marker and accuracy ring
    if following: pan map to position
```

The out-of-bounds disable/re-enable behavior described in older revisions of this doc no longer applies — the widget is always available regardless of which area (if any) is current.

## LayerSelectionWidget

Layer selection widget owns ephemeral visual state for immediate feedback.

`Controller`/`AreaViewState` own durable truth.

Single tap directly toggles layer visibility — no two-tap expand behavior.

Rule:

```text
Widget may temporarily mirror expected state,
but render() from controller/state must always converge it.
```

## Renderer Factories

`leafletFactories.ts` contains:

- all `L.*` usage
- all Leaflet type casting
- all Leaflet plugin integration
- all custom Leaflet controls

This is the only file allowed to import Leaflet and Leaflet plugins.

## Accessor vs. Backing Field

Always use the public accessor (`this.foo`) rather than the backing field (`this._foo`), even inside the same class. Accessors are the stable API surface; backing fields are an implementation detail that may change.

```ts
// Bad
if (this._debug || this._mode === "design") { ... }

// Good
if (this.debug || this.mode === "design") { ... }
```

## Services and Options Objects

When constructor DI grows, use options objects:

```ts
new MapView(root, actions, geoState, catalog, state, {
    mapFactory,
    layerFactory,
    widgetFactory,
    userPointsStore,
    destinationStore,
});
```

Avoid fragile positional constructor drift.

Views may own default service implementations, while tests inject stubs.

## CSS Notes

Leaflet requires explicit height ownership:

```css
html,
body,
#app {
    width: 100%;
    height: 100%;
    margin: 0;
}

.map-view,
.shared-map {
    width: 100%;
    height: 100%;
}
```

Without this, Leaflet may create a blank map container — this bit the layer_lifecycle
cutover once: renaming `.summary-view`/`.summary-map`/`.detail-view`/`.detail-map` to
`.map-view`/`.shared-map` needs a CSS grep pass, not just a code grep pass.
