export interface NominatimResult {
    lat: string;
    lon: string;
    display_name: string;
    type: string;
    class: string;
}

export async function queryNominatim(
    q: string,
    bbox: [number, number, number, number]
): Promise<NominatimResult[]> {
    const [west, south, east, north] = bbox;
    const params = new URLSearchParams({
        q,
        format: "json",
        limit: "5",
        viewbox: `${west},${south},${east},${north}`,
        bounded: "1",
        addressdetails: "0",
        "accept-language": "en",
    });
    const response = await fetch(
        `https://nominatim.openstreetmap.org/search?${params.toString()}`,
        { headers: { "User-Agent": "geo-browser/1.0 (https://github.com/croicu/geo-browser)" } }
    );
    if (!response.ok) {
        throw new Error(`Nominatim query failed: ${response.status}`);
    }
    return response.json() as Promise<NominatimResult[]>;
}
