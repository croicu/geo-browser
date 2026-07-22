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

`geo-browser` renders every area on one shared, session-lifetime Leaflet map (`MapView`) — there is no separate discovery/detail mode split. Each catalog area independently renders as a `circle`, `outline`, or `loaded` layer based on its on-screen bbox size and the current zoom (`AreaLifecycleTracker`, `tasks/layer_lifecycle.md`); any number of areas can be `loaded` (base points/heatmap data) concurrently, but only one — whichever the viewport currently centers on — is "current" and owns the virtual layers (`__poi__`/`__user__`/`__void__`/`__search__`) and toolbox at a time (`CurrentAreaBundle`, singleton).

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
2. If that fails, fall back to `/catalog.json`.

There is a single `catalog.json`, not a separate debug variant — `?debug`/`?group=` filtering (see Area Grouping in Completed Tasks below) happens client-side against the same catalog data via `Context.groupFilter`, not by fetching a different file.

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
- Only `view/detail/leafletFactories.ts` imports Leaflet and Leaflet plugins. `view/map/mapView.ts` and `view/detail/currentAreaBundle.ts` both import from this file — the cross-folder import is intentional to keep Leaflet confined to one file.

## Naming Rules

Files are camelCase:

```text
mapView.ts
currentAreaBundle.ts
mapViewState.ts
areaViewState.ts
areaLifecycleTracker.ts
leafletFactories.ts
```

Classes and interfaces are PascalCase:

```ts
MapView
CurrentAreaBundle
MapViewState
AreaViewState
AreaLifecycleTracker
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
Area          = domain concept
Render kind   = an area's per-frame rendering state: circle | outline | loaded
Current area  = whichever one area the viewport currently centers on; owns the virtual-layer bundle/toolbox
Loaded        = base-layer residency state (points/heatmap data resident, any number concurrent)
Layer         = protocol/data concept
GeoLayer      = runtime wrapper/cache
__poi__       = reserved builtin virtual layer type: tappable POI markers derived at runtime from hasDetails features in existing layers
hasDetails    = GeoJSON feature flag: point carries baked POI metadata and is tappable
```

`Summary`/`Detail` as UI *modes* are retired vocabulary — see [Layer Lifecycle](tasks/layer_lifecycle.md) in Completed Tasks below. `AreaSummary`/`AreaDetail` still exist as unrelated protocol/data type names (`protocols.ts`, the manifest wire format from `geo-builder`) and are unaffected. `Bubble`/`BubbleWidget` is retired too — the circle-marker render kind is owned by `AreaMarkerView` now.

Do not reintroduce `intro` or mode-based `summary/detail` vocabulary unless explicitly requested — the project settled on the unified render-kind/current-area model above.

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
fail("area_state.missing", "AreaViewState is not available.");
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

Exception: high-frequency handlers (map pan/zoom callbacks, render loops, per-frame events) are exempt to avoid log spam — but only for the no-op case. If the handler produces a state change (a layer loads/hides/destroys, a mode/current-area switch, anything a bug report would need to reconstruct), log that transition, gated on "did anything actually change" rather than firing every tick. A pan/zoom handler that never logs is exactly as undiagnosable as one with no logging at all — this bit us once already (`tasks/layer_lifecycle.md`'s viewport-driven state machine shipped with zero visibility into its own transitions, and a real bug took a live repro + guesswork to chase down before diagnostic logging was retrofitted after the fact).

New code is not exempt from this just because it doesn't look like a user-facing "feature" — internal orchestration/state-machine classes (trackers, controllers, view coordinators) need this exactly as much as UI-facing ones, arguably more, since they're the hardest to inspect by just looking at the screen.

### Log Categories

Every `Logger` call (`info`/`warning`/`diagnostic`/`error`/`fatal`) takes an optional trailing `category?: string`, defaulting to `DEFAULT_LOG_CATEGORY` (`"general"`) when omitted. A normal run only shows `"general"` — `?debug` in the query string (the existing `Context.debug` flag, reused here rather than adding a second flag) switches `DefaultLogger` to show every category, no matter what it's called (`DefaultLogger.showAllCategories`, wired from `Context.debug` at construction). `?logCategory=a,b` is also available as a manual allow-list independent of `?debug`, for isolating exactly one category's noise without full debug verbosity (`Context.parseLogCategories()`).

The canonical set of category names lives in one place, `src/logging.ts`'s `LogCategory` const object (`LogCategory.General`, `LogCategory.AreaLifecycle`, ...) — a plain `const ... as const` object plus a derived union type, **not** a real TypeScript `enum`: `erasableSyntaxOnly` (see TypeScript Style below) forbids `enum` declarations because they emit runtime code beyond simple erasure. `Logger`'s `category` parameter itself stays a plain `string` (categories are an open set — tests and ad-hoc debugging exercise arbitrary names not in this list), so `LogCategory` is only the known/canonical list call sites should reference instead of retyping string literals. Add a new category here, in `logging.ts`, not scattered next to whichever class happens to use it first.

Use a category for a class of high-volume diagnostic logging that's only useful when actively chasing a specific bug — noisy enough that always showing it would bury the "general" signal, but valuable enough to be worth a name so `?debug` (or `?logCategory=<name>`) can pull it back up on demand. `LogCategory.AreaLifecycle` is the existing example — `MapView`'s viewport-transition trace (`map_view.viewport_change`, `map_view.jump_to_area.*`) and `AreaBaseLayerRenderer`'s hide/show/destroy logs. Genuine anomalies (a defensive guard firing, something a bug report would need regardless of what's being actively debugged) stay on the default `"general"` category rather than being tagged — category is for expected-but-verbose diagnostic *volume*, not for hiding real problems.

Every new component — and existing components picking up meaningfully new code — is **entitled and encouraged** to add its own `LogCategory` entry and log verbosely under it: per-step state, intermediate values, anything useful while actively debugging that class but too noisy for a normal run. This is a standing invitation, not something to ask permission for each time. Verbose category logging is cheap to add while writing the code and expensive to retrofit later once a live bug forces the question — see `tasks/layer_lifecycle.md`'s viewport-driven state machine, which shipped with no visibility into its own transitions and took a live repro plus guesswork before `LogCategory.AreaLifecycle` was retrofitted after the fact. Default to adding the category up front instead of waiting for that to happen again.

## Feature Completeness Rule

Every new feature must have:
- **Logging**: action start, action end, and action error at key decision points (follow the Logging Rules above).
- **Unit tests**: cover the core state/logic. Extract pure state classes from Leaflet/DOM code so they can be tested without importing Leaflet.
- **Public docs**: before commit, update every doc a future implementer or user would expect to reflect this feature — `README.md` if it's user-facing, and any affected file under `docs/` (`IMPLEMENTATION.md`, `MANIFEST.md`, `MESSAGING.md`, `PROTOCOL.md`, `LAYERS.md`, `ROADMAP.md`, etc.). A feature isn't done while it leaves docs describing the old behavior, or silent on the new one. See [Documentation Audit](tasks/docs_audit.md) for the kind of drift this prevents.

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

### Unified Map (MapView)

One shared, session-lifetime Leaflet map replaces the old Summary/Detail two-map split (full design: [tasks/layer_lifecycle.md](tasks/layer_lifecycle.md)).

```text
MapView (session-lifetime, one shared L.Map)
  owns AreaLifecycleTracker (pure state machine, no Leaflet — recompute() drives everything below)
  owns one AreaMarkerView per catalog area (circle/outline render kinds, eager)
  owns one AreaBaseLayerRenderer per currently-resident area (points/heatmap, lazy, N-concurrent)
  owns 0-or-1 CurrentAreaBundle (virtual layers + toolbox + search + image overlay, singleton)
  owns session-level GeoLocationWidget / DestinationWidget / design-mode toolbar
  owns one persistent MapLayerFlyoutHandle (tile layer, content swapped via setLayers())
```

`AreaLifecycleTracker.recompute(viewport)` is the single entry point: given the current bounds/zoom, it returns a diff (`toLoad`/`toShow`/`toHide`/`toDestroy`/render kinds/bundle action) that `MapView.handleViewportChange()` applies mechanically. Nothing else independently decides whether an area should be visible/loaded/current.

Two-phase discard: **Hide** (instant, Leaflet-only detach, `AreaBaseLayerRenderer.hide()`/`show()`) keeps a de-prioritized area's parsed GeoJSON resident for cheap re-entry; **Destroy** (deferred, `GeoLayer.invalidate()`) only fires as a side effect of a genuinely new area's `toLoad` in the same tick, per the "revisiting the same neighborhood never destroys" rule.

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
- Popup shows baked name, amenity, cuisine, address, website, opening hours, star rating, outdoor seating, Wikipedia link, Wikidata thumbnail image, and review links (Google Maps, Street View, Yelp, Foursquare, TripAdvisor).
- Review links and the Wikidata image are computed/fetched lazily when the popup opens — not stored in GeoJSON.
- **Enhanced markers**: features with `wikipedia`, `wikidata`, `stars`, or `outdoor_seating="yes"` get a visible ring border. Ring color comes from `enhancedColor` (layer style, default `#20b7dd`); outdoor seating features use `outdoorColor` (default `#f5c518`).
- The ring is a separate `poi-ring-marker` SVG element (`pointer-events: none`) because `.poi-marker` uses a transparent 40px stroke for the touch hit area, which overrides Leaflet's SVG stroke attribute via CSS.

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
    "website": "https://...",
    "opening_hours": "Mo-Su 12:00-23:00",
    "wikidata": "Q12345",
    "wikipedia": "en:Bar_Gaetano",
    "stars": "4",
    "outdoor_seating": "yes"
  },
  "geometry": { "type": "Point", "coordinates": [14.267789, 40.853179] }
}
```

**POI callout actions** (`PoiLayerView.buildPoiBottomRow` in `poiLayerView.ts`, shared `StarRatingControl` widget): the popup's action row is separate from the baked metadata above.
- Star (1–5): if the tapped POI has no matching `__user__` point yet, selecting a star creates one (`onPoiStarSelected` → `Controller.doAddStarredUserPoint`); if one exists, it re-rates it. Rendered read-only once a rating exists.
- Bookmark toggle: only shown when there's no existing rating (mutually exclusive with the star control in the same row). Tapping it on an unbookmarked point creates a bookmarked `__user__` point at that location; tapping it again on an already-bookmarked point deletes that point outright (`onPoiBookmarkToggled`, not a plain unset).
- `EmptyCalloutWidget` (`emptyCalloutWidget.ts`) is the shared callout shell used for both POI popups' bottom row layout and empty-space/existing-point taps — see **User Points / Bookmarks** below.

### Virtual Layers — Ownership Summary

Three reserved `type` values besides `__poi__`, each owned by one `LayerView` subclass, synthesized into the manifest at runtime if `geo-builder` didn't emit one (`CurrentAreaBundle.synthesize*` methods):

| type | View class | File | Backing store |
|------|-----------|------|----------------|
| `__user__` | `UserLayerView` | `view/detail/userLayerView.ts` | `UserPointsStore` (DI — `LocalStorageUserPointsStore` in browse mode, `GatewayUserPointsStore` in design mode; see `runtime/userPointsStore.ts`) |
| `__search__` | `SearchLayerView` | `view/detail/searchLayerView.ts` | none — ephemeral, single in-memory marker, no persistence |
| `__void__` | `VoidLayerView` | `view/detail/voidLayerView.ts` | precomputed GeoJSON from `geo-builder`; variant picked by `VoidVariantResolver` (see [Mundane (Void) Layer](tasks/void_layer.md), `docs/LAYERS.md`) |

`CurrentAreaBundle` injects the store/service dependencies into each view's constructor (DI, not module imports) and filters these three `type`s out of the regular manifest-driven layer list (`_area.layers.filter(l => l.type !== ...)`) so they don't get double-rendered through the generic layer pipeline.

### User Points / Bookmarks

`__user__` points are end-user trip markers, distinct from the live GPS position (see **Live Location & Heading** below).

- **Creation**: single tap on empty map space opens `EmptyCalloutWidget` (coords + map links + star row + bookmark toggle). Selecting a star, or toggling the bookmark and then dismissing the callout, persists a new point via `UserPointsStore.addPoint`. There is no bare "drop a point" gesture — a point always carries either a rating or a bookmark from creation.
- **Deletion**: tapping an *existing* point's marker reopens the callout, this time with a delete button (`onDeleteRequested`) in place of the bookmark toggle. Long-press/right-click creation and instant right-click delete were removed — see [Explicit Point Delete](tasks/explicit_point_delete.md).
- **Bookmark storage**: `bookmarked: true` on the GeoJSON feature's `properties`, alongside `stars` when both are present. Rendered as a ring overlay (`bookmarkColor`, default `#5AB5DA`) that takes visual priority over the star rating ring — a bookmarked point's ring never reflects its stars.
- **Storage backend**: `LocalStorageUserPointsStore` (key `geo-browser.userPoints.<areaId>`) in browse mode; `GatewayUserPointsStore` (via `AddUserPoint`/`RemoveUserPoint`/`GetUserPoints`) in design mode. Selected by `Context.mode` at composition time, not by the view.

### Tile Provider

`src/maps/tileProvider.ts` holds the `TileProvider` interface, `osmTileProvider` and `cartoTileProvider` constants, and the module-level `getActiveTileProvider`/`setActiveTileProvider` store (survives map recreations). CARTO Voyager is the default. OSM tiles use the `dark-osm` CSS filter; CARTO tiles do not.

### Map Layer Flyout

`MapLayerFlyoutControl` (in `leafletFactories.ts`) is a Leaflet control at `topright`, created once by `MapView.render()` and never torn down for the rest of the session (see Unified Map above — recreating it would tear down and rebuild the tile layer it owns). It:
- Manages the tile layer lifecycle (replaces the old `TileProviderControl`)
- Renders a layers icon button that opens a flyout panel on tap
- **No current area**: flyout shows Map type section only (CARTO / OSM toggle)
- **A current area exists**: flyout also shows Map Details (layer list with color circles and visibility toggles) — `CurrentAreaBundle`'s `LayerSelectionWidget` swaps this content in/out via `MapLayerFlyoutHandle.setLayers()`, never by recreating the control
- Outside-click dismisses the flyout; clicking inside keeps it open
- Created via `WidgetFactory.createMapLayerFlyout(layers, onToggle)`

### Map Control Positions

All interactive controls are at `topright` (stacked top-to-bottom in render order). `MapLayerFlyoutControl` is session-level (`MapView`, always present); `SearchControl` and `ImageOverlayWidget` are area-scoped (`CurrentAreaBundle`, only exist while a current area is attached):

```text
MapLayerFlyoutControl (tile layer + layer visibility flyout — session-level)
SearchControl         (Nominatim place search — current area only)
ImageOverlayWidget    (paste/image toolbar — current area only, only when image is active)
GeoLocationControl    (bottomright, session-level)
```

Zoom buttons are disabled (`zoomControl: false`).

### Live Location & Heading (GPS Blue Dot)

The blue GPS dot with its heading cone is **not** a manifest layer — it's `GeoLocationWidget` (`view/detail/geoLocationWidget.ts`), a standing `bottomright` control owned by `MapView`, session-level (always present, independent of any current area). Do not confuse it with `__user__` (trip points); they are unrelated features that happen to both render markers.

- **Position**: `Context.geoLocation` (`GeoLocationService`, real impl `BrowserGeoLocationService`) via the browser Geolocation API.
- **Heading**: `Context.headingService` (`HeadingService`, real impl `BrowserHeadingService`, `runtime/browserHeadingService.ts`) wraps `DeviceOrientationEvent` — `webkitCompassHeading` where available (iOS), else `360 - alpha` for the standards-track `absolute` orientation event.
- **iOS permission gotcha**: Safari on iOS requires `DeviceOrientationEvent.requestPermission()` to be called from inside a user gesture handler, and only prompts once per session. `GeoLocationWidget.onToggle()` (the "follow me" tap) is that gesture — `_headingPermissionRequested` guards it to fire only once. Any new entry point that consumes `HeadingService` must likewise originate its permission request from a real click/tap handler, not from `render()`/`watch()` setup, or iOS silently denies it. (The destination bearing cone below deliberately sidesteps this entirely — it's pure lat/lng geometry, not a `HeadingService` consumer, precisely to avoid a second permission-gated dependency.)
- Both services are constructed directly in `Context`'s constructor (`runtime/context.ts`), not behind `HostService` — they're a Web Platform API boundary, independent of `browse`/`design` mode.

### Destination Marker + Bearing Cone

A single "which way is it, roughly" indicator — not routing. Pure client runtime, no `geo-builder`/gateway involvement at all (unlike `__user__`); global, not scoped per area. Full design: [tasks/destination_marker.md](tasks/destination_marker.md).

- **Store**: `DestinationStore` (`contracts.ts`) has exactly one implementation, `LocalStorageDestinationStore` (`runtime/destinationStore.ts`, key `geo-browser.destination`). No `Context.mode` branching, no design-mode variant — constructed in `Controller.start()` alongside `userPointsStore`, threaded down through `MapView`'s constructor options into `CurrentAreaBundle`.
- **Rendering**: `DestinationWidget` (`view/detail/destinationWidget.ts`), a sibling to `GeoLocationWidget`, not a merge into it. Owns two Leaflet elements, both rendered into a dedicated `destination-pane` (via `MapHandle.createPane`, same technique as `VoidLayerView`'s `void-pane`) with `zIndex` explicitly set below the default `markerPane` (600) — this guarantees the blue GPS dot/heading cone always draws on top, regardless of widget creation order:
  - **Pin** (`LayerFactory.createDestinationMarker`) — fixed at the destination's lat/lng, shown whenever a destination exists, independent of GPS. Directly tappable (`DestinationMarkerHandle.onClick`).
  - **Cone** (`LayerFactory.createDestinationCone`) — anchored at the *live GPS position* (not the destination), rotated by `computeBearing()` (`geo/bearing.ts`, pure great-circle initial-bearing math, unit-testable without Leaflet). Reuses `PositionMarkerHandle`'s existing `setLatLng`/`setHeading` shape rather than a parallel type — mechanically identical to the blue heading cone (rotate an SVG polygon, hide via `setHeading(null)`), just red (`#ED4231`) and dot-less.
- **Position feed**: `DestinationWidget` never starts its own GPS watch. `GeoLocationWidget.onPositionUpdate(listener)` is a passive subscription (fires from the same `onPosition`/`onDenied` callbacks the blue dot already uses) that `MapView` wires into `DestinationWidget.onPosition()`. This is the one new piece of surface `GeoLocationWidget` exposes for this feature.
- **Callout wiring**: a 4th action alongside star/bookmark/delete in both `EmptyCalloutWidget` (`onDestinationToggled`/`isDestination`) and `PoiLayerView.buildPoiBottomRow` (`onPoiDestinationToggled`/`isDestination` options) — independent of the other three, so a point can be starred *and* be the destination. Icon swaps between `public/icons/destination.svg` (solid fill, `#ED4231`, "Set") and `public/icons/remove_destination.svg` (same path, transparent fill, `#ED4231` outline stroke, "Remove") — same pattern as `bookmark.svg`/`solid_bookmark.svg`, icon-swap only, no background treatment (an `.active` background was tried and dropped — looked wrong, visible as an unwanted box around the icon). Set/remove is immediate on tap (unlike the empty-space bookmark flow, which defers to popup-dismiss) since a destination never creates a `__user__` point.
- **Tapping the destination pin**: `DestinationWidget` is constructed by `MapView` with an `onMarkerTapped` callback that forwards straight to `CurrentAreaBundle.onDestinationMarkerTapped` (the current bundle, if any) — delegates to whichever callout the point would normally get — `onUserMarkerTapped` if a `__user__` point already exists there, else `openStarCallout` — with the destination toggle layered on top either way. It deliberately does **not** show a stripped-down "remove only" popup: star/bookmark/delete stay available, since the destination toggle is independent of them. This is also the reliable removal path for a destination set from empty space, since re-tapping the exact original coordinates isn't realistic.
- **Rating/bookmarking clears destination**: `CurrentAreaBundle.maybeClearDestination(latLng)` is called from every star/bookmark commit site (`onEmptyStarSelected`, `onPoiStarSelected`, `onPoiBookmarkToggled`, the deferred bookmark commit in `closeEmptySpacePopup`, and the re-rate handler in `onUserMarkerTapped`) — if the acted-on point is the current destination, it's cleared. Applies regardless of which UI path triggered the action.
- **Gotcha this surfaced**: `synthesizeUserLayerView` hardcoded `new DefaultLeafletLayerFactory()` instead of `this._layerFactory`, so any code path that lazily creates the `__user__` layer under a stub factory (i.e. in tests) crashed. Fixed at that call site. The same hardcoded-factory pattern exists in a few other spots in `CurrentAreaBundle`/`VoidLayerView` — harmless in production (the real composition root always injects `DefaultLeafletLayerFactory` anyway) but will bite the next test that exercises one of them under a stub.
- **Behavior lives in `CurrentAreaBundle`** (`doSetDestination`/`doRemoveDestination`/`onDestinationMarkerTapped`), not `Controller` — matches the established pattern for `__user__` star/bookmark actions (`doAddStarredUserPoint` etc.), despite the general architecture rule naming `Controller` as behavior owner; these actions are tightly coupled to `CurrentAreaBundle`'s own map/popup state.

### Viewport & Per-Area State Persistence

There is no more "last view" concept to restore (one shared map, no mode to reopen into). `GeoStateStore` (`src/state/geoStateStore.ts`) persists two things independently, both in localStorage:

- `geo-browser.mapViewState` — the shared map's `center`/`zoom` (`MapViewState`, `src/state/mapViewState.ts`). Saved on every `handleViewportChange()`, loaded once by `Controller.start()` and passed into `MapView`'s constructor.
- `geo-browser.areaViewState.<areaId>` — one entry per area actually visited, holding `visibleLayers` (`AreaViewState`, `src/state/areaViewState.ts`). `MapView.getOrLoadAreaState()` loads it lazily the first time an area becomes resident/current; it is *not* eagerly loaded for every catalog area.

Since `MapView` itself is a single session-lifetime object, "restoring the last view" is really just "the map opens wherever `MapViewState` says" — no explicit reopen-last-area step exists or is needed.

## Task Workflow

Every task moves through these statuses in order. Update the `Status:` field in both the CLAUDE.md entry and the task file as work progresses.

1. **Brainstorm** — Create the `## New Tasks` entry with `Status: Brainstorm`. Create `tasks/<task-name>.md` with the problem statement. Update the task file as the design discussion evolves.
2. **Implementation** — Advance to `Status: Implementation`. Add an implementation plan to the task file. Write the code.
3. **Testing** — Advance to `Status: Testing`. Verify correctness; update the task file with test results and any open issues.
4. **Ready to Submit** — Advance to `Status: Ready to Submit`. Run lint + tests; confirm docs are up to date.
5. **Done** — Advance to `Status: Done` after merge/close; move the entry to `## Completed Tasks`.

### Check-in chores (include in every feature commit)
- Set `Status: Done` in the task file.
- Move the CLAUDE.md entry from `## New Task` to `## Completed Tasks` with a one-line summary.
- Update `README.md` and any affected `docs/*.md` file so they describe this feature's actual shipped behavior (see the Feature Completeness Rule above) — do this in the same commit, not as a follow-up.
- Include these file changes in the same commit as the feature code.


## New Tasks

## Postponed Tasks
- **[User Points Service Worker](tasks/user_points_sw.md)**: Status: Postponed. Replace localStorage / gateway storage with a Cloudflare Worker for durable cross-device sync. Waiting for stabilization to complete.
- **[Share Target](tasks/share_target.md)**: Status: Postponed. PWA share target for Google Maps route URLs. Blocked on CORS wall / resolver approach (CF Worker vs iframe+xhr.responseURL). Tracked in [#35](https://github.com/croicu/geo-browser/issues/35).

## Ongoing Tasks
- **File**: [Stabilization](tasks/stabilization.md)
- **Status**: Ongoing.
- **GitHub Issue**: N/A
- **Key Context**: On-device testing of the user layer and related features before starting new work. Collect and fix bugs found in the field.

## Completed Tasks
- **[Layer Lifecycle](tasks/layer_lifecycle.md)**: Status: Done. Eliminated the Summary/Detail two-map mode split in favor of one unified, session-lifetime Leaflet map (`MapView`). Each area independently renders `circle`/`outline`/`loaded` based on on-screen bbox pixel *area* vs. a fixed 48px-diameter reference circle (`AreaRenderClassifier`) and a global `MIN_LOADED_ZOOM=10` floor, both driven by `AreaLifecycleTracker`'s pure `recompute()` state machine; any number of areas can be concurrently `loaded`, with a two-phase Hide(instant)/Destroy(deferred) discard lifecycle, while a singleton `CurrentAreaBundle` (renamed/slimmed from the old `DetailView`) owns the virtual layers (`__poi__`/`__user__`/`__void__`/`__search__`) and toolbox for whichever one area is current. `AreaMarkerView` (successor of `BubbleWidget`) renders the circle/outline markers as a fixed-diameter, unfilled circumference matching the bbox outline's style; tap-to-jump preserved. Five real bugs found and fixed post-cutover during live device testing (CSS class rename gap, `leaflet.heat`'s uncancelled `requestAnimFrame`, non-atomic `setZoom`+`panTo`, a hidden area's own zoom listener bypassing `hide()`, `MapLayerFlyoutControl` tile-layer ownership) plus three more found via this session's new `?logCategory`/`?debug` categorized logging (a missing global zoom floor causing a peripheral area to silently steal "current" status while zooming out — the "ghost heatmap" bug; `createRectangle()` hardcoding `interactive:false` and silently breaking the outline's tap-to-jump; a pinch-zoom-specific `leaflet.heat` freeze, ultimately deferred to [geo-builder#40](https://github.com/croicu/geo-builder/issues/40) as a design-time-precompute follow-up rather than further live-plugin patching). Shipped alongside a new logging-category system (`LogCategory` const object in `src/logging.ts`, `?debug` shows every category, default run shows only `"general"`) built specifically to diagnose this feature's bugs, now a standing project convention (see Log Categories above). Full doc rewrite (this commit): CLAUDE.md, README.md, `docs/ARCHITECTURE.md`, `docs/IMPLEMENTATION.md`, `docs/CODING.md`, `docs/PROTOCOL.md`, `docs/ROADMAP.md`.
- **[Destination Marker + Bearing Cone](tasks/destination_marker.md)**: Status: Done. Fixed `#ED4231` red destination pin (`public/icons/destination.svg`, tappable) + red bearing cone (`geo/bearing.ts` great-circle math, not compass) anchored on the live GPS position, both rendered into a `destination-pane` kept below the default `markerPane` so the blue GPS indicator always draws on top. `DestinationWidget` (`view/detail/destinationWidget.ts`) is passive w.r.t. GPS — reacts to `GeoLocationWidget.onPositionUpdate`, never starts its own watch. Set/remove via a 4th, independent action on the POI/empty-space callout (`EmptyCalloutWidget`/`PoiLayerView`), plus a direct tap on the pin itself — which delegates to the point's normal callout (keeping star/bookmark/delete alongside the destination toggle) rather than a stripped-down view; rating or bookmarking a point clears its destination status. Icon swaps between `destination.svg`/`remove_destination.svg` (solid vs. transparent-fill stroke outline, same shape and color). Pure client runtime — `LocalStorageDestinationStore` only, no `geo-builder`/gateway involvement, no `Context.mode` branching, global (not per-area) persistence. Typecheck/full test suite/production build all clean; **not** visually verified in a live browser (no display/GPS spoofing in this environment) — flagged in the task file for a manual pass.
- **[Documentation Audit](tasks/docs_audit.md)**: Status: Done. Doc-only pass, no code changes. README: fixed the `__user__` row and "Trip Recording"/"POI Actions" sections to describe the actual tap-callout creation flow (the long-press/right-click gesture they still described was removed by Explicit Point Delete); clarified the GPS blue dot/heading cone is not a manifest layer. CLAUDE.md: added "Virtual Layers — Ownership Summary", "User Points / Bookmarks", and "Live Location & Heading" architecture sections, including the iOS `DeviceOrientationEvent.requestPermission()` user-gesture gotcha. Second pass cross-referenced the full `docs/` directory against this Completed Tasks list and fixed stale "not yet shipped" status headers on the void layer (LAYERS.md, MANIFEST.md — it shipped), a wrong `enhancedColor` default in MESSAGING.md, a missing `stars`/`bookmarked` schema in MANIFEST.md, an incomplete layer-type list in PROTOCOL.md, a stale/incomplete directory tree and missing Void/Search/UserLayerView subsections in IMPLEMENTATION.md, a stale foundation list in ROADMAP.md, and stale "future work" framing for the (shipped) image-overlay feature in OVERVIEW.md and PITCH.md.
- **[Area Grouping](tasks/area_grouping.md)**: Status: Done. Replaced `catalog.head.debug.json`/`catalog.debug.json` with a single `catalog.json`; `AreaSummary.group?: string[]` drives client-side Summary filtering via `Context.groupFilter` (`?group=a,b`, AND semantics, `?debug=1` back-compat shorthand). `"debug"` is opt-in-only — hidden unless explicitly requested, even under an unrelated `?group=` filter the area also matches. `Context.debug` kept as an independent diagnostics flag (synthetic heading, debug-only toolbar buttons), not replaced by `groupFilter`.
- **[Mundane (Void) Layer — precompute](tasks/void_layer.md)**: Status: Done. Computation moved to `geo-builder`: precomputed smooth void polygons per area, selected at runtime via an `__void__`/`__void__2__`/`__void__2_3__` naming convention resolved by minimal-superset search (`VoidVariantResolver`). All prior client-side computation deleted (`voidLayerComputer.ts`, `voidSpatialIndex.ts`, canvas-pane/renderer plumbing) — `VoidLayerView` is now a thin fetch-and-render of a `GeoLayer`'s precomputed GeoJSON via new `LayerFactory.createGeoJsonPolygon`. Single synthesized "Mundane" toggle in the flyout regardless of variant count; label follows whichever variant is active. Contract: [docs/LAYERS.md](docs/LAYERS.md); schema in `docs/MANIFEST.md`. Verified in browser against `geo-builder`'s real output for the local `redmond` debug area.
- **[Explicit Point Delete](tasks/explicit_point_delete.md)**: Status: Done. Removed long-press/right-click silent point creation and instant right-click marker delete; points are created only via single tap + star/bookmark; existing points are deleted via a `delete.svg` button in the tap callout (same slot the bookmark toggle uses on the creation callout).
- **[Nominatim Search](tasks/nominatim_search.md)**: Status: Done. Bounded Nominatim search in Detail view; `__search__` virtual layer with ephemeral marker; topright `SearchControl` with expandable input, result list, and × close button; marker tap promotes to user point; results panel appended to body (`position: fixed`) to clear Leaflet stacking context.
- **[User Bookmarks Addendum](tasks/user_points_addendum.md)**: Status: Done (superseded in part by [Explicit Point Delete](tasks/explicit_point_delete.md)). Bookmark on POI callout; interactive stars on unrated/bookmarked points; rating auto-removes bookmark.
- **[User Bookmarks](tasks/user_bookmarks.md)**: Status: Done. Bookmark toggle on user points; blue ring overlay (`bookmarkColor`); `solid_bookmark.svg`; `setBookmarked` in store; bookmark ring takes visual priority over star ring; long-press callout exposes toggle.
- **[User Star Ratings](tasks/starred_user_points.md)**: Status: Done. Star rating (1–5) on user trip points; ring overlay with atan color curve; interactive and readonly `StarRatingControl`; `EmptyCalloutWidget` star UI; ring weight reduced to 3.
- **[Empty Space Tap](tasks/empty_space_tap.md)**: Status: Done. Tapping empty map space opens a callout with lat/lng and links to Google Maps, Apple Maps, and Street View. Second tap outside dismisses it.
- **[User Data Share](tasks/user_data_share.md)**: Status: Done. GeoJSON export of `__user__` points via "Download My Trip" / "Share My Trip" button in the layer flyout. `navigator.share()` on mobile (text fallback if file share fails), `<a download>` on desktop. `getPointsSync` reads fresh data from localStorage synchronously to preserve the user gesture. Button hidden when no points.
- **[Layer Selection Flyout](tasks/layer_selection_popup.md)**: Status: Done. Replaced `TileProviderControl` + `LayerControl` with `MapLayerFlyoutControl`; layers icon opens flyout with Map type (both views) and Map Details layer list (detail only); blue border on visible layers; outside-click dismiss.
- **[Enriched POI Features](tasks/enriched_features.md)**: Status: Done. wikipedia, wikidata, stars, outdoor_seating added to `PoiBakedFeature`; enhanced markers get `enhancedColor` border; popup shows star icons, outdoor seating text, Wikipedia/Wikidata links.
- **[Tile Provider](tasks/tile_provider.md)**: Status: Done. `TileProvider` interface in `src/maps/`; `osmTileProvider` and `cartoTileProvider` constants; Carto Voyager set as default in `DefaultLeafletMapFactory`.
- **[Two-Tap Select](tasks/two_tap_selection.md)**: Status: Done. First tap expands a sliding name label; second tap toggles visibility. Tap elsewhere dismisses. Single-active rule. `TwoTapState` extracted for unit tests; Leaflet `_fakeStop` gotcha documented.
- **[User Layer](tasks/user_layer.md)**: Status: Done. End-user trip points stored in `__user__` layer. Creation/deletion gestures since replaced by [Explicit Point Delete](tasks/explicit_point_delete.md); localStorage + gateway storage, pressure→HSL-lightness colour, incremental rendering, toolbar visibility, synthesis fallback, AreaChanged wiring.
- **[Zoom out exception](tasks/zoom_out_bug.md)**: Status: Done. Fixed crash in Leaflet's animated zoom (setMinZoom pre-snaps without animation) and bounce-back loop (summary viewport zoom clamped to ≤ 10).
- **[Blue Dot Detection](tasks/blue_dot_detection.md)**: Canvas pixel scan in `src/vision/blueDotDetector.ts`. Multi-scale sliding window, 3-stage funnel, sector-aware ring scoring with MIN_RING_SECTORS filter. Auto-pins on paste when confidence ≥ threshold; "I feel lucky" button for manual trigger. Image visually snaps detected dot to GPS position immediately.
- **[3-DOF Editor](tasks/image_overlay.md)**: CSS fixed overlay in detail view (browse mode). Paste/Google/Apple image sources. Translate X/Y via drag, scale via pinch/wheel, opacity slider, geo-lock to map coordinates. Session-level snapshot across view recreations.
- **[1-DOF Editor](tasks/one_dof.md)**: Status: Completed. Long-press / double-click on image pins an anchor lat/lng (derived from containerPointToLatLng at the gesture point). Translation follows the anchor on map pan/zoom; scale stays free. Red donut marker tracks anchor. Pin button in toolbar (shown when pinned) unpins. Double-click / long-press donut also unpins. Pin and lock are mutually exclusive.

## Next Likely Work

Current branch: **ManifestEditor** (in progress).

- Error UX for `PutAreaJson` failures — currently logs and ignores; needs UI feedback.
- Actual manifest editing UI — today the edit button round-trips the manifest unchanged; next step is surfacing an editor.

Keep branches narrow.
