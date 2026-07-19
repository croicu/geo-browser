# Task: Documentation Audit — Undocumented Existing Features

Status: Done

## Findings vs. Original Brief

- README's "Layer Types" table already listed `__user__`/`__void__`/`__search__` (added in an
  earlier, undocumented pass) — the brief's premise that they were entirely missing was stale.
  The real gap was accuracy: the `__user__` row and the "Trip Recording" section still described
  the long-press/right-click creation gesture that [Explicit Point Delete](explicit_point_delete.md)
  removed. Fixed to describe the actual tap-callout flow.
- The brief's item #1 and #4 conflated `__user__` (trip points) with the live GPS blue dot +
  heading cone. They are unrelated: `__user__` is a manifest virtual layer (`UserLayerView`,
  persisted trip points); the blue dot/heading cone is `GeoLocationWidget`, a standing map
  control with no manifest presence at all, sourced from `Context.geoLocation` /
  `Context.headingService`. Documented both, correctly separated, in CLAUDE.md.
- Confirmed `UserPointsStore.setBookmarked` is a dead optional method — implemented by
  `LocalStorageUserPointsStore` but never called from `DetailView`. Not fixed (out of scope,
  doc-only task) — just didn't document behavior that doesn't happen.

## Second Pass — docs/ Cross-Reference Audit

User asked to also scan the "Completed Tasks" list in CLAUDE.md against the full `docs/`
directory (originally out of scope per this task's own "Out of Scope" section, then explicitly
re-included). Found and fixed:

- **docs/LAYERS.md**, **docs/MANIFEST.md**: void layer status header said the `geo-browser`
  runtime side (`VoidVariantResolver`, minimal-superset resolution) was "still a proposal" /
  "not yet shipped." It shipped — CLAUDE.md's Void Layer completed-task entry and
  `src/view/detail/voidVariantResolver.ts` confirm it. Fixed both.
- **docs/MANIFEST.md**: user point GeoJSON schema was missing `stars` and `bookmarked`, both
  real properties written by `UserLayerView`/`LocalStorageUserPointsStore`.
- **docs/MESSAGING.md**: `style.enhancedColor` default documented as `#003380`; actual code
  default (`poiLayerView.ts`) is `#20b7dd`. Also added `stars`/`bookmarked` to the
  `AddUserPoint.point.properties` description.
- **docs/PROTOCOL.md**: "supported layer types" list was missing `__void__` and `__search__`.
- **docs/IMPLEMENTATION.md**: directory tree was missing ~15 files that exist
  (`voidLayerView.ts`, `voidVariantResolver.ts`, `searchLayerView.ts`, `starRatingControl.ts`,
  `emptyCalloutWidget.ts`, `twoTapState.ts`, manifest-editor files, `blueDotDetector.ts`, etc.);
  the doc never mentioned Void/Search/star-ratings/bookmarks/empty-space-tap subsystems at all.
  Added directory entries and short architecture subsections for `VoidLayerView`,
  `SearchLayerView`, and `UserLayerView`'s creation/deletion/ring-priority rules.
- **docs/ROADMAP.md**: "Current Completed Foundation" stopped early and referenced the retired
  `TileProviderControl`; added ~13 missing completed items and corrected the control name.
- **docs/OVERVIEW.md**: "Stretch goals" and "Considered and Dropped" both still listed the
  screenshot-overlay feature as future/deferred work; it shipped (Image Overlay + Blue Dot
  Detection). Also added the heading-cone detail to the GPS notes section.
- **docs/PITCH.md**: "PWA... in progress" → shipped; added trip recording/search/image overlay
  to the status list.
- Not touched: **docs/ROADMAP.md**'s "Recommended Next Branches" section (still genuinely
  forward-looking, not re-verified item by item) and **docs/BRIEF.md** (not read this pass —
  user's instruction named OVERVIEW.md specifically, and BRIEF wasn't flagged in the scoping
  report). Worth a follow-up pass if BRIEF.md is meant to stay current too.
- Aside, not fixed: `src/contracts.ts`'s `GeoDataService` interface (and ROADMAP's "Data
  Source Abstraction" next-branch item describing it) has zero implementations anywhere in
  `src/` — catalog loading goes through direct `fetch()` in `catalog/loader.ts` instead. Dead
  interface, not a doc problem; flagging here in case it's worth deleting in a future code pass.

## Context

README.md, CLAUDE.md, PITCH.md, BRIEF.md, and OVERVIEW.md are out of sync with
the current app. Several shipped features have no documentation anywhere.
This task is a doc-only pass — no code changes — to close the gap before the
next feature (destination marker/cone) builds on top of undocumented pieces.

## Gaps to Close

### 1. README.md — "Layer Types" table

Currently lists only: `heatmap`, `points`, `__poi__`.

Missing rows to add (confirm exact current behavior in code before writing):

- `__user__` — virtual layer. Renders live GPS position as a marker (blue) plus
  a heading cone derived from device orientation (compass sensor).
- `__search__` — virtual layer. Renders active search results.
- `__void__` — virtual layer. (Purpose not yet confirmed — inspect code, document
  actual behavior.)

### 2. Bookmarks — no home in any doc

- Blue markers, placed via the POI callout (see #3 below).
- Multiple bookmarks allowed simultaneously.
- Document: where they're stored (state? persisted? which layer renders them?),
  how they're created/removed, and add a row/section in README.md.

### 3. POI callout actions — undocumented entirely

Current docs describe only the *popup metadata* (name, cuisine, address, hours,
star rating, Wikipedia/Wikidata links, thumbnail). They do not describe the
*action buttons* in the callout:

- Star (rating weight — confirm exact effect)
- Bookmark (add/remove — see #2)
- (Upcoming, separate task) Set as destination

Document this as its own subsection in README.md, distinct from the metadata
list already there.

### 4. Heading/orientation cone — undocumented concept

- Attached to the `__user__` marker.
- Sourced from `DeviceOrientationEvent` (device compass).
- iOS requires a one-time permission prompt for this API — note that in
  CLAUDE.md under an architecture/runtime note, since it affects `HostService`
  or equivalent permission-handling code path.

## Deliverable

- Updated README.md with corrected "Layer Types" table + new Bookmarks and
  POI Callout Actions sections.
- Updated CLAUDE.md with the orientation permission note and any architectural
  detail relevant to `__user__`, `__search__`, `__void__` that a future
  implementer would need (which files own them, DI pattern used, etc.).
- No changes to PITCH.md, BRIEF.md, or OVERVIEW.md — those are marketing/PM
  docs, not implementation docs, and are not in scope here.

## Out of Scope

- The destination marker/cone feature itself (separate task).
- Any vocabulary rewrite related to Summary/Detail → unified map view
  (separate, already-tracked task).
