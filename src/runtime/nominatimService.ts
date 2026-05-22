import type { PoiInfo, PoiRequest, PoiService } from "../contracts";

type NominatimAddress = {
    road?: string;
    house_number?: string;
    amenity?: string;
    neighbourhood?: string;
    suburb?: string;
    city?: string;
    town?: string;
    village?: string;
    country?: string;
};

type NominatimResponse = {
    lat: string;
    lon: string;
    class?: string;
    type?: string;
    name?: string;
    address?: NominatimAddress;
};

export class NominatimService implements PoiService {
    query(latLng: [number, number], onPoiInfo: (info: PoiInfo) => void): PoiRequest {
        let cancelled = false;
        const controller = new AbortController();

        const url = `https://nominatim.openstreetmap.org/reverse?lat=${latLng[0]}&lon=${latLng[1]}&format=json&addressdetails=1`;

        fetch(url, {
            signal: controller.signal,
            headers: { "User-Agent": "City Life" },
        })
            .then(r => r.json())
            .then((data: NominatimResponse) => {
                if (cancelled) return;
                onPoiInfo(mapResponse(data));
            })
            .catch(() => {});

        return {
            cancel(): void {
                cancelled = true;
                controller.abort();
            },
        };
    }
}

const CATEGORY_CLASSES = new Set(["amenity", "tourism", "shop", "leisure", "historic", "natural", "landuse"]);

function mapResponse(data: NominatimResponse): PoiInfo {
    const addr = data.address;
    const road = addr?.road;
    const houseNumber = addr?.house_number;
    const nameFromAddr = addr?.amenity;
    const resolvedName = data.name || nameFromAddr || undefined;
    const category = data.class && CATEGORY_CLASSES.has(data.class) ? data.type : undefined;

    return {
        source: "Nominatim",
        latLng: [Number(data.lat), Number(data.lon)],
        name: resolvedName,
        category: category ? category.replace(/_/g, " ") : undefined,
        address: road
            ? houseNumber ? `${road} ${houseNumber}` : road
            : undefined,
        neighbourhood: addr?.neighbourhood ?? addr?.suburb,
        city: addr?.city ?? addr?.town ?? addr?.village,
        country: addr?.country,
    };
}
