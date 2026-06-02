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

  maps/
    tileProvider.ts       (TileProvider interface, osmTileProvider, cartoTileProvider, active store)

  runtime/
    context.ts

  state/
    summaryViewState.ts
    detailViewState.ts
    geoState.ts           (GeoState interface + LastViewData)
    geoStateStore.ts

  view/
    summary/
      summaryView.ts
      bubbleWidget.ts
      bboxWidget.ts

    detail/
      detailView.ts
      layerView.ts
      pointLayerView.ts
      heatLayerView.ts
      poiLayerView.ts
      userLayerView.ts
      summaryWidget.ts
      layerSelectionWidget.ts
      geoLocationWidget.ts
      imageOverlayWidget.ts
      leafletFactories.ts

  contracts.ts
  protocols.ts
  logging.ts
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
- `getActiveTileProvider()` / `setActiveTileProvider()` — module-level store that persists the selected provider across map recreations (summary ↔ detail transitions)

`MapLayerFlyoutControl` in `leafletFactories.ts` is a Leaflet control at `topright` that manages the tile layer lifecycle and renders a flyout panel. The flyout shows a Map type section (CARTO / OSM) in both views, plus a Map Details layer list in detail view. Created via `WidgetFactory.createMapLayerFlyout()` — added by `SummaryView` and `LayerSelectionWidget`.

Zoom buttons are disabled (`zoomControl: false` in `createMap()`).

## Last View Persistence

`geo-browser.lastView` in localStorage stores `{ mode: "summary" | "detail", areaId?: string }` (`LastViewData` in `geoState.ts`). `Controller.start()` reads it after catalog load and reopens the last detail area if it still exists, otherwise falls back to summary. Saved in `openSummary()` and `openDetail()` before `switchView()`.

## DetailView

DetailView owns:

```text
Leaflet map handle
summary/back widget           (topright)
layer selection widget        (topright)
ImageOverlayWidget            (topright, only when image is active)
GeoLocationWidget             (bottomright, optional)
BboxWidget                    (optional, only when GatewayService is injected)
bbox highlight rectangle
Map<string, LayerView>
```

Map creation in `createMap()`:

1. Create Leaflet map via `MapFactory` (zoom control disabled).
2. `MapLayerFlyoutControl` added by `LayerSelectionWidget` after map creation — manages tile layer + flyout at `topright`.
3. `applyMaxBounds()` — computes padded bounds (half-bbox on each side), sets `maxBounds` with `maxBoundsViscosity: 1.0` (hard stop), computes `minZoom` from `getBoundsZoom(paddedBounds) - 1`.
4. `addBboxHighlight()` — draws a subtle rectangle over the area bbox.
5. Attach `onMoveEnd` → `saveViewport()`.
6. Attach `onZoom` → `onZoomChange()`.

Auto-navigate to summary:

```text
onZoomChange(zoom)
    if zoom <= minZoom:
        saveSummaryViewport(center, zoom)
        openSummary()
```

Layer reconciliation:

```text
for each GeoLayer:
    visible = state.isLayerVisible(layer.id)
    existing = layerViews.get(layer.id)

    if visible and no existing:
        create concrete LayerView

    if not visible and existing:
        destroy LayerView
```

Full cleanup happens in `destroy()` only.

## LayerView

`LayerView` is an abstract base class because concrete layer renderers share ownership/lifecycle.

Concrete classes:

- `PointLayerView`
- `HeatLayerView`
- `PoiLayerView`
- `UserLayerView`

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

## SummaryView

SummaryView uses Leaflet.

It owns:

```text
summary-view root
summary-map container
map handle
BubbleWidget[]
```

It creates BubbleWidgets for catalog areas.

Auto-navigate to detail:

```text
onZoomChange(zoom)
    if zoom < 11: return
    bounds = map.getBounds()
    area = findAreaInBounds(bounds, map.getCenter())
    if area:
        openDetail(area.id, center, zoom)
```

`findAreaInBounds` picks the area whose bbox intersects the current viewport, closest to the map center (by squared distance). If multiple areas are visible it picks the nearest one.

## BubbleWidget

BubbleWidget is Leaflet marker-based now.

It owns one clickable marker and emits:

```ts
ControllerActions.openDetail(areaId)
```

It should not load areas or make navigation decisions.

## GeoLocationWidget

`GeoLocationWidget` lives in `DetailView`.

It owns:

```text
GeoLocationWidgetHandle (follow-toggle button)
position marker (circle)
accuracy ring (circle, drawn before marker so marker renders on top)
```

Lifecycle:

- Created in `DetailView.render()` only when a `GeoLocationService` is injected.
- Passed the padded bounds computed in `applyMaxBounds()`.

Position handling:

```text
onPosition(position):
    if outside padded bounds:
        disable widget
        clear following
    else:
        enable widget
        update marker and accuracy ring
        if following: pan map to position
```

Out-of-bounds rule: the widget is disabled (greyed out, non-interactive) when the GPS
position is outside the padded area bounds. It re-enables automatically when the
position returns inside bounds. This prevents the "follow" mode from silently panning
the map off the visible area.

## LayerSelectionWidget

Layer selection widget owns ephemeral visual state for immediate feedback.

Controller/DetailViewState own durable truth.

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
new DetailView(root, actions, area, state, {
    mapFactory,
    layerFactory,
    widgetFactory,
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

.summary-view,
.summary-map,
.detail-view,
.detail-map {
    width: 100%;
    height: 100%;
}
```

Without this, Leaflet may create a blank map container.
