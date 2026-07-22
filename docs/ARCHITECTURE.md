# geo-browser Architecture

## Overview

`geo-browser` is a catalog-driven, state-driven, static geographic visualization platform.

It runs as a browser app from static hosting and can later run inside a Python WebView host (`geo-builder`) in design mode.

## Core Architecture

```text
runtime/Context
    external world and services

app/Controller
    orchestration, transitions, durable state mutation

catalog/
    domain model and loading lifecycle

state/
    serializable UI state

view/
    Leaflet maps, widgets, layer rendering

protocols.ts
    serializable data contracts

contracts.ts
    behavioral/runtime contracts
```

## Data Hierarchy

```text
HEAD
  → Catalog
    → AreaSummary
      → AreaDetail
        → Layer
          → GeoJSON
```

Meaning:

```text
HEAD        = mutable pointer
Catalog     = discovery
AreaSummary = catalog-level area descriptor (id, bbox, center — enough to render circle/outline)
AreaDetail  = area manifest (layers, images) fetched once an area becomes resident
Layer       = renderer input metadata
GeoJSON     = actual data payload
```

`AreaSummary`/`AreaDetail` are protocol/data type names only (`protocols.ts`) — unrelated to the retired Summary/Detail UI-mode vocabulary below.

## Runtime Flow

```text
main.ts
  → Context.Instance
  → setLogger(context.logger)
  → resolve catalog URL / create GeoCatalog
  → Controller.start()

Controller
  → loads catalog
  → constructs MapView once (session-lifetime)
  → responds to widget intents (ControllerActions)
```

`Controller` no longer switches between two views — `MapView` is constructed exactly
once per session and never torn down until the app itself unloads. Full design:
[tasks/layer_lifecycle.md](../tasks/layer_lifecycle.md).

## UI Flow

One shared Leaflet map (`MapView`), driven entirely by `AreaLifecycleTracker`, a pure
state machine with no Leaflet/DOM dependency:

```text
MapView.render()
  → creates the one Leaflet map (session-lifetime)
  → registers onZoom/onMoveEnd → handleViewportChange()
  → creates one AreaMarkerView per catalog area (circle/outline)
  → creates session-level GeoLocationWidget / DestinationWidget / MapLayerFlyoutHandle

handleViewportChange()
  → AreaLifecycleTracker.recompute({ bounds, zoom })
  → returns a diff: renderKinds, toLoad, toShow, toHide, toDestroy, bundle action
  → MapView applies the diff mechanically:
      renderKinds  → AreaMarkerView.update(kind)     (circle/outline)
      toLoad       → loadBaseLayers(areaId)           (new AreaBaseLayerRenderer, async)
      toShow/toHide→ AreaBaseLayerRenderer.show()/hide()  (instant, Leaflet-only)
      toDestroy    → destroyBaseLayers(areaId)         (GeoLayer.invalidate(), deferred)
      bundle       → build/show/hide the singleton CurrentAreaBundle
```

Tapping a circle/outline marker (`AreaMarkerView.onSelected`) calls `MapView.jumpToArea()`,
which pans/zooms the shared map atomically (`MapHandle.setView`) to fit that area's bbox —
the same `handleViewportChange()` path then naturally promotes it through
outline → loaded → current, with no separate "open detail" code path.

## Render Kinds & Current Area

```text
circle  = bbox screen area < the area of a fixed 48px-diameter circle
outline = bbox big enough, but zoom < MIN_LOADED_ZOOM or not yet resident
loaded  = bbox big enough, zoom ≥ MIN_LOADED_ZOOM, and residency == "visible"
```

Any number of areas can be `loaded` concurrently — there is no exclusivity. Only one
area is ever "current" (nearest to viewport center among `loaded` candidates) and owns
the virtual-layer bundle (`CurrentAreaBundle`) and toolbox; losing current status does
not hide or destroy that area's base layers, it only detaches the bundle.

Full state table, the two-phase Hide/Destroy discard lifecycle, and the empty-viewport
fallback pin: [tasks/layer_lifecycle.md](../tasks/layer_lifecycle.md).

## Protocols vs Runtime Models

Protocol interfaces are raw serializable JSON contracts:

```ts
Catalog
AreaSummary
AreaDetail
Layer
AreaImage
LayerStyle
```

Runtime wrappers add lifecycle and caching:

```ts
GeoCatalog
GeoArea
GeoLayer
```

Rule:

```text
Protocol ≠ runtime model
```

Do not make `GeoCatalog implements Catalog`.

## Controller Model

The project uses a unidirectional flow:

```text
View/Widget emits intent
→ Controller handles behavior
→ Controller mutates State and/or loads Model
→ View re-renders from State + Model
```

Controller may call:

```ts
view.create();
view.render();
view.destroy();
```

Controller must not call semantic view methods like:

```ts
showLayer(...)
selectArea(...)
zoomToArea(...)
```

## Views and Widgets

`View` lifecycle:

```ts
interface View {
    create(): void;
    render(): void;
    destroy(): void;
}
```

`Widget` lifecycle:

```ts
interface Widget {
    render(): void;
    destroy(): void;
}
```

`render()` may lazily create internal objects, but must be idempotent.

Rules:

- Views own DOM/map/widget composition.
- Widgets own their own rendered control/marker.
- Widgets emit intent only.
- Only Controller switches views.
- Views never replace themselves.

## Leaflet Isolation

Critical invariant:

```text
Only view/detail/leafletFactories.ts imports Leaflet and Leaflet plugins.
```

Everything else depends on renderer contracts:

```ts
MapFactory
LayerFactory
WidgetFactory
MapHandle
MapLayerHandle
ClickableMapLayerHandle
WidgetHandle
```

This preserves:

- offline tests
- renderer portability
- clean dependency boundaries

## Layer Rendering

Base (manifest-declared) layers and virtual layers have different owners and different
lifetimes now that any number of areas can be concurrently resident:

```text
AreaBaseLayerRenderer  — one instance per resident area, owns Map<string, LayerView>
                         for that area's "circle"/"heatmap" layers only
CurrentAreaBundle      — 0-or-1 instance (singleton, the current area only), owns the
                         virtual layers (__poi__/__user__/__void__/__search__) + toolbox
```

`LayerView` owns one logical rendered layer. Concrete subclasses:

```text
PointLayerView
HeatLayerView
```

Layer type mapping:

```text
"circle"  → PointLayerView
"heatmap" → HeatLayerView
```

## Incremental Reconciliation

`AreaBaseLayerRenderer.sync()` reconciles desired state with existing runtime views for
its one area, same shape as before:

```text
visible && !existing → create LayerView
!visible && existing → destroy LayerView
```

Distinct from this manual-toggle reconciliation is the viewport-residency
Hide/Show/Destroy lifecycle (`AreaLifecycleTracker`, see Render Kinds & Current Area
above) — Hide/Show never rebuild a `LayerView`, they only detach/reattach it.

## Visibility Ownership

Manifest layer visibility is only an initial/default value.

Runtime visibility belongs to:

```text
AreaViewState.visibleLayers
```

Rule:

```text
GeoLayer does not own UI visibility.
```

## Runtime Context

`Context` is the process-wide external-world boundary.

It centralizes:

```text
window.location / query parsing
fetch/data access
localStorage
logger
host bridge
runtime mode
```

No other module should directly access browser globals unless explicitly part of a renderer factory.

Context must not contain application state.

## Design Mode

`geo-browser` will be reused by `geo-builder` through a WebView host bridge.

```text
geo-browser
  ↕ GeoDataService / HostService / window.geoHost
geo-builder
```

Browse mode uses static JSON/GeoJSON assets.
Design mode uses Python-hosted APIs.

Controllers and views should not care which data source is active.
