import type { GatewayService, TelemetryRecord, TelemetrySink } from "../contracts";
import { OK, WriteTelemetryRecord } from "../api";

// Forwards every telemetry record to geo-builder over the gateway (design mode only --
// see tasks/logging_api.md). Must never call getLogger() on its own failure path: a log
// call whose own delivery failure gets logged again would recurse through DefaultLogger
// back into this sink's own write(). Failures fall back to a raw console.error instead.
export class GatewayTelemetrySink implements TelemetrySink {
    private readonly _gateway: GatewayService;

    constructor(gateway: GatewayService) {
        this._gateway = gateway;
    }

    write(record: TelemetryRecord): void {
        this._gateway.invoke(WriteTelemetryRecord, {
            timestamp: record.timestamp,
            level: record.level,
            category: record.category,
            message: record.message,
            props: record.props,
            errorDetail: this.serializeError(record.error),
        }, (response) => {
            if (response.error !== OK) {
                console.error("[gateway_telemetry_sink.write.error]", response.errorDescription);
            }
        });
    }

    private serializeError(error: unknown): string | null {
        if (error === undefined || error === null) {
            return null;
        }

        if (error instanceof Error) {
            return `${error.message}\n${error.stack ?? ""}`;
        }

        return String(error);
    }
}
