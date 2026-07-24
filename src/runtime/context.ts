import { resolveCatalogUrl } from "../catalog/loader";
import { CompositeTelemetrySink, ConsoleTelemetrySink, DefaultLogger } from "../logging";
import { setLogger, resetLogger } from "../services";
import { StorageGuard } from "./storageGuard";
import { WebViewHostService } from "./webViewHostService";
import { GatewayTelemetrySink } from "./gatewayTelemetrySink";
import { BrowserGeoLocationService } from "./browserGeoLocationService";
import { BrowserHeadingService } from "./browserHeadingService";
import type { GeoDataService, GeoLocationService, HeadingService, HostService, StorageService, Logger, TelemetrySink } from "../contracts";
import type { ResolveCatalogUrlOptions } from "../catalog/loader";
import type { LatLng } from "../protocols";

export type Mode = "browse" | "design";

export class Context {
    private static s_instance?: Context;

    private readonly _mode: Mode;
    private readonly _debug: boolean;
    private readonly _groupFilter: string[] | null;
    private readonly _design: boolean;
    private readonly _assetsBase: string | undefined;
    private readonly _initialCenter?: LatLng;
    private readonly _initialZoom?: number;

    private readonly _dataSource: GeoDataService;
    private readonly _storageGuard: StorageGuard;
    private readonly _logger: Logger;
    private readonly _host: HostService;
    private readonly _geoLocation: GeoLocationService;
    private readonly _headingService: HeadingService;

    // Bound instance methods (not inline lambdas) so removeEventListener can find the
    // exact same reference addEventListener registered -- see removeGlobalErrorHandlers.
    private readonly _onWindowError = (event: ErrorEvent): void => {
        this._logger.fatal("window.uncaught_error", event.error ?? event.message);
    };

    private readonly _onUnhandledRejection = (event: PromiseRejectionEvent): void => {
        this._logger.fatal("window.unhandled_rejection", event.reason);
    };

    public static get Instance(): Context {
        if (!Context.s_instance) {
            Context.s_instance = new Context();
        }

        return Context.s_instance;
    }

    // Tears down the outgoing instance's global listeners before discarding it -- tests
    // construct a fresh Context per test (tests/setup.ts) while happy-dom's `window` is
    // shared for the whole test file, so skipping this would leak a listener pair per test.
    public static reset(): void {
        if (Context.s_instance) {
            Context.s_instance.removeGlobalErrorHandlers();
        }

        Context.s_instance = undefined;
        resetLogger();
    }

    private constructor() {
        const params = new URLSearchParams(window.location.search);

        this._debug = this.hasValue(params, "debug");
        this._groupFilter = this.parseGroupFilter(params);
        this._design = this.hasValue(params, "design");
        this._mode = this._design ? "design" : "browse";
        const assetsBaseRaw = params.get("assetsBase");
        this._assetsBase = assetsBaseRaw ? this.normalizeBase(assetsBaseRaw) : undefined;

        if (this._design) {
            this._initialCenter = this.parseCenter(params);
            this._initialZoom = this.parseZoom(params);
        }

        this._dataSource = {} as GeoDataService;
        this._storageGuard = new StorageGuard();
        this._host = new WebViewHostService(this._mode);
        this._geoLocation = new BrowserGeoLocationService();
        this._headingService = new BrowserHeadingService();

        const sinks: TelemetrySink[] = [new ConsoleTelemetrySink()];
        if (this._design && this._host.gateway) {
            sinks.push(new GatewayTelemetrySink(this._host.gateway));
        }
        const logCategories = this.parseLogCategories(params);
        // An explicit ?logCategory= wins outright over ?debug=1's "show everything" shorthand,
        // same precedent as parseGroupFilter's ?group=/?debug relationship -- it is never merged
        // in, so ?debug=1&logCategory=overpass shows only ["overpass"], not every category.
        const showAllCategories = this._debug && logCategories === null;
        const logCategoryExclude = this.parseLogCategoryExclude(params);
        this._logger = new DefaultLogger(new CompositeTelemetrySink(sinks), logCategories, showAllCategories, logCategoryExclude);

        setLogger(this._logger);
        this.installGlobalErrorHandlers();
    }

    // Catches exceptions/rejections that escape every try/catch in the app -- previously
    // invisible to Logger entirely (see tasks/logging_api.md). Always installed, in both
    // modes; only whether GatewayTelemetrySink is in the sink list (above) depends on mode.
    private installGlobalErrorHandlers(): void {
        window.addEventListener("error", this._onWindowError);
        window.addEventListener("unhandledrejection", this._onUnhandledRejection);
    }

    private removeGlobalErrorHandlers(): void {
        window.removeEventListener("error", this._onWindowError);
        window.removeEventListener("unhandledrejection", this._onUnhandledRejection);
    }

    public setStorage(impl: StorageService): void {
        this._storageGuard.set(impl);

        const willNuke = this.debug || this.mode === "design";
        this._logger.info("context.set_storage", { debug: this.debug, mode: this.mode, willNuke });
        if (willNuke) {
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

    public get groupFilter(): string[] | null {
        return this._groupFilter;
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
        if (!this._assetsBase) {
            return {};
        }

        return {
            headUrl: `${this._assetsBase}catalog.head.json`,
            fallbackUrl: `${this._assetsBase}catalog.json`,
        };
    }

    private normalizeBase(base: string): string {
        return base.endsWith("/") ? base : `${base}/`;
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

    // "debug" -> ["debug"] is a back-compat shorthand, only applied when ?group= is absent.
    // ?group=<present>, in any form, wins outright and disables the shorthand -- it is never
    // merged in, so ?debug=1&group=Europe yields ["Europe"], not ["debug", "Europe"].
    // Context.debug (the diagnostics flag) is unaffected either way -- see docs/MESSAGING.md.
    private parseGroupFilter(params: URLSearchParams): string[] | null {
        const groupRaw = params.get("group");
        if (groupRaw) {
            const groups = groupRaw.split(",").map((g) => g.trim()).filter((g) => g.length > 0);
            return groups.length > 0 ? groups : null;
        }

        if (this.hasValue(params, "debug")) {
            return ["debug"];
        }

        return null;
    }

    // ?logCategory=a,b enables only those log categories (a log call's category
    // defaults to "general" -- see DEFAULT_LOG_CATEGORY in src/logging.ts). Absent,
    // DefaultLogger falls back to enabling only "general" itself -- UNLESS ?debug is
    // set, in which case DefaultLogger's showAllCategories (wired from Context.debug,
    // not from this method) bypasses this allow-list entirely and shows every
    // category regardless. No shorthand/merge with ?group -- a separate axis.
    private parseLogCategories(params: URLSearchParams): string[] | null {
        return this.parseCommaList(params, "logCategory");
    }

    // ?logCategoryExclude=a,b unconditionally suppresses those categories -- wins outright
    // over both showAllCategories (?debug) and the ?logCategory= allow-list, since exclusion
    // is meant as "never show this," not a narrower version of the allow-list. Independent
    // of ?logCategory=/?debug the same way ?logCategory= is independent of ?group -- a
    // separate axis, geo-browser's own interpretation of geo-builder's excludedCategories/
    // ?logCategoryExclude= emission (docs/MESSAGING.md's WriteTelemetryRecord section).
    private parseLogCategoryExclude(params: URLSearchParams): string[] | null {
        return this.parseCommaList(params, "logCategoryExclude");
    }

    private parseCommaList(params: URLSearchParams, name: string): string[] | null {
        const raw = params.get(name);
        if (!raw) {
            return null;
        }

        const values = raw.split(",").map((v) => v.trim()).filter((v) => v.length > 0);
        return values.length > 0 ? values : null;
    }
}
