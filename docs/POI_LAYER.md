# POI Layer — Plan of Record

## Goal

Surface point-of-interest details (name, hours, cuisine, etc.) for relevant map points without any runtime API calls, so the feature works fully offline.

## Build-time (geo-builder)

- Query Overpass API for all POIs in the area.
- For each POI, extract: `name`, `cuisine`, `address`, `phone`, `website`, `opening_hours`.
- Bake `hasDetails: true` plus the detail fields into the **existing heatmap layer GeoJSON** alongside the regular weight-only points.
- Regular (non-enriched) points carry only `weight`; enriched points carry `weight` + details.

### GeoJSON shape (embedded in existing layer)

Enriched feature:

```json
{
  "type": "Feature",
  "properties": {
    "weight": 1.0,
    "hasDetails": true,
    "name": "Bar Ristorante Gaetano",
    "cuisine": "italian",
    "address": "Via Roma 42, Naples",
    "phone": "+39 081 234 5678",
    "website": "https://example.com",
    "opening_hours": "Mo-Su 12:00-23:00"
  },
  "geometry": { "type": "Point", "coordinates": [14.267789, 40.853179] }
}
```

Regular point (no details):

```json
{
  "type": "Feature",
  "properties": { "weight": 1.0 },
  "geometry": { "type": "Point", "coordinates": [14.267789, 40.853179] }
}
```

**Not** baked: review/search links (Foursquare, Google Maps). Computed at render time from `name` + coordinates to avoid GeoJSON bloat and insulate against URL schema changes.

### Conditional manifest entry

The `poi-heat` layer has **no GeoJSON URL** — it is a virtual layer derived at runtime from the existing layers. The builder adds a `poi-heat` manifest entry only when at least one enriched POI was found. The presence of the entry is the signal to the browser that POI data exists.

If the Overpass query yields no enrichable POIs, the builder omits the manifest entry entirely. The browser sees no `poi-heat` layer and shows nothing — no empty widget, no error.

## Runtime (geo-browser)

### Layer type

`poi-heat` is a virtual layer type with no associated GeoJSON URL. When the browser encounters it in the manifest, it:

1. Waits for the other layers in the area to finish loading.
2. Scans all loaded features across those layers for `hasDetails: true`.
3. Renders those features as interactive circle markers on top of the existing heat.

The heatmap layer already renders all points as heat — including the enriched ones. The `poi-heat` layer adds only the interactive marker pass on top. No data is fetched twice, no file is duplicated.

### Interaction

- Only `hasDetails` markers are tappable.
- Tap → popup showing: name, cuisine, address, phone, website, opening hours.
- Popup includes search links computed at render time:

```typescript
const foursquareUrl = `https://foursquare.com/search?query=${encodeURIComponent(name)}&near=${lat},${lng}`;
const googleUrl = `https://www.google.com/maps/search/${encodeURIComponent(name)}/@${lat},${lng},15z`;
// Yelp requires a text location — use address city, not raw coordinates.
```

### Protocol change

`protocols.ts` `Layer` type needs to accommodate a URL-less `poi-heat` entry. The feature properties shape (`hasDetails`, `name`, `cuisine`, etc.) lives in the existing layer's GeoJSON — no new payload type needed, but the browser's GeoJSON parsing must tolerate and forward these extra fields. Agree the shape between geo-builder and geo-browser before the builder emits it.

## Decisions log

| Decision | Rationale |
|---|---|
| Build-time baking | Zero runtime latency; works offline; no API keys in the PWA |
| `hasDetails` embedded in existing layer GeoJSON | No separate file, no data duplication — enriched points already contribute to the heatmap |
| `poi-heat` is a virtual layer (no URL) | Derived at runtime by filtering loaded features; manifest entry is the only signal needed |
| No `reviews` in GeoJSON | Computed at render time — smaller files, no rebuild needed on URL schema changes |
| Yelp uses text location | Yelp `find_loc` does not accept raw coordinates reliably |
| Builder emits manifest entry conditionally | Only when enriched POIs exist — presence signals browser to show the layer widget |
