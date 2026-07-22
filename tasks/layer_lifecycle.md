# layer_lifecycle.md

Status: Implementation

## Summary

Eliminates the Summary/Detail mode split. One Leaflet map. Areas render as
circle, bbox outline, or fully loaded layer depending on screen-pixel size
and viewport position. Replaces `SummaryView`/`DetailView` with a single
unified view.

This is a **breaking vocabulary change** relative to `CLAUDE.md`. That doc's
Summary/Detail terminology, and the "do not reintroduce intro vocabulary"
rule, are now stale and need a rewrite once this ships. Not blocking for
this branch, but CC should know going in.

## Motivation

The only reason Summary/Detail existed as separate modes was to avoid
keeping every area's layer data loaded simultaneously. That's a memory
management problem, not a UI mode problem. Solve it directly: make layers
discardable based on visibility and size, and the mode split disappears.

## Rendering States (per Area)

Each `GeoArea`, every frame the viewport changes, is in exactly one state,
governed by **two independent thresholds** — one purely geometric (bbox size
vs. a fixed circle), one purely zoom-based (a global floor, same for every
area):

| State | Condition | Rendering |
|---|---|---|
| `circle` | bbox screen *area* < the area of an N-px-diameter circle | Fixed N-px-diameter circle at bbox centroid, circumference only, no fill |
| `outline` | bbox screen area ≥ that circle's area, AND (zoom < `MIN_LOADED_ZOOM` OR layer not yet loaded) | `L.rectangle` outline of bbox, no fill, no data |
| `loaded` | bbox screen area ≥ that circle's area, AND zoom ≥ `MIN_LOADED_ZOOM`, AND layer loaded | Base layer render (points/heatmap only) |

Walking zoom levels from highest to lowest for a single area: `loaded` (+
its bbox outline drawn underneath) down to `MIN_LOADED_ZOOM`; below that,
`outline` only (layers hidden) until the bbox's screen *area* drops below
the reference circle's area; from there down, `circle`, at a **fixed N-px
diameter that never changes as you keep zooming out**. No hysteresis in
either direction — every recompute reacts fresh to the current zoom, so
zooming back in retraces the same states in reverse.

`loaded` covers manifest-declared base layers only. It says nothing about
virtual layers (`__poi__`, `__user__`, `__void__`, `__search__`) or the
toolbox — those are governed separately by the Current Area concept below,
and only ever apply to one area at a time regardless of how many areas are
simultaneously `loaded`.

`N` is a single constant, **48px**, doing double duty: (a) the diameter of
the fixed circle marker actually drawn, and (b) the comparison threshold —
an area's bbox screen *area* (width×height in px, not just its longer
dimension) is compared against the area of a circle of diameter N, not
against N directly. A long, thin bbox whose longer side alone clears N px
can still be `circle`, if its rectangle's total area is smaller than that
circle. Standard minimum touch-target size; easy to retune after checking
on-device (`AreaRenderClassifier.LOAD_THRESHOLD_PX`).

There is a **second, independent threshold**: a global minimum zoom level
(`AreaRenderClassifier.MIN_LOADED_ZOOM`, starting value **10**, same
tune-on-device treatment as N), constant across every area regardless of its
own bbox size. Below this zoom, no area's layers are ever shown — an area
whose bbox is already well above the N-px-circle's area still only gets
`outline`, never `loaded`, until zoom climbs back to the floor. This
restores the old Summary/Detail split's `zoom < minZoom` exit boundary,
which the bbox-size check alone doesn't provide: a physically large area
crosses its own N-px-equivalent threshold at a much lower zoom than a small
one, and without a shared floor, zooming out from a small current area can
hand "current" straight to a large, merely-peripheral one the instant it
crosses its own (low) threshold — a real bug found live (see
`tasks/stabilization.md`'s "ghost heatmap" entry). The two thresholds are
independent axes, not layered fallbacks: circle-vs-outline never consults
zoom directly, and loaded-vs-outline never consults bbox area directly
(beyond already being `outline`-eligible).

## Load / Hide Triggers

No exclusivity — any number of areas can be loaded (or hidden-but-resident)
concurrently. Each area evaluates its own state independently:

- **Load**: area's bbox intersects the viewport AND bbox screen area ≥ the
  N-px circle's area AND zoom ≥ `MIN_LOADED_ZOOM`.
  AND zoom ≥ `MIN_LOADED_ZOOM`.
- **Hide**: area's bbox no longer intersects the viewport, or zoom drops
  below `MIN_LOADED_ZOOM`, AND the area is not the fallback-pinned area
  (below). Hide is visual only — see Discard Lifecycle below for what
  actually happens to the layer object.
- Per-area threshold, not global zoom level — a small area's bbox may
  cross N px at a different zoom than a large area's.

Areas with overlapping or adjacent bboxes are expected to both satisfy the
load condition simultaneously — this is normal, not an edge case to guard
against. There is no cap on concurrently loaded/hidden-resident areas;
catalog size (a handful of cities) doesn't justify one yet.

## Empty-Viewport Fallback

If **zero** areas intersect the viewport (e.g. panned to open water between
cities), pin-load whichever area's centroid is closest to the viewport
center, computed across the full catalog. This is the only case the
fallback applies — it does not override or limit normal loading when one
or more areas already intersect the viewport. Recomputes on every viewport
change; drops the pin as soon as a real intersection exists. The pinned
area is exempt from both Hide and Destroy.

The pin governs base-layer visibility only — it exists so the map is never
fully empty over open water. It does not confer current-area status: the
pinned area is picked precisely because it fails `loaded`'s
bbox-intersects-viewport condition, so it can never be current while
pinned. Panning off a current area (its bbox leaves the viewport entirely,
possibly triggering the fallback pin elsewhere) loses current status the
same as zooming out below threshold, but is cheaper: see Current Area
below — no explicit hide step is needed for the virtual-layer bundle,
since its content is geographically outside the viewport already and
therefore not visible regardless. Only the toolbox needs to flip to
summary.

## Current Area (Virtual Layer Ownership)

Base layers can be `loaded` for any number of areas concurrently (above).
Virtual layers — `__poi__`, `__user__`, `__void__`, `__search__` — and the
toolbox do not follow that model. They stay a **singleton bundle**, exactly
as today's `DetailView` owns one `PoiLayerView`/`UserLayerView`/
`VoidLayerView`/`SearchLayerView`/toolbox for one area at a time. This
carries the existing per-area assumption in those views forward unchanged —
there is no per-area multiplication of virtual layer instances.

- **Which area is current**: among areas satisfying `loaded`'s condition
  (bbox intersects viewport, screen size ≥ N px), the one whose bbox
  centroid is closest to the viewport center. Recomputed on every viewport
  change, same trigger as everything else in this doc — no hysteresis, no
  minimum dwell time. If exactly one area is `loaded`, it's current
  trivially.
- **Toolbox**: bound to current-area presence. No current area (nothing
  `loaded`, or the empty-viewport fallback pin is only a `circle`/`outline`)
  → summary toolbox. Current area exists → that area's detail toolbox.
- **`SummaryControl` ("back to summary" button) is removed entirely.** It
  existed to manually leave Detail mode; that's now automatic — zoom or
  pan out until no area is current and the toolbox reverts to summary on
  its own (above). No replacement control needed. Update CLAUDE.md's Map
  Control Positions list when the vocabulary rewrite happens.
- **GPS blue dot / heading cone / Destination widget**: unaffected by any
  of this — already global/always-present per CLAUDE.md's Live Location &
  Heading and Destination Marker sections, independent of current-area
  status.
- **Switching current area**: reuses the existing area open/close code path
  (today's transition from tapping "back to summary" then a different
  area) — build the virtual-layer bundle + toolbox for the incoming area,
  release the outgoing one. See Discard Lifecycle below for what "release"
  actually means; it is not an immediate teardown.
- **Losing current status has two distinct paths, different cost**:
  - *Zoom out below N while bbox stays in viewport*: the outgoing area's
    content is still geographically on screen, so it needs an actual hide
    step — same rendering-state swap already implied by the `loaded` →
    `outline`/`circle` transition. Toolbox flips to summary.
  - *Pan the bbox fully out of the viewport*: no explicit hide step for
    the virtual-layer bundle — its content is already outside the visible
    area, so it's not visible whether or not it's detached from the map.
    Only the toolbox needs to flip to summary. (Base layers still follow
    their own Hide trigger per Load/Hide Triggers above, unchanged — this
    only simplifies the virtual-layer bundle's handling.)

## Discard Lifecycle (two-phase)

Discard is not a single step — splitting it avoids paying rebuild cost for
the common case of jittering back and forth across the load threshold.

- **Hide (immediate)**: when an area's bbox leaves the viewport (see
  above), hide its Leaflet layer — detach from rendering / set invisible.
  The `GeoLayer` runtime object and its parsed GeoJSON stay fully resident
  in memory, untouched. This must be instant: no re-parse, no rebuild.
  Covers rapid pan/zoom in and out of the same area.
- **Destroy (deferred)**: actual memory release only happens as a side
  effect of loading a genuinely new area — one not already resident,
  hidden or visible. At that point, sweep currently-hidden areas and
  destroy their `GeoLayer` objects, dropping the parsed GeoJSON and
  freeing memory. Areas you keep revisiting within the same neighborhood
  never get destroyed; memory only frees up once you've moved on to
  explore somewhere genuinely new.

**The current-area virtual-layer bundle (POI/User/Void/Search views +
toolbox) follows this exact same two-phase split**, keyed off current-area
transitions rather than viewport intersection: losing current-area status
hides the bundle instantly (Leaflet-only, no rebuild — the outgoing area's
`PoiLayerView`/`UserLayerView`/etc. instances and their state stay resident
and hidden), and it is destroyed only when a *different* area becomes
current, not merely when it stops being current. Re-entering the same area
repeatedly (zoom out then back in) never rebuilds the bundle — it's a plain
show/hide toggle, same cost as any other Leaflet layer visibility flip.

## Hide/Destroy vs. Reload (important distinction)

Two different things, must not be conflated:

- **Hide** (immediate): visually detaches the Leaflet layer but keeps the
  `GeoLayer` object and parsed data fully resident. Cheap, frequent,
  driven by viewport.
- **Destroy** (deferred): actually releases a hidden `GeoLayer` object and
  its parsed GeoJSON. Triggered only when loading a genuinely new area.

Destroying a layer means re-entering that area later requires a fresh
network fetch + re-parse of its GeoJSON — same as today's on-demand,
cache-bypassed `GeoArea`/`GeoLayer` fetches (see CLAUDE.md's Data Loading
Indirection). No service worker or other caching layer sits in front of
area/layer data; there is nothing to add for this feature.

## Non-Goals

- **Deduplicating overlapping area data is out of scope for geo-browser.**
  If two areas' bboxes overlap and both load concurrently, any duplicate
  features are a data problem, not a rendering problem. Handled upstream
  in `geo-builder` at publish time: areas get a `priority` field in the
  catalog, and the builder joins/strips overlapping features from the
  lower-priority area's GeoJSON before it's published. geo-browser should
  never receive duplicate features in the first place — no live join logic
  belongs here.

## Open Items for CC

- N starts at 48px (above) — needs on-device confirmation, may get
  retuned.
- Offline behavior: area/layer fetches are always network, never SW-cached
  (above), so going offline mid-session just fails the fetch — same as
  today's single-current-area behavior. No special handling identified;
  flagged here only in case CC finds a reason otherwise during
  implementation.

## Implementation Plan

Confirmed with the user during planning: tap-to-jump on a circle/outline
area marker is kept — tapping pans/zooms the shared map to fit that area's
bbox, letting the viewport-driven state machine naturally promote it to
current (preserves today's `BubbleWidget` click → detail navigation).

### Architectural shape

```text
Controller (app/controller.ts)
  owns MapView (new, single instance, session-lifetime)
    owns one L.Map (created once, never destroyed until app teardown)
    owns AreaLifecycleTracker (new, pure state machine — the centerpiece)
    owns one AreaMarkerView per catalog area (successor of BubbleWidget)
    owns AreaBaseLayerRenderer per currently-resident area (N-concurrent)
    owns 0-or-1 CurrentAreaBundle (renamed/slimmed DetailView)
    owns global widgets, now constructed once instead of per-area:
      GeoLocationWidget, DestinationWidget, ImageOverlayWidget,
      DesignToolbarControl
```

`SummaryView`, `DetailView` (as a `View`), `SummaryControl`, and
`Controller.openSummary()`/`openDetail()`/the `lastView.mode` persistence
axis are all deleted.

### New pure state classes (build and test first, in isolation)

Mirrors the existing `VoidVariantResolver`/`DetailViewState` pattern:
Leaflet-free, DI-free, plain data in/out.

- **`src/geo/mercator.ts`** — extracts the Web Mercator meters-per-pixel
  formula duplicated in `BubbleWidget.computeRadius()` and
  `GeoArea.radiusMeters` into one place: `metersPerPixel(lat, zoom)`,
  `bboxPixelSize(bbox, zoom)`, `boundsIntersectBbox(bbox, viewport)` (a
  generalized extraction of `DetailView.isBboxVisible()`).
- **`src/view/map/areaRenderClassifier.ts`** —
  `AreaRenderClassifier.LOAD_THRESHOLD_PX = 48` and `classifySize(bbox,
  viewport, zoom): "small" | "big"`. Pure pixel-size check, no residency
  state.
- **`src/view/map/currentAreaSelector.ts`** —
  `CurrentAreaSelector.selectNearest(candidates, viewportCenter)`,
  extracted from `SummaryView.findAreaInBounds()`'s nearest-centroid
  search. Reused both for current-area selection and the fallback pin.
- **`src/view/map/areaLifecycleTracker.ts`** — the state machine: per-area
  `renderKind` (circle/outline/loaded), residency (none/hidden/visible),
  the fallback pin, current-area selection, and the bundle action
  (`none`/`hide`/`hide-skipped`/`show`/`build`). `recompute(viewport)`
  returns a diff (`toLoad`/`toShow`/`toHide`/`toDestroy`/`bundle`) that
  callers apply mechanically — no Leaflet or `GeoArea`/`GeoLayer`
  references inside, only plain `{id, bbox, center}` tuples.

  **Interpretation decision, made explicit here**: the Hide bullet above
  says "bbox no longer intersects," but the state table's `loaded` row
  requires size≥N *and* loaded, and the Current Area section says
  zoom-out-below-N "needs an actual hide step." This tracker fires Hide
  whenever `intersects && size≥N` (`loadEligible`) flips false for
  *either* reason — lost intersection or dropped below 48px while still
  on-screen — reconciling the table with the bullet text.

  `toDestroy` only fires alongside a `toLoad` for a genuinely new
  (never-resident) area in the same `recompute()` call. Losing current
  status keeps `_bundleAreaId` set (bundle stays hidden-resident, not
  cleared) so re-entering the same area is always the cheap `show` path —
  no hysteresis anywhere.

  Test file `tests/unit/view/map/areaLifecycleTracker.test.ts` is the
  highest-value test in the feature — scripted `recompute()` sequences
  covering: threshold crossing both directions, intersection-loss vs
  size-loss Hide, two concurrently-loaded overlapping areas,
  re-entry-is-cheap, destroy-only-on-genuinely-new-area, fallback pin
  appearing/dropping, direct current-area switch between two
  simultaneously-loaded neighbors.

### Wiring

- **`Controller`**: delete `openSummary`/`openDetail`/`switchView`/
  `_summaryViewState`/`_detailViewState`/`_view`, replaced by one
  `_mapView: MapView` built once in `start()`. `commitArea()`'s
  `openDetail(areaId)` tail becomes `this._mapView.addAreaAndFocus(areaId)`.
  `setLayerVisible()` routes through `MapView` to whichever
  `CurrentAreaBundle`/`AreaBaseLayerRenderer` currently owns that area.
  Delete `openSummary`/`openDetail` from `ControllerActions`.
- **`src/view/map/mapView.ts`** (new): owns the single `L.Map`, registers
  one `onZoom`+`onMoveEnd` handler (collapsing `SummaryView.onZoomChange`,
  `DetailView.onZoomChange`, `DetailView.onMapMoveEnd` into one
  `handleViewportChange()`) that calls `tracker.recompute()` and
  mechanically applies the diff. Also owns `GeoLocationWidget`,
  `DestinationWidget`, `ImageOverlayWidget`, `DesignToolbarControl` — all
  hoisted to single session-long instances (all four already confirmed
  area-agnostic: `DestinationWidget`/`LocalStorageDestinationStore` fully
  global, `GeoLocationWidget` has no area references, `ImageOverlayWidget`'s
  3-DOF snapshot already survives view recreation today via a bare
  module-level `let _snapshot`).
- **`src/view/detail/detailView.ts` → `src/view/detail/currentAreaBundle.ts`**
  (rename + slim, reusing this code path rather than rewriting it): remove
  map ownership (`createMap`, `applyMaxBounds`, minZoom/max-bounds
  clamping — see Confirmed Behavior Changes), remove `SummaryWidget`/
  `SummaryControl` construction, remove `GeoLocationWidget`/
  `DestinationWidget`/`ImageOverlayWidget` construction (hoisted to
  `MapView`). Add `attach()`/`hide()`/`show()` alongside existing
  `destroy()`. Keep unchanged: `renderLayerViews()`, `renderVoidLayer()`,
  `syncPoiSourceVisibility()`, all `onUserPoint*`/`onPoi*`/
  destination-callout/search handlers, `synthesizeUserLayerView()`/
  `synthesizeSearchLayer()`.
- **`LayerView` base class**: add `hide()`/`show()` (detach/reattach the
  Leaflet group, no rebuild) — distinct from the existing manual-toggle
  `destroy()`/recreate path in `renderLayerViews()`, unchanged.
  `PointLayerView` needs a small refactor to route its markers through
  `LayerFactory.createLayerGroup()` so the base-class hide/show works
  uniformly; check `PoiLayerView`/`UserLayerView` similarly.
- **State classes**: `SummaryViewState` → `MapViewState` (keep
  `center`/`zoom`, drop `selectedAreaId`/`hoveredAreaId` — grep-confirmed
  dead). `DetailViewState` → `AreaViewState` (drop `center`/`zoom`, keep
  `areaId`+`visibleLayers`). `GeoStateStore`/`GeoState`: drop
  `loadLastView`/`saveLastView`/`LastViewData` entirely. Storage keys
  rename — accept the one-time loss of existing users' saved
  viewport/layer-visibility prefs on upgrade (low-stakes UI preference,
  distinct from `__user__` points which live under an untouched key).
- **`src/catalog/*`**: **zero changes**. Residency lives entirely inside
  `AreaLifecycleTracker`, keyed by plain area-id strings, not on
  `GeoArea`. `GeoLayer.invalidate()` (already exists) is reused verbatim
  as the Destroy primitive.

### Confirmed behavior changes (call out in the PR description, not silent)

- **Per-area max-bounds/minZoom clamp is removed.** One shared map can't
  be clamped to a single area's bounds while several may be concurrently
  loaded, so this goes away — the viewport-driven state machine is the
  only "am I still here" mechanism going forward.
- **`GeoLocationWidget`'s follow-toggle bounds gate is dropped**
  (`undefined` instead of the current area's padded bbox) — it becomes a
  single session-long instance with no one area to source a bound from.
- **`SummaryControl` is deleted** — leaving is automatic (zoom/pan out).

### Phased sequencing

1. **Pure state machine** — fully additive, nothing else imports it yet.
2. **`LayerView.hide()/show()`** + `PointLayerView` group refactor —
   additive, zero behavior change.
3. **Build `MapView`/`AreaMarkerView`/`AreaBaseLayerRenderer`/
   `CurrentAreaBundle`** alongside the old views, not yet wired into
   `Controller`. Biggest phase.
4. **Controller cutover** — rewire `start()`/`commitArea()`, migrate state
   classes, update `controller.test.ts`. Gate on manual on-device smoke
   testing.
5. **Deletion pass** — remove `summaryView.ts`, old `detailView.ts`,
   `SummaryControl`, superseded test files; grep for leftover references.
6. **Docs** — CLAUDE.md's Summary/Detail vocabulary section, Naming Rules
   examples, Map Control Positions list, `docs/IMPLEMENTATION.md`,
   `README.md`. Non-blocking per this spec, but a real immediate
   follow-up, not indefinitely deferred.

### Verification

- Unit tests at every phase (Vitest, `happy-dom`, no Leaflet imports, no
  network). `areaLifecycleTracker.test.ts` is the primary correctness
  investment.
- `npm run test:run` and `npx tsc --noEmit` clean before each phase lands.
- N=48px needs on-device confirmation (not verifiable in this
  environment) — exported as a single named constant so retuning is a
  one-line change.
- Manual smoke checklist for Phase 4 (device/browser required): pan/zoom
  across two adjacent loaded areas without losing data; zoom out below
  threshold and back on the same area (bundle must not rebuild — check
  devtools for no re-fetch); pan over open water to trigger the fallback
  pin; commit a new area in design mode and confirm it becomes current
  automatically; tap a circle/outline marker and confirm it pans/zooms to
  become current.
