import type { TileProvider } from "../maps/tileProvider";

export interface TileCoord {
    x: number;
    y: number;
    z: number;
}

// Builds the tile URL used as both the Leaflet tile request and the TileCacheStore cache key.
// Deliberately always uses the FIRST subdomain rather than Leaflet's own {s} round-robin: the
// same tile must map to the same URL on every request, or a tile cached under one {s} host could
// silently miss the cache when the round-robin later serves it from a different host. Losing
// subdomain-sharding's connection-parallelism benefit is an acceptable tradeoff for that
// correctness guarantee -- fetch() isn't gated by the same per-hostname connection limit {s}
// originally worked around for <img src>-based loading anyway.
export function buildTileUrl(provider: TileProvider, coord: TileCoord): string {
    const subdomain = provider.subdomains
        ? provider.subdomains[0]
        : "a";

    return provider.urlTemplate
        .replace("{s}", subdomain)
        .replace("{z}", String(coord.z))
        .replace("{x}", String(coord.x))
        .replace("{y}", String(coord.y));
}
