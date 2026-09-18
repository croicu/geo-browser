// Pure decision logic for when the tile layer should be cache-aware (CachingTileLayer) vs. a
// plain, fast L.tileLayer -- extracted from leafletFactories.ts (Leaflet-free) so it's
// unit-testable, per CLAUDE.md's rule that unit tests must not import Leaflet. See geo-browser#103.

// Recording (write-through) always uses the caching layer. So does `?debug` alone, even with
// recording off -- read-only (writeThrough stays false), purely so the cache-hit debug border
// (leafletFactories.ts's CachingTileLayer.createTile()) has something to show while just browsing
// an area that was recorded in an earlier session. Outside `?debug`, ordinary browsing with
// recording off must stay on the plain tile layer -- CachingTileLayer's manual fetch/blob/object-URL
// path is real per-tile overhead compared to a native `<img src>`, confirmed as a live perf
// regression once already when this was unconditional.
export function shouldUseCachingLayer(recording: boolean, debug: boolean): boolean {
    return recording || debug;
}

// Whether a tile-cache state change (recording toggle and/or current-area change) requires
// rebuilding the tile layer (remove + re-add, forcing every visible tile to re-run createTile()).
// - A recording toggle always rebuilds: the new layer's writeThrough flag is fixed at
//   construction, so this is the only way an enable/disable actually takes effect.
// - An area change only rebuilds when the caching layer is actually in use (recording, or
//   debug) -- otherwise the plain tile layer doesn't care which area is current, and rebuilding
//   anyway would flash the tiles for a change with no visible effect.
export function shouldRebuildTileLayer(
    wasRecording: boolean,
    isRecording: boolean,
    areaChanged: boolean,
    debug: boolean
): boolean {
    if (wasRecording !== isRecording) {
        return true;
    }
    return shouldUseCachingLayer(isRecording, debug) && areaChanged;
}
