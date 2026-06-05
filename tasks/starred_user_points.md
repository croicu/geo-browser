# Starred User Points

Feature spec for Claude Code. PM sign-off: complete.

**Status**: Done

## Implementation Plan

- `src/protocols.ts` — added `highlightColor?: string` to `LayerStyle` (mirrored in `docs/MESSAGING.md` and `docs/PROTOCOL.md`)
- `src/view/detail/starRatingControl.ts` — new reusable widget; interactive fills on tap, readonly shows value
- `src/view/detail/emptyCalloutWidget.ts` — refactored from `DetailView.buildEmptySpacePopupElement`; hosts coords + map links + `StarRatingControl`
- `src/view/detail/userLayerView.ts` — star ring via `highlightColor`; S and L scale with star count (5 = full, 1 = black); `addMarkerRing`, `getPointAtLatLng`, `onMarkerTapped` callback
- `src/view/detail/poiLayerView.ts` — `PoiLayerViewOptions`; star row appended to popup; readonly if user point exists
- `src/view/detail/detailView.ts` — long-press defers store write until callout resolves; short tap on empty creates starred point; POI tap routes via `onPoiStarSelected`; user marker tap shows readonly callout
- `src/style.css` — `.user-ring-marker`, `.star-rating`, `.star-rating--interactive .star-rating-star`
- `tests/unit/starRatingControl.test.ts` — 9 tests
- `tests/unit/emptyCalloutWidget.test.ts` — 9 tests

-----

## Overview

Users can assign a star rating (1–5) to any location on the map. Stars are assigned via a callout that appears on short tap or long press. The rating is stored on the user point and displayed read-only when the point is revisited.

-----

## Entry Points

### Long Press on Empty Map or POI

1. A user point marker is placed immediately at the pressed location.
1. The star callout opens attached to that marker.
1. User taps a star → point saved with that rating, callout dismissed.
1. User taps outside the callout → point saved with no rating, callout dismissed.

### Short Tap on Empty Map

1. The star callout opens at the tapped location. No marker placed yet.
1. User taps a star → marker placed, point saved with that rating, callout dismissed.
1. User taps outside the callout → callout dismissed, nothing created.

### Short Tap on POI

1. The existing POI detail callout opens (current behavior).
1. An interactive star row is appended to the callout (☆☆☆☆☆).
1. User taps a star → user point created at that POI location with that rating, callout dismissed.
1. User taps outside → callout dismissed, nothing created.

### Short Tap on Existing User Point (on empty map location)

1. Callout shows: GPS coordinates + Google Maps drop-pin link (already implemented) + assigned star count (read-only).
1. No re-rating UI.

### Short Tap on Existing User Point (on POI location)

1. Callout shows: POI details (existing) + assigned star count (read-only).
1. No re-rating UI.

-----

## Callout Summary Table

|Gesture   |Location                   |Callout Contents                               |Tap Star        |Tap Outside             |
|----------|---------------------------|-----------------------------------------------|----------------|------------------------|
|Long press|Empty map                  |Stars (interactive)                            |Save with rating|Save, no rating         |
|Long press|POI                        |Stars (interactive)                            |Save with rating|Save, no rating         |
|Short tap |Empty map                  |GPS + Google Maps link + stars (interactive)   |Save with rating|Dismiss, nothing created|
|Short tap |POI                        |POI details + stars (interactive)              |Save with rating|Dismiss, nothing created|
|Short tap |Existing user point (empty)|GPS + Google Maps link + star count (read-only)|—               |Dismiss                 |
|Short tap |Existing user point (POI)  |POI details + star count (read-only)           |—               |Dismiss                 |

-----

## Data Model

Add one optional field to the user point schema:

```ts
stars?: 1 | 2 | 3 | 4 | 5;
```

- Absent = unrated point. No `null`, no `0`.
- Backward compatible with any existing saved points.
- Edit path (re-rating an existing point) is deferred to V2 — do not implement, do not block.

-----

## Rendering

- All user points render as circle markers styled like POIs.
- Points with a star rating encode the rating **inside the marker** — exact visual treatment TBD at implementation time (Alexandru will provide POI styling details).
- Points without a rating render as plain markers.
- No badge, no label, no overlay outside the marker bounds.

-----

## Star Callout Widget

- ![Gold Star](../public/icons/gold_star.svg)
- ![Empty Star](../public/icons/empty_star.svg)
- 5 stars only (☆☆☆☆☆). No labels, no buttons, no title.
- Large tap targets — optimized for one-handed mobile use.
- Interactive state: unfilled stars, tap fills up to selected value.
- Read-only state: filled stars up to assigned count, no tap affordance.
- Dismiss animation should be quick and feel instant.

-----

## Architecture Constraints

- Controller owns all persistence — no direct storage calls from the view layer.
- The star callout widget lives in `view/` and emits intent only.
- No Leaflet imports outside `leafletFactories.ts`.
- All storage is IndexedDB — must work fully offline.
- Unit tests must not import Leaflet or hit the network.