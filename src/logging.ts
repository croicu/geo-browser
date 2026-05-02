import type {
    LogLevel,
    Logger,
    TelemetryRecord,
    TelemetrySink,
} from "./protocols";

export class ConsoleTelemetrySink implements TelemetrySink {
    write(record: TelemetryRecord): void {
        switch (record.level) {
            case "diagnostic":
            case "info":
                console.info(`[${record.level}]`, record.message, record.props ?? {});
                break;

            case "warning":
                console.warn("[warning]", record.message, record.props ?? {});
                break;

            case "error":
            case "fatal":
                console.error(`[${record.level}]`, record.message, record.props ?? {}, record.error);
                break;
        }
    }
}

export class DefaultLogger implements Logger {
    private readonly sink: TelemetrySink;

    constructor(sink: TelemetrySink) {
        this.sink = sink;
    }

    diagnostic(message: string, props?: Record<string, unknown>): void {
        this.write("diagnostic", message, undefined, props);
    }

    info(message: string, props?: Record<string, unknown>): void {
        this.write("info", message, undefined, props);
    }

    warning(message: string, props?: Record<string, unknown>): void {
        this.write("warning", message, undefined, props);
    }

    error(message: string, error?: unknown, props?: Record<string, unknown>): void {
        this.write("error", message, error, props);
    }

    fatal(message: string, error?: unknown, props?: Record<string, unknown>): void {
        this.write("fatal", message, error, props);
    }

    private write(
        level: LogLevel,
        message: string,
        error?: unknown,
        props?: Record<string, unknown>
    ): void {
        this.sink.write({
            timestamp: new Date().toISOString(),
            level,
            message,
            props,
            error,
        });
    }
}