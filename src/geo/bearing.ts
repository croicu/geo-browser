function toRadians(deg: number): number {
    return (deg * Math.PI) / 180;
}

function toDegrees(rad: number): number {
    return (rad * 180) / Math.PI;
}

// Standard great-circle initial bearing between two lat/lng pairs, in degrees [0, 360).
// Pure geometry — not compass heading. See tasks/destination_marker.md.
export function computeBearing(from: [number, number], to: [number, number]): number {
    const lat1 = toRadians(from[0]);
    const lat2 = toRadians(to[0]);
    const deltaLon = toRadians(to[1] - from[1]);

    const y = Math.sin(deltaLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);
    const bearing = toDegrees(Math.atan2(y, x));

    return (bearing + 360) % 360;
}
