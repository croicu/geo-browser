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

  runtime/
    context.ts

  state/
    summaryViewState.ts
    detailViewState.ts

  view/
    summary/
      summaryView.ts
      bubbleWidget.ts

    detail/
      detailView.ts
      layerView.ts
      pointLayerView.ts
      heatLayerView.ts
      summaryWidget.ts
      layerSelectionWidget.ts
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

## DetailView

DetailView owns:

```text
Leaflet map handle
summary/back widget
layer selection widget
Map<string, LayerView>
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

Shared helpers should be protected methods when semantically owned by LayerView.

## HeatLayerView

Heatmaps use `leaflet.heat` through `LayerFactory.createHeatLayer(...)`.

Do not import `leaflet.heat` outside `leafletFactories.ts`.

`style.radius` means heat influence radius in pixels.
`style.blur` means heat edge smoothing.
`style.opacity` means heat layer transparency.
`style.color` means single-hue gradient.

`style.showPoints` may render a source point overlay for debugging/alignment.

## SummaryView

SummaryView now uses Leaflet.

It owns:

```text
summary-view root
summary-map container
map handle
BubbleWidget[]
```

It creates BubbleWidgets for catalog areas.

## BubbleWidget

BubbleWidget is Leaflet marker-based now.

It owns one clickable marker and emits:

```ts
ControllerActions.openDetail(areaId)
```

It should not load areas or make navigation decisions.

## LayerSelectionWidget

Layer selection widget owns ephemeral visual state for immediate feedback.

Controller/DetailViewState own durable truth.

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
