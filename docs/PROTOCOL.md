# geo-browser Protocol

## Rule

`protocols.ts` contains serializable data contracts only.

Allowed:

- interfaces representing JSON shapes
- simple type aliases for protocol values

Not allowed:

- classes
- functions
- runtime state
- view types
- service contracts
- lifecycle methods

Everything in `protocols.ts` should be JSON-serializable.

## Catalog HEAD

`catalog.head.json` is the mutable pointer:

```json
{
  "version": 1,
  "catalogUrl": "/catalogs/catalog.20260510T120000Z.json"
}
```

Rules:

```text
HEAD = mutable pointer / control plane
Catalog snapshots = immutable data/composition plane
```

Publishing order:

1. write all area assets
2. write immutable catalog snapshot
3. update `catalog.head.json` last

## Catalog

```ts
export interface Catalog {
    version: number;
    createdAt: string;
    areas: AreaSummary[];
}
```

Catalog is discovery only.

## AreaSummary

```ts
export interface AreaSummary {
    id: string;
    name: string;
    center: [number, number];
    radiusMeters: number;
    minRadiusPx: number;
    maxRadiusPx: number;
    liveMapRadiusPx: number;
    detailUrl: string;
    images: AreaImage[];
}
```

`manifestUrl` was old vocabulary. Prefer `detailUrl` if/when migrating.

AreaSummary must be self-sufficient for summary rendering. Summary mode should not need extra fetches.

## AreaImage

```ts
export interface AreaImage {
    sizePx: number;
    url: string;
}
```

Image selection is pixel-driven, not zoom-driven.

## AreaDetail

```ts
export interface AreaDetail {
    id: string;
    layers: Layer[];
}
```

Future likely addition:

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

## Layer

```ts
export interface Layer {
    id: string;
    type: string;
    url: string;
    visible: boolean;
    name?: string;
    style?: LayerStyle;
}
```

`visible` is manifest default only. Runtime visibility belongs to `DetailViewState`.

Supported current types:

```text
"points"
"heatmap"
```

## LayerStyle

```ts
export interface LayerStyle {
    color?: string;
    opacity?: number;
    radius?: number;
    radiusScale?: number;
    blur?: number;
    showPoints?: boolean;
}
```

Semantics:

```text
Point layer radius = marker size
Heat layer radius  = influence distance in pixels
blur               = heatmap smoothing
opacity            = layer opacity
color              = rendering hint / single-hue gradient
showPoints         = optional source-point overlay
```

## GeoJSON Input

Canonical input for layer payloads is GeoJSON.

Supported V1 subset:

```text
FeatureCollection
Point features
properties.weight optional
```

Example:

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": { "weight": 1.0 },
      "geometry": {
        "type": "Point",
        "coordinates": [14.2681, 40.8518]
      }
    }
  ]
}
```

Coordinate convention:

```text
GeoJSON = [longitude, latitude]
Leaflet = [latitude, longitude]
```

Default event weight:

```text
One raw event = weight 1.0
```

Heatmap density is accumulated by the heatmap engine.
