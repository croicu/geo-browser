import { resolveCatalogUrl } from "../catalog/loader";
import { ConsoleTelemetrySink, DefaultLogger } from "../logging";
import { setLogger, resetLogger } from "../services";
import { StorageGuard } from "./storageGuard";
import { WebViewHostService } from "./webViewHostService";
import { BrowserGeoLocationService } from "./browserGeoLocationService";
import { BrowserHeadingService } from "./browserHeadingService";
import type { GeoDataService, GeoLocationService, HeadingService, HostService, StorageService, Logger } from "../contracts";
import type { ResolveCatalogUrlOptions } from "../catalog/loader";
import type { LatLng } from "../protocols";

export type Mode = "browse" | "design";

export class Context {
    private static s_instance?: Context;

    private readonly _mode: Mode;
    private readonly _debug: boolean;
    private readonly _design: boolean;
    private readonly _initialCenter?: LatLng;
    private readonly _initialZoom?: number;

    private readonly _dataSource: GeoDataService;
    private readonly _storageGuard: StorageGuard;
    private readonly _logger: Logger;
    private readonly _host: HostService;
    private readonly _geoLocation: GeoLocationService;
    private readonly _headingService: HeadingService;

    public static get Instance(): Context {
        if (!Context.s_instance) {
            Context.s_instance = new Context();
        }

        return Context.s_instance;
    }

    public static reset(): void {
        Context.s_instance = undefined;
        resetLogger();
    }

    private constructor() {
        const params = new URLSearchParams(window.location.search);

        this._debug = this.hasValue(params, "debug");
        this._design = this.hasValue(params, "design");
        this._mode = this._design ? "design" : "browse";

        if (this._design) {
            this._initialCenter = this.parseCenter(params);
            this._initialZoom = this.parseZoom(params);
        }

        this._logger = new DefaultLogger(new ConsoleTelemetrySink());
        this._dataSource = {} as GeoDataService;
        this._storageGuard = new StorageGuard();
        this._host = new WebViewHostService(this._mode);
        this._geoLocation = new BrowserGeoLocationService();
        this._headingService = new BrowserHeadingService();

        setLogger(this._logger);
    }

    public setStorage(impl: StorageService): void {
        this._storageGuard.set(impl);

        if (this.debug || this.mode === "design") {
            this._storageGuard.nuke();
        }
    }

    public get isStorageLocked(): boolean {
        return this._storageGuard.isLocked;
    }

    public unlockStorage(): void {
        this._storageGuard.unlock();
    }

    public nuke(): void {
        this._storageGuard.nuke();
    }

    public get host(): HostService {
        return this._host;
    }

    public get geoLocation(): GeoLocationService {
        return this._geoLocation;
    }

    public get headingService(): HeadingService {
        return this._headingService;
    }

    public get mode(): Mode {
        return this._mode;
    }

    public get debug(): boolean {
        return this._debug;
    }

    public get design(): boolean {
        return this._design;
    }

    public get logger(): Logger {
        return this._logger;
    }

    public get dataSource(): GeoDataService {
        return this._dataSource;
    }

    public get storage(): StorageService {
        return this._storageGuard;
    }

    public async resolveCatalogUrl(): Promise<string> {
        return await resolveCatalogUrl(this.getCatalogOptions());
    }

    private getCatalogOptions(): ResolveCatalogUrlOptions {
        const base = import.meta.env.BASE_URL;

        if (this._debug) {
            return {
                headUrl: `${base}catalog.head.debug.json`,
                fallbackUrl: `${base}catalog.debug.json`,
            };
        }

        return {};
    }

    get initialCenter(): LatLng | undefined {
        return this._initialCenter;
    }

    get initialZoom(): number | undefined {
        return this._initialZoom;
    }

    private parseCenter(params: URLSearchParams): LatLng | undefined {
        const raw = params.get("center");
        if (!raw) return undefined;
        const parts = raw.split(",");
        if (parts.length !== 2) return undefined;
        const lat = Number(parts[0]);
        const lng = Number(parts[1]);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
        return [lat, lng];
    }

    private parseZoom(params: URLSearchParams): number | undefined {
        const raw = params.get("zoom");
        if (!raw) return undefined;
        const z = Number(raw);
        return Number.isFinite(z) ? z : undefined;
    }

    private hasValue(
        params: URLSearchParams,
        name: string
    ): boolean {
        const value = params.get(name);

        return value !== null && value !== "";
    }
}
