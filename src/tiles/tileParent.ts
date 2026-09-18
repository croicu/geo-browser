import type { TileCoord } from "./tileUrl";

export interface ParentTileCrop {
    parent: TileCoord;
    // Normalized (0..1) crop rectangle within the parent tile's own image that corresponds to
    // the original tile's coverage -- multiply by the parent image's actual pixel dimensions to
    // get a canvas drawImage() source rectangle.
    cropX: number;
    cropY: number;
    cropSize: number;
}

// Computes the tile `levelsUp` zoom levels above `coord`, and the crop rectangle within that
// parent's image that covers the same ground as `coord` -- used to render a blurry placeholder
// (crop + scale via canvas) while the real tile is still loading over a slow/offline connection,
// instead of a blank rectangle. See geo-browser#103, leafletFactories.ts's OfflineFallbackTileLayer.
//
// Returns null once going further up would cross below `minZoom` -- reuses
// AreaRenderClassifier.MIN_LOADED_ZOOM as that floor (passed in by the caller rather than imported
// here, to keep this module Leaflet/view-free) since below that floor no area's tiles are
// meaningfully "nearby" either; a placeholder crop from that far out isn't worth showing.
export function computeParentTileCrop(coord: TileCoord, levelsUp: number, minZoom: number): ParentTileCrop | null {
    const parentZoom = coord.z - levelsUp;
    if (levelsUp < 1 || parentZoom < minZoom) {
        return null;
    }

    const scale = 2 ** levelsUp;
    const parentX = Math.floor(coord.x / scale);
    const parentY = Math.floor(coord.y / scale);
    const cropSize = 1 / scale;

    return {
        parent: { x: parentX, y: parentY, z: parentZoom },
        cropX: (coord.x - parentX * scale) * cropSize,
        cropY: (coord.y - parentY * scale) * cropSize,
        cropSize,
    };
}
