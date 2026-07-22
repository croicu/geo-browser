// Web Mercator meters-per-pixel and bbox helpers shared by area-size and
// viewport-intersection checks. Single source of truth for the formula
// previously duplicated in BubbleWidget.computeRadius and GeoArea.radiusMeters.

const METERS_PER_DEGREE = 111320;
const EARTH_CIRCUMFERENCE_METERS = 40075016.686;

export function metersPerPixel(lat: number, zoom: number): number {
    return (EARTH_CIRCUMFERENCE_METERS * Math.abs(Math.cos(lat * Math.PI / 180)))
        / Math.pow(2, zoom + 8);
}

export function bboxPixelSize(
    bbox: [number, number, number, number],
    zoom: number
): { widthPx: number; heightPx: number } {
    const [west, south, east, north] = bbox;
    const lat = (south + north) / 2;
    const mPerPx = metersPerPixel(lat, zoom);

    const widthMeters = (east - west) * METERS_PER_DEGREE * Math.cos(lat * Math.PI / 180);
    const heightMeters = (north - south) * METERS_PER_DEGREE;

    return {
        widthPx: Math.abs(widthMeters) / mPerPx,
        heightPx: Math.abs(heightMeters) / mPerPx,
    };
}

export function boundsIntersectBbox(
    bbox: [number, number, number, number],
    viewport: { sw: [number, number]; ne: [number, number] }
): boolean {
    const [west, south, east, north] = bbox;
    return west < viewport.ne[1] && east > viewport.sw[1]
        && south < viewport.ne[0] && north > viewport.sw[0];
}
