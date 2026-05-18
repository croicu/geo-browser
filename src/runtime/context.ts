import { resolveCatalogUrl } from "../catalog/loader";
import { ConsoleTelemetrySink, DefaultLogger } from "../logging";
import { setLogger, resetLogger } from "../services";
import { StorageGuard } from "./storageGuard";
import { WebViewHostService } from "./webViewHostService";

import type { GeoDataService, HostService, StorageService, Logger } from "../contracts";
import type { ResolveCatalogUrlOptions } from "../catalog/loader";

export type Mode = "browse" | "design";

export class Context {
    private static s_instance?: Context;

    private readonly _mode: Mode;
    private readonly _debug: boolean;
    private readonly _design: boolean;

    private readonly _dataSource: GeoDataService;
    private readonly _storageGuard: StorageGuard;
    private readonly _logger: Logger;
    private readonly _host: HostService;

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
        this._mode = this.hasValue(params, "design")
            ? "design"
            : "browse";

        this._logger = new DefaultLogger(new ConsoleTelemetrySink());
        this._dataSource = {} as GeoDataService;
        this._storageGuard = new StorageGuard();
        this._host = new WebViewHostService(this._mode);

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

    private hasValue(
        params: URLSearchParams,
        name: string
    ): boolean {
        const value = params.get(name);

        return value !== null && value !== "";
    }
}
