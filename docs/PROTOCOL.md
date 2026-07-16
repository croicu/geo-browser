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
  "catalogUrl": "/catalog.json"
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
    bbox: [number, number, number, number];  // [west, south, east, north]
    minRadiusPx: number;
    maxRadiusPx: number;
    liveMapRadiusPx: number;
    manifestUrl: string;
    images: AreaImage[];
    group?: string[];  // omitted/empty = ungrouped; "debug" is a convention, not a special type
}
```

AreaSummary must be self-sufficient for summary rendering. Summary mode should not need extra fetches.

`group` drives client-side area filtering in Summary via `?group=` / `?debug=` query params — see
`docs/MESSAGING.md` for the query-string contract and `Context.groupFilter`.

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
    url: string | null;
    visible: boolean;
    name?: string;
    style?: LayerStyle;
    acquisition?: LayerAcquisition;
}
```

`visible` is manifest default only. Runtime visibility belongs to `DetailViewState`.

Supported current types:

```text
"circle"    — circle markers
"heatmap"   — density heatmap
"__poi__"   — virtual; tappable POI markers derived from hasDetails features
"__user__"  — virtual; user trip points stored locally
```

## LayerStyle

```ts
export interface LayerStyle {
    type?: string;
    color?: string;
    opacity?: number;
    radius?: number;
    blur?: number;
    radiusScale?: number;
    minRadius?: number;
    maxRadius?: number;
    strokeColor?: string;
    strokeWidth?: number;
    enhancedColor?: string;
    outdoorColor?: string;
    highlightColor?: string;
    minZoom?: number;
}
```

Semantics:

```text
color          = rendering hint / single-hue gradient
opacity        = layer opacity
radius         = marker size (circle) or influence distance in pixels (heatmap)
blur           = heatmap smoothing
radiusScale    = scales rendered radius / heat weight
minRadius      = minimum rendered radius
maxRadius      = maximum rendered radius
strokeColor    = circle marker stroke color
strokeWidth    = circle marker stroke width
enhancedColor  = POI ring color for enriched markers (wikipedia/wikidata/stars)
outdoorColor   = POI ring color for outdoor seating markers
minZoom        = layer hidden below this zoom level
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
