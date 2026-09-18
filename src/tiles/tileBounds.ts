import type { TileCoord } from "./tileUrl";

export interface TileLatLngBounds {
    north: number;
    south: number;
    east: number;
    west: number;
}

// Standard slippy-map tile -> lng/lat conversion (Web Mercator), Leaflet-free so it's
// unit-testable per CLAUDE.md's "unit tests must not import Leaflet" rule. Used by
// leafletFactories.ts's CachingTileLayer to draw a debug-only rectangle overlay on cache-hit
// tiles -- see tile_caching.md: a CSS box-shadow on the tile <img> itself turned out to be
// invisible in practice (confirmed live: computed style showed the shadow correctly, but nothing
// rendered), so the debug marking moved to its own Leaflet vector layer in a dedicated pane
// instead, sidestepping whatever was suppressing the tile's own box-shadow paint.
function tileXToLng(x: number, z: number): number {
    return (x / Math.pow(2, z)) * 360 - 180;
}

function tileYToLat(y: number, z: number): number {
    const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
    return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

export function tileToBounds(coord: TileCoord): TileLatLngBounds {
    return {
        north: tileYToLat(coord.y, coord.z),
        south: tileYToLat(coord.y + 1, coord.z),
        west: tileXToLng(coord.x, coord.z),
        east: tileXToLng(coord.x + 1, coord.z),
    };
}
