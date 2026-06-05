# User Bookmarks

Feature spec for Claude Code. PM sign-off: complete.

**Status**: Done

---

## Overview

Users can bookmark any location to mark it as a place they plan to visit. The bookmark appears in the same callout row as the star rating, and renders as a distinct blue marker on the map.

---

## Entry Points

The bookmark toggle lives in the star callout row — same callout, same interaction pattern as starred user points. See `starred_user_points.md` for full callout behavior. ![Bookmark Icon](../public/icons/bookmark.svg)

- Callout shows: **blue bookmark icon** + **star row**
- User can set a bookmark, stars, both, or neither
- Tapping the bookmark icon toggles it on; tapping outside saves the current state

---

## Semantics

| State | Meaning |
|---|---|
| Bookmark only | Want to visit |
| Stars only | Was here |
| Bookmark + stars | Was here (and had bookmarked it beforehand) |
| Neither | Was here, nothing to report |

---

## Data Model

Add one optional boolean field to the user point schema:

```ts
bookmarked?: true;
```

- Absent = not bookmarked. No `false`.
- Orthogonal to `stars` — either, both, or neither can be set.
- Backward compatible with existing saved points.

---

## Rendering

- Bookmarked user points render with a **blue marker** — visually distinct from plain user points.
- Non-bookmarked user points render as today.
- Exact marker styling TBD at implementation time alongside POI styling details (Alexandru will provide).

---

## Architecture Constraints

Same as `starred_user_points.md`:
- Controller owns all persistence.
- Bookmark toggle widget lives in `view/`, emits intent only.
- No Leaflet imports outside `leafletFactories.ts`.
- IndexedDB only — fully offline.
