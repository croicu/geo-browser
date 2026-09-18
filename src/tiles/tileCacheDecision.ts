// Pure decision logic for tile-layer selection/rebuilding -- extracted from leafletFactories.ts
// (Leaflet-free) so it's unit-testable, per CLAUDE.md's rule that unit tests must not import
// Leaflet. See geo-browser#103.

// Whether the current area's tile layer should be the *write-through* caching layer
// (CachingTileLayer -- manual fetch-first, records into the cache) rather than the always-on
// read-fallback layer (OfflineFallbackTileLayer -- native <img>, cache-read only as a fallback on
// load failure; see leafletFactories.ts). Recording (write-through) always needs it. So does
// `?debug` alone, even with recording off -- read-only (writeThrough stays false), purely so the
// cache-hit debug marking has something to show while just browsing an area recorded earlier.
// Outside `?debug`/recording, OfflineFallbackTileLayer is used instead of this one -- its native
// `<img src>` primary path avoids CachingTileLayer's manual fetch/blob/object-URL overhead
// (confirmed as a live perf regression once already when that was unconditional), while still
// reading the cache as a fallback so ordinary (non-recording, non-debug) browsing still benefits
// offline -- see the "no fallback for ordinary browsing" gap this fixed, below.
export function shouldUseCachingLayer(recording: boolean, debug: boolean): boolean {
    return recording || debug;
}

// Whether a tile-cache state change (recording toggle and/or current-area change) requires
// rebuilding the tile layer (remove + re-add, forcing every visible tile to re-run createTile()).
// Both CachingTileLayer and OfflineFallbackTileLayer are area-scoped -- each owns a TileFetcher
// tied to one specific area's Cache API store -- so ANY area change requires a rebuild now, not
// just while recording/debug is active (unlike an earlier version of this function, when a
// non-caching area still used a plain, area-agnostic L.tileLayer). A recording toggle always
// rebuilds too: it switches between OfflineFallbackTileLayer and CachingTileLayer for the exact
// same area -- two different classes with different behavior, and each layer's mode is fixed at
// construction.
export function shouldRebuildTileLayer(wasRecording: boolean, isRecording: boolean, areaChanged: boolean): boolean {
    return wasRecording !== isRecording || areaChanged;
}
