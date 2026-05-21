import type { PoiInfo, PoiRequest, PoiService } from "../contracts";

export class PoiServiceCollection implements PoiService {
    private readonly _services: PoiService[];

    constructor(services: PoiService[]) {
        this._services = services;
    }

    query(latLng: [number, number], onPoiInfo: (info: PoiInfo) => void): PoiRequest {
        const requests = this._services.map(s => s.query(latLng, onPoiInfo));

        return {
            cancel(): void {
                for (const r of requests) r.cancel();
            },
        };
    }
}
