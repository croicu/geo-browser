# Zoom-out Bug

Status: Ready to Submit

## Problem

Zooming out from the detail view back to summary produced two symptoms:

1. **Bounce** — the map snapped back to the detail view immediately after transitioning to summary.
2. **Crash** — `TypeError: Cannot read properties of undefined (reading '_leaflet_pos')` after the second zoom-out cycle.

## Root Causes

### Bounce (secondary cause of crash)

`detailView.onZoomChange` saved the summary viewport with `zoom = map.getZoom()`.
When `minZoom ≥ 11`, the summary map opened at zoom ≥ 11, causing `summaryView.onZoomChange`
to immediately fire and re-call `openDetail`. The map appeared to "bounce back."

Fix: clamp the saved summary zoom to `Math.min(zoom, 10)` so summary always opens below
the detail trigger threshold (11).

### Crash

`applyMaxBounds` calls `setMinZoom(N)`. If the current map zoom < N, Leaflet calls
`setZoom(N)` internally, which schedules a zoom animation via `requestAnimationFrame`.

The rAF callback runs `_animateZoom`, which fires the `zoomanim` event. Leaflet's own
`_createAnimProxy` listens to `zoomanim` and, as a workaround for browsers that don't
fire `transitionend` when the transform is unchanged, calls `_onZoomTransitionEnd()`
**synchronously** when the CSS transform didn't change.

`_onZoomTransitionEnd` → `_moveEnd` → fires `zoomend` → our `onZoom` listener fires →
`onZoomChange(minZoom)` → `zoom ≤ this._minZoom` → `openSummary()` → `switchView` →
`detailView.destroy()` → `map.remove()` → `delete this._mapPane`.

Execution then returns from `fire('zoomanim')` back into `_animateZoom`, which calls
`_move(...)` → `_getMapPanePos()` → `getPosition(this._mapPane)` → crash because
`_mapPane` is now `undefined`.

Fix: in `setMinZoom` (LeafletMapHandle), snap to the target zoom **without animation**
before calling the native `setMinZoom`. This prevents Leaflet from scheduling the
animated zoom at all, so no rAF is queued and the re-entrant destruction can't occur.

## Fix

### `src/view/detail/leafletFactories.ts`

`setMinZoom` pre-snaps to the target zoom with `{ animate: false }` if the current
zoom is below the new minimum, then calls `this._map.setMinZoom(zoom)`. Since the zoom
is now equal to the minimum, Leaflet's guard `getZoom() < minZoom` is false and no
animation is scheduled.

### `src/view/detail/detailView.ts`

`onZoomChange` now saves `Math.min(map.getZoom(), 10)` for the summary viewport,
ensuring the summary never reopens at a zoom that would immediately re-trigger detail.
