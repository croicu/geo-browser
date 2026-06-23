# Explicit Point Delete

**Status: Done**

-----

## Context

Long-press / right-click had grown into two different gestures: long-press (or right-click) on
empty map space silently created an unrated, unbookmarked user point, and right-clicking an
*existing* point deleted it instantly with no confirmation. Combined with the tap-to-create
callout (star/bookmark), there were two competing ways to create a point and one silent way to
destroy one.

This simplifies the model to a single rule: **a user point can only be created via single tap +
star rating or bookmark**, and **deleted only via an explicit delete button in the tap callout**.

## Changes

- Removed the map-level long-press and right-click (`contextmenu`) gesture handlers in
  `DetailView` that silently created a point (`MapHandle.onContextMenu` / `onLongPress` removed
  from `contracts.ts` and their Leaflet implementation, now unused).
- Removed the instant right-click-to-delete behavior on existing user markers/rings in
  `UserLayerView` (`ClickableMapLayerHandle.onContextMenu` removed from `contracts.ts`, now
  unused).
- Tapping an existing user point now always shows a delete button (`delete.svg`) in the callout's
  bottom row, in the same slot the bookmark toggle occupies on the *new point* creation callout.
  Stars remain interactive when unrated, read-only once rated. The bookmark toggle no longer
  appears on the existing-point callout — deletion is now the single, explicit way to remove a
  point regardless of its star/bookmark state.
- `EmptyCalloutWidget` gained `onDeleteRequested`; when provided it takes priority over
  `onBookmarkToggled` in the bottom row (the two are mutually exclusive — bookmark is for
  creation, delete is for an existing point).
- New-point creation (single tap on empty space) is unchanged: stars or bookmark, as before.
- Search-marker-tap-to-promote (`onSearchMarkerTap`) is unchanged — it's a deliberate single-tap
  gesture, not the long-press/double-click path being removed here.
- The new-location callout is now gated by zoom, same threshold as the `__poi__` layer: tapping
  empty space below that zoom is a noop (no popup). `DetailView.poiMinZoom()` reads the area's
  `__poi__` layer `style.minZoom`, defaulting to 16 if the layer or that field is absent. All
  shipped manifests set `__poi__` `minZoom` to 16.

## Testing

- `tests/unit/emptyCalloutWidget.test.ts`: delete button visibility, click wiring, priority over
  bookmark toggle.
- `tests/unit/view/detailView.test.ts`: tapping an existing user marker and clicking delete
  removes the marker and closes the popup.
- Full suite + `tsc --noEmit` + `npm run build` all green.
