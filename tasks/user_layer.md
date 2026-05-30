# User Layer

## Status: Brainstorm

## Problem statement

End users add points during a trip from the browser. Those points need to be persisted in a dedicated layer.
The user GeoJSON will be provided by a dedicated service which will be wired to the builder-exposed APIs during design phase and to localStorage during standalone execution. In the future the storage might be implemented through a Cloudflare Worker, so access to the points is in bulk.

---

## Design decisions

### Layer identity
- Type: `__user__`
- Layer id: `__user__`

### Layer presence
Always present in manifest. `url` is always `null`.

### Point schema
No per-point id. Properties:
```json
{
  "type": "Feature",
  "geometry": { "type": "Point", "coordinates": [lon, lat] },
  "properties": {
    "timestamp": "<ISO 8601 string>",
    "pressure": 0.6,
    "name": "optional label or null"
  }
}
```
`pressure` is a float 0.0–1.0 (0 = light tap, 1 = maximum force). Geo-builder stores it verbatim; rendering decisions are entirely the browser's concern. `name` is optional — stored as-is; null means unnamed. No deletion.

### Capture gesture
- **Mobile**: long press on the map in detail view. Image overlay mode takes over long press when active — user point capture is suppressed in that mode.
- **Desktop**: right-click on the map, direct action (no context menu).

### Rendering
- Circle markers derived from the features in the layer's in-memory GeoJSON.
- Color: base hue/saturation from `style.color`. Pressure maps to HSL lightness — pressure 0 → L ~85% (washed out), pressure 1 → L ~45% (base). Computed at render time; not stored.
- Points should be subtle and not overwhelm other map features.

### Incremental rendering
On `AddUserPoint` success, push the new feature into the layer's in-memory GeoJSON and call `layer.addLayer(newMarker)` — no full layer re-render. The `__user__` layer's in-memory state is mutable, unlike other GeoLayers that are fetched once and cached.

### Toolbar / visibility
- `GetUserPoints` returns empty FeatureCollection on load → layer absent from toolbar entirely.
- First point appears (load or in-session add) → layer entry appears in toolbar, default visible.
- User toggle is persisted in `DetailViewState.visibleLayers` (localStorage) under key `"__user__"`, same mechanism as all other layers.

### Standalone mode (no builder)
- `GetUserPoints` reads from localStorage.
- `AddUserPoint` writes to localStorage, returns success immediately.
- No `AreaChanged` round-trip needed — new point is added directly to the rendered layer.
- Compatible with a future Cloudflare Worker backend (bulk access contract is already the shape).

### New API endpoints
See `docs/MESSAGING.md` — `GetUserPoints` and `AddUserPoint` are fully specified there.

### New protocols
- `protocols.py` (geo-builder): add `UserStyle` dataclass (color, opacity, radius, minZoom).
- No `UserTask` or `UserWorker` needed.
