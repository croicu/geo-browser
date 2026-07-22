import type {
    LogLevel,
    Logger,
    TelemetryRecord,
    TelemetrySink,
} from "./contracts";

// erasableSyntaxOnly forbids real `enum` declarations (they emit runtime
// code beyond simple erasure) -- this const-object + derived union is the
// idiomatic stand-in: LogCategory.AreaLifecycle reads like an enum member
// and is typo-safe, but is still just a plain string at runtime. Logger's
// `category` parameter (contracts.ts) stays a plain `string`, not this
// type -- categories are an open set (tests and ad-hoc debugging exercise
// arbitrary names), this object is only the canonical, known list.
export const LogCategory = {
    General: "general",
    AreaLifecycle: "area_lifecycle",
} as const;

export type LogCategory = typeof LogCategory[keyof typeof LogCategory];

export const DEFAULT_LOG_CATEGORY: LogCategory = LogCategory.General;

export class ConsoleTelemetrySink implements TelemetrySink {
    write(record: TelemetryRecord): void {
        switch (record.level) {
            case "diagnostic":
            case "info":
                console.info(`[${record.level}][${record.category}]`, record.message, record.props ?? {});
                break;

            case "warning":
                console.warn(`[warning][${record.category}]`, record.message, record.props ?? {});
                break;

            case "error":
            case "fatal":
                console.error(`[${record.level}][${record.category}]`, record.message, record.props ?? {}, record.error);
                break;
        }
    }
}

export class DefaultLogger implements Logger {
    private readonly sink: TelemetrySink;
    private readonly enabledCategories: Set<string>;
    private readonly showAllCategories: boolean;

    // showAllCategories bypasses enabledCategories entirely -- wired to
    // Context.debug (?debug in the query string) so a normal run only ever
    // shows DEFAULT_LOG_CATEGORY, while a debug run sees every category
    // without needing to know their names via ?logCategory=.
    constructor(
        sink: TelemetrySink,
        enabledCategories?: readonly string[] | null,
        showAllCategories = false
    ) {
        this.sink = sink;
        this.showAllCategories = showAllCategories;
        this.enabledCategories = new Set(
            enabledCategories && enabledCategories.length > 0 ? enabledCategories : [DEFAULT_LOG_CATEGORY]
        );
    }

    diagnostic(message: string, props?: Record<string, unknown>, category?: string): void {
        this.write("diagnostic", message, undefined, props, category);
    }

    info(message: string, props?: Record<string, unknown>, category?: string): void {
        this.write("info", message, undefined, props, category);
    }

    warning(message: string, props?: Record<string, unknown>, category?: string): void {
        this.write("warning", message, undefined, props, category);
    }

    error(message: string, error?: unknown, props?: Record<string, unknown>, category?: string): void {
        this.write("error", message, error, props, category);
    }

    fatal(message: string, error?: unknown, props?: Record<string, unknown>, category?: string): void {
        this.write("fatal", message, error, props, category);
    }

    private write(
        level: LogLevel,
        message: string,
        error?: unknown,
        props?: Record<string, unknown>,
        category: string = DEFAULT_LOG_CATEGORY
    ): void {
        if (!this.showAllCategories && !this.enabledCategories.has(category)) {
            return;
        }

        this.sink.write({
            timestamp: new Date().toISOString(),
            level,
            category,
            message,
            props,
            error,
        });
    }
}
