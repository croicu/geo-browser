# TASK: Offline Tile Caching (record-while-browsing)

## Status: Testing

Tracked as [geo-browser#103](https://github.com/croicu/geo-browser/issues/103), `status:testing`
— implemented and unit-tested (372/372 tests pass, `tsc`/build clean). This went through many
live-testing round trips before actually working end to end on a real device: per-area cache
naming confirmed in DevTools; the cache-hit debug marking needed active recording to show at all
(fixed, see "`?debug` reads the cache" below); the marking then still didn't visibly render despite
the Cache API check working (fixed, see "Debug marking is a real Leaflet layer" below); a full
blank screen on offline cold-start turned out to be three separate service-worker/error-handling
bugs unrelated to tile caching itself (see geo-browser#107); and finally, once the app could at
least *start* offline, the map background was still blank because ordinary (non-recording,
non-debug) browsing never read the tile cache at all (fixed, see "Ordinary browsing... reads the
cache too" below) — this last one is the actual point of the whole feature, so it shipping broken
until a real offline field test caught it is the headline lesson of this task. This file is the
design history — the original spec below (bulk area pre-fetch) was scrapped mid-implementation
after confirming it violated OSM's tile usage policy outright, not just at scale. See **Design
history** at the bottom for the full arc; the **current design** section below is what's actually
implemented.

## Goal

Map tiles must be available offline for any area the user has viewed, matching the same
offline-first guarantee already given to POI GeoJSON. A network drop shouldn't blank the map
background even though POI data still renders.

## Current design: record-while-browsing, not bulk pre-fetch

- **OSM only, still the cached provider.** Carto Voyager stays online-only (never cached) — see
  [geo-browser#104](https://github.com/croicu/geo-browser/issues/104) for a separate, unrelated
  reason Carto isn't a good target right now (raster tiles need an API key this repo doesn't
  have, and are being retired by Carto anyway).
- **No bulk job.** There is no area-bbox enumeration, no zoom-range loop, no rate limiter, no
  resumable job. `TilePrefetchJob`/`tileMath.ts` (the bulk-prefetch machinery) were deleted
  outright, not just disabled.
- **Recording just flips write-through on/off** for whatever tiles Leaflet's own ordinary
  viewport-driven tile loading already requests — the same "modest, short-range look-ahead"
  every normal map view does. Nothing is pre-fetched ahead of what's actually being looked at.
  This is deliberately the **permitted** pattern in OSM's own policy, not a rate-limited version
  of the prohibited one.
- **UI**: a VCR-style widget — hollow red circle (idle, tap to start recording) / filled red
  square (recording, tap to stop) — plus a separate "clear cache" button (trash icon) that wipes
  every cached tile outright via the Cache API's `caches.delete()`.
- **Recording itself isn't bbox-scoped, but storage is per-area.** Recording follows wherever the
  viewport goes while it's on, not a pre-defined bbox. But which area's cache a fetched tile lands
  in *is* determined — by whichever area is current at fetch time — so each area gets its own
  named Cache API cache (`geo-browser.tiles.<areaId>`, `CacheApiTileCacheStore`) and its own
  `TileFetcher` (`getTileFetcherForArea()` in `leafletFactories.ts`). "Clear cache" wipes only the
  current area's cache, not every area ever recorded. A tile fetched near an area boundary is
  attributed to whichever area you were browsing it under at the time, not necessarily the
  geographically "closest" one — recording is still viewport-driven, not geometry-driven.
- **Recording never persists or auto-resumes.** It's a deliberate, in-the-moment toggle tied to
  this bundle's attach/hide/show/destroy lifecycle — reattaching always starts idle. What
  persists is only the tiles already written into the Cache API, which is exactly what you'd want
  ("what I've recorded so far stays cached") without needing any bookkeeping to make it happen.
- **Requests persistent storage the moment recording starts** (`src/runtime/storagePersistence.ts`,
  `navigator.storage.persist()`) — a real-world gap, not a hypothetical: recording a trip's cities
  well ahead of departure, then not reopening the app until arrival, is exactly the scenario
  WebKit's default "best-effort" storage mode risks losing to inactivity eviction. Fire-and-forget,
  safe to call unconditionally (guarded on the API's existence). On iOS this mainly pays off if the
  app is added to the Home Screen rather than kept as a plain Safari tab — that's the condition
  WebKit primarily grants persistent mode under.
- **Ordinary browsing (recording off, no `?debug`) reads the cache too, via `OfflineFallbackTileLayer`.**
  This is the actual point of the whole feature, and it shipped broken: `buildTileLayer()` originally
  only ever used a cache-aware layer while recording or under `?debug` — a plain `L.tileLayer`
  otherwise, which never touches the Cache API in either direction. Confirmed live, on the real trip
  this feature was built for: reopening the installed app fully offline (recording off, no debug
  flag — how the app actually gets used) showed a completely blank map background despite tiles
  genuinely being cached from an earlier recording session.
- **Cache-first, not fetch-first-with-fallback.** The first version of `OfflineFallbackTileLayer`
  used a native `<img src>` as the primary load path and only consulted `TileFetcher.tryCache()` on
  an `onerror` — which fixed the fully-offline case but did nothing for a slow/flaky connection,
  since a merely-slow load that eventually succeeds never fires `onerror` at all. Explicit
  correction: "if a tile is in the cache we should always display it, fetching from OSM is always
  best effort — this will also take care of slow networks." Rewritten so `createTile()` always
  checks the cache *first*: a hit displays immediately with zero network involvement regardless of
  connection speed; only a genuine miss falls through to a plain native `<img src>` (Leaflet's own
  `{s}`-rotating `getTileUrl()`, full connection-parallelism, best-effort — no special handling, a
  failed load here just doesn't show, exactly like an ordinary tile layer with no cache at all).
  Never writes to the cache — write-through stays exclusively tied to explicit recording.
- **`?debug` reads the cache even with recording off, via `CachingTileLayer` specifically.** The cache-hit debug marking (below) needs
  `CachingTileLayer` to actually run so it has something to show — but requiring the user to be
  actively recording just to *see* whether a tile is cached defeats the point of a diagnostic
  ("is my strategy working") that should work while just browsing normally. `src/tiles/tileCacheDecision.ts`'s
  `shouldUseCachingLayer(recording, debug)` returns true for `?debug` alone, and the resulting
  `CachingTileLayer` is constructed with `writeThrough: false` — it checks the Cache API first
  (so a tile cached in an earlier recording session shows its marking) but never persists a new
  fetch. Confirmed live as a real gap, not just a hypothetical: DevTools showed hundreds of tiles
  already cached for the current area while the map, viewed with recording off, showed zero
  markings — a plain `L.tileLayer` never consults the Cache API at all.
- **Debug marking is a real Leaflet layer, not CSS on the tile `<img>`.** The first version applied
  a `.tile-cache-hit-debug` class (inset `box-shadow`) directly to cache-hit tile images. Confirmed
  live that even after the fix above got the Cache API check running correctly, the marking still
  never rendered: `document.querySelectorAll('.tile-cache-hit-debug').length` matched
  `document.querySelectorAll('img.leaflet-tile').length` exactly (100% of visible tiles were
  genuine cache hits) and `getComputedStyle()` on one of them showed the box-shadow resolved
  correctly — yet nothing painted on screen. Root cause never identified (something else in the
  tile's own stacking/paint was evidently winning). Rather than keep fighting it, the marking moved
  to an actual Leaflet vector layer: `CachingTileLayer` now draws `L.rectangle` overlays for
  cache-hit tiles into a dedicated `tileCacheDebugPane` (its own pane, z-index above `tilePane`,
  `pointer-events: none` so it can't intercept taps meant for tiles/POIs underneath), added in
  `createTile()` on a hit and removed on that tile's `tileunload` event. `src/tiles/tileBounds.ts`'s
  `tileToBounds()` (pure Web Mercator tile-to-lat/lng math, unit-tested, Leaflet-free) computes each
  rectangle's geographic bounds from its `z/x/y`.

### Why this is compliant when the original design wasn't

OSM's tile usage policy (`operations.osmfoundation.org/policies/tiles/`) explicitly permits
"normal interactive viewing by a human where the client requests only the tiles needed for the
current viewport (with modest, short-range look-ahead typical of browsers)." Recording is exactly
that request pattern with write-through turned on — no different traffic shape, just an extra
cache write per response. The prohibited pattern is fetching tiles the user *isn't* currently
viewing (pre-seeding, background jobs, "download city for offline use" buttons) — which is
precisely what the deleted `TilePrefetchJob` did, rate limit or not.

## Non-goals

- No cache versioning/expiry by tile content freshness (map tiles don't change).
- No adaptive/manual zoom-level selection — recording just caches whatever zoom the user actually
  browses at.
- No cross-area tile sharing/dedup — a tile fetched under two different areas is stored twice, once
  per area's cache. Not worth the complexity for what's expected to be a small amount of overlap.

## Design history (for context — not the current plan)

<details>
<summary>Original spec: bulk area pre-fetch with adaptive zoom-step sizing (superseded)</summary>

The original design was a tap-to-cache widget that bulk-downloaded an entire area's tiles ahead
of time, across a zoom range (`MIN_LOADED_ZOOM..maxZoom`), rate-limited (small concurrency +
inter-batch delay) to read as "personal use" under OSM's tile policy rather than the
systematic/bulk pattern the policy targets.

Cut in order, each step during actual implementation/testing rather than upfront design review:

1. **Adaptive zoom-step sizing** (pick the coarsest zoom-skip pattern that fits available
   storage, interpolating skipped levels) — cut in favor of a simpler full-zoom-range,
   area-bbox-bounded, zoom-ascending strategy, before any code was written for it. Revisit only
   if storage limits are actually hit in practice — they never were, because the whole bulk
   approach was cut next.
2. **Live performance test found the real bottleneck wasn't the network — it was the rate limit
   itself.** A real area's top 2 zoom levels alone were 36,006 tiles; at the deliberately
   conservative `concurrency: 2` / `250ms` inter-batch delay, that's a ~75 minute floor for just
   those two levels, independent of how fast OSM actually responded.
3. **Verified live**: OSM's tile usage policy does not merely discourage bulk/offline downloading
   at scale — it explicitly names and prohibits the exact feature being built. Checked against
   the actual policy source repo (`openstreetmap/owg-website`, `policies/tiles.md`) history, not
   just current wording, to rule out "the policy just changed": "Bulk downloading... [c]ommon
   examples include creating a tile archive or downloading for offline usage. Bulk downloading is
   **prohibited**" was already present (in slightly different wording) as far back as the 2020
   rewrite (commit `93a35da2`), predating this feature by years. No amount of rate-limiting was
   ever going to make the bulk-pre-fetch design compliant — the use case itself, not the request
   rate, is what's prohibited. No official OSM mirror/CDN exists for bulk/offline access either;
   the policy itself points to third-party alternatives (Geofabrik Tile Packages, a keyed
   commercial provider, or self-hosting) for anyone who genuinely needs pre-seeded offline tiles.
4. **Redesigned as record-while-browsing** (this file's current design, above) instead of
   pursuing a compliant bulk-download alternative — sidesteps the policy question entirely rather
   than needing a paid/alternative tile source, at the cost of the offline coverage being
   whatever the user actually looked at instead of a chosen area's full extent.

The perf-instrumentation work done along the way (`Logger.perf()`, `TileFetcher.getStats()`)
survives the redesign as general-purpose infrastructure, even though the bulk job it was built to
diagnose is gone.

</details>
