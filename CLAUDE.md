# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

For implementation-level rules and patterns, see [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md).

## Project

`geo-browser` is a static, browser-based geographic renderer and UI shell.

It renders catalog-driven geographic experiences from static JSON/GeoJSON assets and can also run in a future design mode hosted by `geo-builder` through a WebView bridge.

## Commands

```bash
npm run dev       # Vite dev server at http://localhost:5173
npm run build     # tsc + vite build → dist/
npm run preview   # Preview dist/ locally
npm test          # Vitest watch mode
npm run test:run  # Vitest single run (CI)
```

Run a single test file:

```bash
npx vitest run tests/unit/catalog.test.ts
```

## Current Product Shape

The app has two UI modes:

- **Summary**: discovery/world overview using Leaflet, displaying one bubble/marker per learned area.
- **Detail**: immersive selected-area view using Leaflet, rendering layers such as points and heatmaps.

Core pipeline:

```text
HEAD
  → Catalog
    → AreaSummary
      → AreaDetail
        → Layer metadata
          → GeoLayer.load()
            → GeoJSON
              → LayerView
                → Leaflet primitives / leaflet.heat
```

### Data Loading Indirection

Startup resolves the catalog URL via a two-step fetch:

1. Fetch `/catalog.head.json` (`{ version, catalogUrl }`) — bypasses cache.
2. If that fails, fall back to `/catalogs/catalog.json`.

Debug mode (`?debug`) uses `/catalog.head.debug.json` → fallback `/catalogs/catalog.debug.json`.

Each `GeoArea` then fetches its own manifest URL, and each `GeoLayer` fetches its own GeoJSON URL — all on demand, cache bypassed.

## Cross-Repo Contract Rule

Any change to `src/api.ts` — adding, removing, or renaming a method/event definition or its payload types — **must** be reflected in `docs/MESSAGING.md` in the same commit.

Any change to the shared data entities in `src/protocols.ts` — `Catalog`, `AreaSummary`, `AreaDetail`, `Layer`, or their nested types — **must** also be reflected in `docs/MESSAGING.md` in the same commit. These types describe the JSON structures that `geo-builder` writes and `geo-browser` reads; a mismatch silently breaks data loading.

`docs/MESSAGING.md` is manually synchronized with the matching file in `geo-builder`. Keeping them in sync is the only mechanism that keeps the Python and TypeScript sides of the wire protocol aligned.

## API Shape Rule

Every API response payload carries exactly these fields:

```ts
error: number;             // 0 = OK; non-zero = caller-defined error code
errorDescription: string | null;  // human-readable detail; null when error === OK
// ...domain payload fields (may be null when error !== OK)
```

Rules:
- Error codes are part of the contract and are declared by the Python side in `api.py`.
- TypeScript must always check `error` before using payload fields.
- Branch on the numeric code, not `errorDescription` — that field is for logging only.
- `OK = 0` is the only universal constant; all other codes are API-specific.

**Typical direction (not a strict rule):**
- Browser → Builder: browser calls builder via `EventDef` / `gateway.invoke`.
- Builder → Browser: builder raises events or makes requests via `MethodDef` / `gateway.subscribe`.
- Ping/Pong is an internal handshake exception handled by the Gateway itself.

## Hard Architecture Rules

- `protocols.ts` contains serializable data contracts only.
- `contracts.ts` contains behavioral/runtime interfaces only.
- `runtime/Context` is the external-world boundary.
- `catalog/` owns domain loading/runtime wrappers.
- `state/` owns serializable UI/application state.
- `view/` owns DOM, Leaflet rendering, widgets, and layer views.
- `app/Controller` owns orchestration, mode transitions, durable state mutation, and view switching.
- Views and widgets emit intent only.
- Controller owns behavior.
- Unit tests must not import Leaflet or hit the network.
- Only `view/detail/leafletFactories.ts` imports Leaflet and Leaflet plugins. Both `SummaryView` and `DetailView` import from this file — the cross-folder import is intentional to keep Leaflet confined to one file.

## Naming Rules

Files are camelCase:

```text
summaryView.ts
detailView.ts
summaryViewState.ts
detailViewState.ts
leafletFactories.ts
```

Classes and interfaces are PascalCase:

```ts
SummaryView
DetailView
SummaryViewState
DetailViewState
GeoCatalog
GeoArea
GeoLayer
```

Major architectural classes use single-word names inside folders where possible:

```text
runtime/Context
catalog/Catalog
catalog/Area
catalog/Layer
app/Controller
```

Folder provides namespace. Class uses the simplest meaningful name.

## Vocabulary

Use these terms consistently:

```text
Summary   = discovery/world overview mode
Detail    = selected-area immersive mode
Area      = domain concept
Bubble    = summary UI widget concept
Layer     = protocol/data concept
GeoLayer  = runtime wrapper/cache
__poi__  = reserved builtin virtual layer type: tappable POI markers derived at runtime from hasDetails features in existing layers
hasDetails = GeoJSON feature flag: point carries baked POI metadata and is tappable
```

Do not reintroduce `intro` vocabulary unless explicitly requested. The project settled on `summary/detail`.

## TypeScript Style

The project favors explicit readable TypeScript.

Avoid:

- clever terse one-liners
- heavy optional chaining when explicit branches are clearer
- anonymous inline object fakes in tests
- large inline lambdas
- module mocks when DI works

Prefer:

- explicit private fields
- explicit constructor assignment
- small named stub/fake classes
- dependency injection through options objects
- methods over large lambdas
- methods over free functions when behavior belongs semantically to a class

Because `erasableSyntaxOnly` is enabled, do not use constructor parameter properties:

```ts
// Bad
constructor(private readonly sink: TelemetrySink) {}

// Good
private readonly _sink: TelemetrySink;

constructor(sink: TelemetrySink) {
    this._sink = sink;
}
```

Project readability rule:

```text
If a lambda is more than one logical statement, promote it to a named method.
```

### Error Handling

Use `fail()` from `src/errors.ts` for non-recoverable internal errors. It logs, throws an `AppError`, and never returns:

```ts
import { fail } from "../errors";
fail("detail_state.missing", "DetailViewState is not available.");
```

### Global Logger Singleton

`src/services.ts` holds a module-level `Logger` instance. `Context` initializes it via `setLogger()` in its constructor. Always access it via `getLogger()` — it throws if called before `Context` is constructed.

### Logging Rules

Every feature must log action start, action end, and action error. Use `getLogger()`.

```ts
const log = getLogger();
log.info("image_overlay.paste.start");
// ...
log.info("image_overlay.paste.end");
// on failure:
log.error("image_overlay.paste.error", err);
```

Exception: high-frequency handlers (map pan/zoom callbacks, render loops, per-frame events) are exempt to avoid log spam.

## Testing Rules

Use Vitest with `happy-dom` (configured in `vitest.config.ts`).

```json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run"
  }
}
```

Tests live under:

```text
tests/unit/
tests/stubs/
tests/fakes/
```

Terminology:

- `stub`: tiny DI contract implementation.
- `fake`: lightweight subsystem simulation.

Rules:

- Unit tests run offline. `tests/setup.ts` stubs `fetch` globally to throw on any network call.
- Do not import Leaflet in unit tests.
- Stub our contracts, not third-party libraries.
- Use DI instead of module mocks.
- Reset global singletons between tests. `tests/setup.ts` calls `Context.reset()` in `afterEach`.
- Prefer behavior/wiring assertions over pixel-perfect layout assertions.

## Current Important Branch Decisions

### Runtime Context

`Context` is a singleton under `src/runtime/context.ts`.

It owns environment and external services:

```ts
export type Mode = "browse" | "design";

export class Context {
    readonly mode: Mode;
    readonly debug: boolean;
    readonly data: GeoDataService;
    readonly storage: StorageService;
    readonly logger: Logger;
    readonly host: HostService;
}
```

Rules:

- `?design=<value>` means design mode.
- otherwise browse mode.
- `?debug=<value>` enables debug.
- empty values are ignored.
- `Context.reset()` exists for tests (resets the singleton).

Context is external-world boundary, not application state. Do not put selected area, visible layers, loaded catalog, or current view into Context.

### Data Source / Design Mode

Future design mode integrates with `geo-builder`:

```text
geo-browser TypeScript UI
  ↕ HostApi / window.geoHost
geo-builder Python host
  ↕ provider APIs, storage, artifact generation
```

Repos stay separate:

- `geo-browser`: rendering/client UI.
- `geo-builder`: Python host, data pipeline, project persistence, artifact generation.

### Leaflet Summary View

Summary now uses Leaflet too. The old static `world.svg` approach was replaced.

Current model:

```text
SummaryView
  owns Leaflet map
  owns BubbleWidget[]

DetailView
  owns Leaflet map
  owns widgets
  owns LayerView map
```

Summary = discovery mode, not non-Leaflet mode.

### Heatmaps

`heatmap` layers use `leaflet.heat` through `leafletFactories.ts` only.

Input remains GeoJSON Point features:

```json
{
  "type": "Feature",
  "properties": { "weight": 1.0 },
  "geometry": {
    "type": "Point",
    "coordinates": [14.2681, 40.8518]
  }
}
```

GeoJSON coordinates are `[longitude, latitude]`.
Leaflet coordinates are `[latitude, longitude]`.

Default event weight is `1.0`; heatmap density accumulation is handled by the renderer/plugin.

### POI Layer

`__poi__` is a reserved builtin virtual layer type with no GeoJSON URL of its own. See `docs/MANIFEST.md` for the full plan of record.

- Features with `hasDetails: true` in the area's existing layers render as interactive circle markers.
- Popup shows baked name, amenity, cuisine, address, website, opening hours.
- Review links (Google Maps, Yelp, Foursquare) are computed lazily when the popup opens — not stored in GeoJSON.

Enriched feature shape:

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
    "website": "https://...",
    "opening_hours": "Mo-Su 12:00-23:00"
  },
  "geometry": { "type": "Point", "coordinates": [14.267789, 40.853179] }
}
```

## New Tasks
- **[1-DOF Editor](tasks/one_dof.md)**: Status: Implementation. Long-press / double-click on image pins an anchor lat/lng (derived from containerPointToLatLng at the gesture point). Translation follows the anchor on map pan/zoom; scale stays free. Red donut marker tracks anchor. Pin button in toolbar (shown when pinned) unpins. Double-click / long-press donut also unpins. Pin and lock are mutually exclusive.

## Completed Tasks
- **[Blue Dot Detection](tasks/blue_dot_detection.md)**: Canvas pixel scan in `src/vision/blueDotDetector.ts`. Multi-scale sliding window, 3-stage funnel, sector-aware ring scoring with MIN_RING_SECTORS filter. Auto-pins on paste when confidence ≥ threshold; "I feel lucky" button for manual trigger. Image visually snaps detected dot to GPS position immediately.
- **[3-DOF Editor](tasks/image_overlay.md)**: CSS fixed overlay in detail view (browse mode). Paste/Google/Apple image sources. Translate X/Y via drag, scale via pinch/wheel, opacity slider, geo-lock to map coordinates. Session-level snapshot across view recreations.

## Next Likely Work

Current branch: **ManifestEditor** (in progress).

- Error UX for `PutAreaJson` failures — currently logs and ignores; needs UI feedback.
- Actual manifest editing UI — today the edit button round-trips the manifest unchanged; next step is surfacing an editor.

Keep branches narrow.
