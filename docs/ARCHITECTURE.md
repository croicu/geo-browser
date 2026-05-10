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
AreaSummary = summary/discovery UI model
AreaDetail  = detail composition
Layer       = renderer input metadata
GeoJSON     = actual data payload
```

## Runtime Flow

```text
main.ts
  → Context.Instance
  → setLogger(context.logger)
  → resolve catalog URL / create GeoCatalog
  → Controller.start()

Controller
  → loads catalog
  → creates SummaryView
  → responds to widget intents
  → switches to DetailView
```

## UI Flow

```text
SummaryView
  → Leaflet map
  → BubbleWidget[]
  → click bubble
  → ControllerActions.openDetail(areaId)

Controller
  → GeoArea.load()
  → switchView(DetailView)

DetailView
  → Leaflet map
  → widgets
  → LayerView reconciliation
```

## Summary vs Detail

```text
Summary = discovery/world overview
Detail  = selected-area immersive rendering
```

Both are Leaflet-backed.

The important split is not SVG vs Leaflet. The split is:

```text
Summary = cheap discovery
Detail  = heavier layer rendering
```

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

DetailView owns:

```text
map
widgets
Map<string, LayerView>
```

LayerView owns one logical rendered layer.

Concrete subclasses:

```text
PointLayerView
HeatLayerView
```

Layer type mapping:

```text
"points"  → PointLayerView
"heatmap" → HeatLayerView
```

## Incremental Reconciliation

DetailView renders layers by reconciling desired state with existing runtime views:

```text
visible && !existing → create LayerView
!visible && existing → destroy LayerView
```

Important distinction:

```text
switchView() = mode transition
render()     = state refresh / reconciliation
```

## Visibility Ownership

Manifest layer visibility is only an initial/default value.

Runtime visibility belongs to:

```text
DetailViewState.visibleLayers
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
