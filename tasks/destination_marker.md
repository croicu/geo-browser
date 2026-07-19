# Destination Marker + Bearing Cone

Status: Done

## Problem

Ody doesn't want routing — Google Maps already does that. What's missing is a
lightweight "which way is it, roughly" indicator layered on top of the existing
GPS blue dot, so he can glance at the map while walking and see both where he
is and which general direction his destination sits, without a route line or
turn-by-turn.

Canonical scenario: Ody sets a destination — e.g. "Ithaca, Royal Palace, Front
Entrance" — before or during a walk, then glances at the map periodically to
see it relative to his live position.

## What This Is Not

- Not routing. No path calculation, no distance-along-a-street logic.
- Not a second `DeviceOrientationEvent` consumer. The destination cone's
  direction is pure geometry (bearing between two coordinates), not compass
  heading. It needs zero new permissions.
- Not a `__user__` trip point. Trip points are rated/bookmarked places you've
  been or want to remember; a destination is a single, transient "where am I
  headed" target. Different lifecycle, different store.

## Design

### Marker + cone, not just a cone

Two visual pieces, both red (vs. blue for the live GPS dot/cone):

1. **Destination marker** — a fixed pin at the destination's lat/lng. Renders
   whenever it's in the current map viewport, independent of live position.
2. **Bearing cone** — anchored at the user's *current* GPS position (same
   anchor point as the existing blue heading cone), pointing along the
   great-circle bearing from current position to the destination. Recomputed
   on every position update. Visually: same cone shape/rendering as the blue
   heading cone, red instead of blue, different rotation source (bearing math,
   not compass).

Both are visible at once when a destination is set and GPS is active: you see
the pin in the distance (or off toward the edge of the viewport) and the red
cone on your own dot telling you which way to turn.

### Singular, not a collection

Only one destination can be active at a time — setting a new one replaces the
old one silently. This is the key difference from bookmarks (many allowed).

### Setting a destination

Via the existing POI callout / empty-space callout — same mechanism as
star/bookmark, not a new gesture. Add a fourth action to the callout's action
row (`PoiLayerView.buildPoiBottomRow` / `EmptyCalloutWidget`, per
`README.md`'s POI Actions section):

- **"Set as destination"** — tapping it stores the tapped location as the
  destination, replacing any existing one.
- When the callout being viewed *is* for the currently-active destination,
  this button becomes **"Remove destination"** instead (mirrors how Delete
  replaces Bookmark on an existing `__user__` point — see
  `tasks/explicit_point_delete.md`).

This action is independent of star/bookmark/delete — a point can be starred
*and* be the destination at the same time (a starred POI can also be where
you're headed). No mutual exclusivity needed.

### No GPS active

If the user hasn't enabled "follow me" (`GeoLocationWidget`'s live tracking),
the destination marker (the pin) still renders on the map at its fixed
location — it's just a point, doesn't need GPS. The bearing cone does not
render, since there's no current position to anchor it to or compute a bearing
from. No prompt-to-enable-GPS nag; the pin alone is still useful for the
pre-walk "where roughly is it" glance.

### Persistence

Survives app close/reopen. Global, not scoped per area (unlike `__user__`
points) — a destination is a single trip-level concept, and Ody may cross an
area boundary mid-walk without losing it.

## Implementation Plan

### Store

New `DestinationStore` interface, following the existing `UserPointsStore`
pattern (`runtime/userPointsStore.ts`), but **pure client runtime — no
`geo-builder` communication**. This is a personal, on-device concept with no
build artifact or cross-repo contract, unlike `__user__`/`__poi__`/`__void__`:

```ts
interface DestinationStore {
    get(): DestinationPoint | null;
    set(point: DestinationPoint): void;
    clear(): void;
}
```

- `LocalStorageDestinationStore` — the only implementation. Key:
  `geo-browser.destination` (global, no `areaId` suffix).
- No gateway variant, no `Context.mode` branching, no `docs/MESSAGING.md`
  change. If cross-device sync is ever wanted, that's the same Cloudflare
  Worker path already tracked for user points — see
  [User Points Service Worker](user_points_sw.md) — not a `geo-builder`
  concern either way.

`DestinationPoint` shape: `{ lat, lng, label? }`. `label` is whatever
display name the source POI/search result carried, for a future "heading to
___" readout — not required for this task's rendering.

### Rendering

New `DestinationWidget` (`view/detail/destinationWidget.ts`), sibling to
`GeoLocationWidget`, not a merge into it — keeps `GeoLocationWidget` focused on
"where/which way am I facing" and this one on "where am I headed," per the
existing separation of concerns between `__user__` and the GPS widget.

- Subscribes to `DestinationStore` for the current destination (or null).
- Subscribes to `Context.geoLocation` position updates — same source
  `GeoLocationWidget` already uses. Does **not** independently start/stop GPS
  tracking; it only renders the cone when a position stream is already active
  (i.e. "follow me" is on).
- Renders the fixed red marker whenever a destination exists.
- Renders the red bearing cone whenever a destination exists *and* a current
  position is available; hides the cone (marker stays) when position drops
  out (GPS disabled, or a `watchPosition` error).
- Bearing calculation: standard great-circle initial bearing formula between
  two lat/lng pairs — pure math, put it in a small pure function (e.g.
  `src/geo/bearing.ts`) so it's unit-testable without Leaflet, per the
  project's "unit tests must not import Leaflet" rule.
- Cone visual: reuse whatever SVG/rotation approach `GeoLocationWidget`'s
  heading cone already uses, parameterized by color (`#ED4231` red vs. the
  existing blue) and rotation source (bearing value vs. heading value) rather
  than duplicating the rendering code.
- Destination pin icon: `public/icons/destination.svg` (added), fill
  `#ED4231` — matches the cone color. Same icon doubles as the "Set as
  destination" callout button per below; the callout distinguishes "Set" vs.
  the active "Remove" state via a paired icon,
  `public/icons/remove_destination.svg` — same path, `fill="none"`, plain
  `#ED4231` outline stroke (default 1-unit width — an explicit 5-unit
  stroke was tried first and looked wrong: on this path's small inner
  circle, that width overwhelmed the hole and rendered as a solid blob
  instead of a hollow pin) — following the `bookmark.svg`/`solid_bookmark.svg`
  pattern, icon-swap only. A CSS `.active` background was tried as a
  secondary cue and dropped — rendered as a visibly wrong box around the
  icon, and the icon swap alone is sufficient (matches the bookmark button,
  which has no background treatment either).

### Callout wiring

- Add `onSetDestinationRequested` / `onRemoveDestinationRequested` intents to
  the POI/empty-space callout widgets, following the existing
  `onPoiStarSelected` / `onPoiBookmarkToggled` / `onDeleteRequested` pattern —
  views emit intent only, `Controller` owns the behavior
  (`Controller.doSetDestination` / `Controller.doRemoveDestination`).
- Controller checks `DestinationStore.get()` against the tapped point's
  coordinates to decide which label/action ("Set as destination" vs. "Remove
  destination") the callout should show.

### Logging

Per the Feature Completeness Rule: `destination.set.start/end/error`,
`destination.remove.start/end/error` via `getLogger()`.

### Tests

- Pure bearing function: unit tests, no Leaflet, no network.
- `DestinationStore` implementations: stub-based, following existing
  `UserPointsStore` test patterns.
- `Controller.doSetDestination`/`doRemoveDestination`: behavior/wiring
  assertions (store called correctly, correct intent emitted), not pixel
  layout.

### Docs

Per the Feature Completeness Rule, update in the same commit as the code:
- `README.md` — replace the "(Upcoming, separate task) Set as destination"
  placeholder in POI Actions with the real behavior; add a short "Destination"
  subsection near Trip Recording.
- `docs/MANIFEST.md` / `docs/LAYERS.md` / `docs/MESSAGING.md` — no change.
  This is pure client runtime with no `geo-builder` communication and no
  manifest/layer contract involved.

## Resolved

1. **No `geo-builder`/gateway involvement, at all.** Confirmed: this is a
   pure runtime scenario, not a cross-repo contract. `DestinationStore` has
   exactly one implementation (`LocalStorageDestinationStore`); no
   `Context.mode` branching, no `docs/MESSAGING.md` changes, no design-mode
   variant. Implementation Plan and Docs sections above updated accordingly.
2. **Color confirmed: `#ED4231`** (not the `#e5484d` placeholder — briefly
   `#E04538` before a final adjustment) — applies to both the bearing cone
   and the destination pin/callout icon. `public/icons/destination.svg`
   added, fill `#ED4231`; paired `public/icons/remove_destination.svg`
   added later, same path, transparent fill, plain outline stroke in the
   same color.
3. **Z-order: destination visuals render *below* the blue GPS indicator.**
   Both the destination pin and the bearing cone are added to a dedicated
   `destination-pane` Leaflet pane (via `MapHandle.createPane`, same
   technique `VoidLayerView` uses for `void-pane`), with `zIndex` set
   explicitly below Leaflet's default `markerPane` (600) — e.g. `550`. This
   guarantees the blue dot/heading cone (rendered in the default marker
   pane by `GeoLocationWidget`) always paints on top, regardless of DOM
   insertion order between the two widgets.

## Implementation Notes (as-built)

- The destination marker pin is directly tappable — `onDestinationMarkerTapped`
  delegates to whichever callout the point would normally get: if a
  `__user__` point already exists at that exact lat/lng, it opens the same
  callout as tapping that marker (readonly/interactive stars, delete, no
  bookmark — matching `onUserMarkerTapped`); otherwise it opens the plain
  empty-space callout (interactive stars, bookmark toggle — matching
  `openStarCallout`). Either way `isDestination`/`onDestinationToggled` is
  layered on top. This is deliberate, not incidental: the destination toggle
  is independent of star/bookmark/delete, so tapping the pin must not hide
  those — it's the reliable removal path for a destination set from empty
  space (re-tapping the exact original coordinates isn't realistic), and it
  should offer the full set of actions, not a stripped-down "remove only"
  view. The POI/empty-space callout's own "Remove destination" button (via
  `isCurrentDestination` exact-match) remains a second path to the same
  toggle for POI-sourced destinations.
- Rating or bookmarking a point clears its destination status if that point
  is the current destination (`DetailView.maybeClearDestination`, called
  from every star/bookmark commit site: `onEmptyStarSelected`,
  `onPoiStarSelected`, `onPoiBookmarkToggled`, the pending-bookmark commit in
  `closeEmptySpacePopup`, and the existing-point re-rate handler in
  `onUserMarkerTapped`). Once you've acted on a point as a saved place, it's
  no longer just a pending nav target — this applies regardless of which UI
  path (pin tap, POI callout, empty-space callout) triggered the rating.
- Fixed a pre-existing bug this surfaced: `synthesizeUserLayerView` hardcoded
  `new DefaultLeafletLayerFactory()` instead of using the injected
  `this._layerFactory`, so any test path that lazily creates the `__user__`
  layer (e.g. rating a point for the first time) crashed against a stub map
  with an unhandled `map.addLayer is not a function` rejection. Fixed at
  that one call site only — `renderLayerViews`' heatmap/circle/POI branches
  and `VoidLayerView`'s construction have the same hardcoded-factory pattern
  but weren't touched here (pre-existing, out of scope, harmless in
  production since the real composition root always injects
  `DefaultLeafletLayerFactory` anyway — only bites stub-factory tests).
- Setting/removing a destination is immediate on tap (store write +
  `DestinationWidget.setDestination` call), not deferred like the
  empty-space bookmark flow — a destination never creates a `__user__`
  point, so there's no "only commit on dismiss" concern to replicate.
- `DestinationWidget` reuses `PositionMarkerHandle`'s existing
  `setLatLng`/`setHeading` shape for the cone (mechanically identical to
  the blue heading cone: an SVG polygon rotated by a degree value, hidden
  via `setHeading(null)`) rather than introducing a parallel type — the
  rotation source (bearing vs. compass heading) only differs in the caller,
  not the rendering contract.
- `public/icons/remove_destination.svg` pairs with `destination.svg` for the
  "Set" ↔ "Remove" callout states — same path, transparent fill, plain
  outline stroke in the same `#ED4231`, following the
  `bookmark.svg`/`solid_bookmark.svg` icon-swap pattern — icon swap only,
  no `.active` background (tried, dropped — see above).

## Testing

- `npx tsc --noEmit` — clean.
- `npx vitest run` — full suite green (239 tests, 27 files), including new
  coverage: `geo/bearing.test.ts`, `runtime/destinationStore.test.ts`,
  `view/destinationWidget.test.ts`, plus additions to
  `geoLocationWidget.test.ts` (onPositionUpdate), `emptyCalloutWidget.test.ts`
  (destination toggle), and `view/detailView.test.ts` (`describe("destination")`
  — set/remove via empty-space callout, active-state on re-tap, pin
  rendering, pin-tap → remove-only callout).
- `npm run build` — clean production build (`tsc && vite build`), new
  `destinationWidget.ts`/`bearing.ts`/`destinationStore.ts` modules
  transform without error.
- **Not done**: a live visual check in a real browser (map rendering, pin/
  cone placement, z-order against the actual blue dot, GPS-permission
  flow). This environment has no display and no way to spoof device GPS,
  so this is unverified beyond the unit-test/typecheck/build level —
  recommend a manual pass (paste a destination, toggle "follow me", confirm
  the red cone tracks bearing and stays under the blue dot) before
  considering this fully shipped.
