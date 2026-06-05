# Feature Spec: Nominatim Place Search → `__search__` Layer

**Status: Done**

## Overview

A search widget in Detail view lets the user type a place name and find it on the map. Results come from Nominatim, bounded to the current area. The user inspects the results, selects the best match, and optionally promotes it to a persistent user-defined point via the existing map-tap flow.

This is the one intentionally online feature in an otherwise offline-first product.

-----

## Search Entry UI

A magnifying glass ![Search](../public/icons/search.svg) icon sits in the Detail view toolbar alongside existing controls.

Tapping it expands a text input anchored to the **top of the map**, full-width, with a **Go** button on the right.

- Tapping **Go** ![Go](../public/icons/go.svg) (or keyboard search/return) fires the query
- Tapping outside the input or pressing escape collapses it and clears any `__search__` results
- Query fires on explicit Go only — no debounced-as-you-type; keeps Nominatim usage clean and avoids partial-string noise

-----

## Nominatim Query

```
https://nominatim.openstreetmap.org/search
  ?q=<user input>
  &format=json
  &limit=5
  &viewbox=<area bbox: west,south,east,north>
  &bounded=1
  &addressdetails=0
  &accept-language=en
```

`bounded=1` — results strictly within the area bbox. The user is exploring this area; results outside it are noise.

**Usage policy:** valid `User-Agent` header required. One request per explicit Go action. Not polling, not debounced.

**Bbox source:** derive from the current area’s manifest or layer GeoJSON extents — whichever is already available on `AreaDetail`.

-----

## Result List

Appears below the search bar, above the map, as an ordered list of up to 5 items.

Each row shows:

- **Primary**: `display_name` truncated to ~60 chars
- **Secondary**: human-readable OSM type (e.g. “museum”, “street”, “park”) + distance from map center

Tapping a row:

1. Collapses the result list and search bar
1. Pans map to result coordinates
1. Drops a marker on the `__search__` layer with the display name as label

-----

## `__search__` Layer

Ephemeral virtual layer — same naming convention as `__poi__` (double-underscore prefix = virtual/system layer).

Rules:

- Never persisted, never in the manifest
- Not shown in the layer toggle UI
- Z-order above all other layers
- Holds **at most one marker at a time** — new search clears the previous marker

Cleared when:

- User starts a new search
- User navigates away from Detail view

-----

## Marker Tap → Promotion to User-Defined Point

Tapping the `__search__` marker behaves identically to tapping any point on the map — it triggers the existing user-defined point creation flow, with:

- **Coordinates** pre-filled from the Nominatim result
- **Label** pre-filled from `display_name` (user can edit before confirming)

No new persistence mechanism. The `__search__` marker is cleared once the user-defined point is created.

-----

## Offline Handling

Search bar is present but **disabled** when offline.

Inline label: *“Search requires a connection.”*

No dialog, no toast. Rest of the app is unaffected.

-----

## Notes for Claude Code

- **Bbox**: derive from area manifest or GeoJSON extents already available on `AreaDetail`
- **Marker tap**: wire to the same Controller intent as a map tap at those coordinates, with label pre-populated
- **`__search__` layer**: model after `__poi__` — virtual, Controller-owned, not in layer list
- **No new persistence**: promotion reuses the existing user-defined point flow entirely

This is a narrow, self-contained branch. No new persistence, no new point creation logic, no routing.