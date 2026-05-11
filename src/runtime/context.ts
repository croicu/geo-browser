// src/runtime/context.ts
import { resolveCatalogUrl } from "../catalog/loader";
import { ConsoleTelemetrySink, DefaultLogger } from "../logging";
import { setLogger, resetLogger } from "../services";

import type { GeoDataService, StorageService, Logger } from "../contracts";
import type { ResolveCatalogUrlOptions } from "../catalog/loader";

export type Mode = "browse" | "design";

export class Context {
    private static s_instance?: Context;

    private readonly _mode: Mode;
    private readonly _debug: boolean;

    private readonly _dataSource: GeoDataService;
    private readonly _storage: StorageService;
    private readonly _logger: Logger;
    private readonly _host: unknown;

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
        this._mode = this.hasValue(params, "design")
            ? "design"
            : "browse";

        this._logger = new DefaultLogger(new ConsoleTelemetrySink());
        // Placeholder implementations.
        // These will be replaced by real factories/services.
        this._dataSource = {} as GeoDataService;
        this._storage = {} as StorageService;
        this._host = undefined;

        setLogger(this._logger);
    }

    public get host(): unknown {
        return this._host;
    }

    public get mode(): Mode {
        return this._mode;
    }

    public get debug(): boolean {
        return this._debug;
    }

    public get logger(): Logger {
        return this._logger;
    }

    public get dataSource(): GeoDataService {
        return this._dataSource;
    }

    public get storage(): StorageService {
        return this._storage;
    }

    public async resolveCatalogUrl(): Promise<string> {
        return await resolveCatalogUrl(this.getCatalogOptions());
    }

    private getCatalogOptions(): ResolveCatalogUrlOptions {
        if (this._debug) {
            return {
                headUrl: "/catalog.head.debug.json",
                fallbackUrl: "/catalogs/catalog.debug.json",
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
