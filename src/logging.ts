import type {
    LogLevel,
    Logger,
    TelemetryRecord,
    TelemetrySink,
} from "./contracts";

export const DEFAULT_LOG_CATEGORY = "generic";

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

    constructor(sink: TelemetrySink, enabledCategories?: readonly string[] | null) {
        this.sink = sink;
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
        if (!this.enabledCategories.has(category)) {
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
