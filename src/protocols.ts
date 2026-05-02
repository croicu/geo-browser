export type LogLevel =
    | "diagnostic"
    | "info"
    | "warning"
    | "error"
    | "fatal";

export interface TelemetryRecord {
    timestamp: string;
    level: LogLevel;
    message: string;
    props?: Record<string, unknown>;
    error?: unknown;
}

export interface TelemetrySink {
    write(record: TelemetryRecord): void;
}

export interface Logger {
    diagnostic(message: string, props?: Record<string, unknown>): void;
    info(message: string, props?: Record<string, unknown>): void;
    warning(message: string, props?: Record<string, unknown>): void;
    error(message: string, error?: unknown, props?: Record<string, unknown>): void;
    fatal(message: string, error?: unknown, props?: Record<string, unknown>): void;
}