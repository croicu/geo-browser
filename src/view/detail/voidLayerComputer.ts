export class VoidLayerComputer {
    // Returns effective distance = (dist to centroid) − (source radius in degrees).
    // Negative means the query point is inside a source circle.
    // Returns 0 when sources is empty.
    // sources: [lat, lon, radiusM]. radiusM = 0 for dimensionless point features.
    static nearestEffectiveDist(
        lat: number,
        lon: number,
        sources: [number, number, number][]
    ): number {
        const cosLat = Math.cos((lat * Math.PI) / 180);
        let minEffective = Infinity;

        for (const [sLat, sLon, radiusM] of sources) {
            const dLat = sLat - lat;
            const dLon = (sLon - lon) * cosLat;
            const distDeg = Math.sqrt(dLat * dLat + dLon * dLon);
            const radiusDeg = radiusM / 111320;
            const effective = distDeg - radiusDeg;
            if (effective < minEffective) minEffective = effective;
        }

        return minEffective === Infinity ? 0 : minEffective;
    }

    static pointInRing(lat: number, lon: number, ring: [number, number][]): boolean {
        let inside = false;
        const n = ring.length;
        for (let i = 0, j = n - 1; i < n; j = i++) {
            const [yi, xi] = ring[i];
            const [yj, xj] = ring[j];
            if (
                yi > lat !== yj > lat &&
                lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
            ) {
                inside = !inside;
            }
        }
        return inside;
    }

    static isExcluded(lat: number, lon: number, rings: [number, number][][]): boolean {
        for (const ring of rings) {
            if (VoidLayerComputer.pointInRing(lat, lon, ring)) return true;
        }
        return false;
    }
}
