import { fail } from "../errors";
import type { AreaSummary, Catalog } from "../protocols";
import { getLogger } from "../services";
import { GeoArea } from "./area";
import { resolveUrl } from "./loader";

export class GeoCatalog {
    private readonly catalogUrl: string;
    _version?: number;
    _createdAt?: string;
    private _areas: GeoArea[] | undefined;

    constructor(catalogUrl: string) {
        this.catalogUrl = catalogUrl;
    }

    async load(): Promise<void> {
        if (this._areas) {
            return;
        }

        const response = await fetch(this.catalogUrl, { cache: "no-store" });

        if (!response.ok) {
            fail("catalog.load_failed", `Failed to load catalog: ${this.catalogUrl}`);
        }

        let catalog: Catalog;
        try {
            catalog = (await response.json()) as Catalog;
        } catch {
            getLogger().warning("catalog.parse_failed", { url: this.catalogUrl });
            this._areas = [];
            return;
        }

        this._version = catalog.version;
        this._createdAt = catalog.createdAt;
        this._areas = catalog.areas.map((area: AreaSummary) => {
            const manifestUrl = resolveUrl(area.manifestUrl, this.catalogUrl);
            return new GeoArea({ ...area, manifestUrl });
        });
    }

    get version(): number | undefined {

        return this._version;
    }

    get createdAt(): string | undefined {

        return this._createdAt;
    }
    
    get areas(): readonly GeoArea[] {
        if (!this._areas) {
            fail("catalog.not_loaded", "Catalog not loaded");
        }

        return this._areas;
    }

    getArea(areaId: string): GeoArea {
        if (!this._areas) {
            fail("catalog.not_loaded", "Catalog not loaded");
        }

        const area = this._areas.find((area) => area.id === areaId);

        if (!area) {
            fail("catalog.area_not_found", `Area not found: ${areaId}`, undefined, { areaId });
        }

        return area;
    }
    
    isLoaded(): boolean {

        return this._areas !== undefined;
    }

    addArea(summary: AreaSummary): void {
        if (!this._areas) {
            fail("catalog.not_loaded", "Catalog not loaded");
        }

        const manifestUrl = resolveUrl(summary.manifestUrl, this.catalogUrl);
        this._areas = [...this._areas, new GeoArea({ ...summary, manifestUrl })];
    }
}