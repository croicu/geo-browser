import { afterEach, describe, expect, it, vi } from "vitest";

import { GatewayTelemetrySink } from "../../../src/runtime/gatewayTelemetrySink";
import { StubGateway } from "../../stubs/stubGateway";
import type { TelemetryRecord } from "../../../src/contracts";

function makeRecord(overrides: Partial<TelemetryRecord> = {}): TelemetryRecord {
    return {
        timestamp: "2026-01-01T00:00:00.000Z",
        level: "info",
        category: "general",
        message: "test.message",
        ...overrides,
    };
}

describe("GatewayTelemetrySink", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("forwards a record via WriteTelemetryRecord", () => {
        const gateway = new StubGateway();
        const sink = new GatewayTelemetrySink(gateway);

        sink.write(makeRecord({ props: { areaId: "redmond" } }));

        expect(gateway.invocations).toHaveLength(1);
        expect(gateway.invocations[0].id).toBe("__geo_write_telemetry_record__");
        expect(gateway.invocations[0].data).toEqual({
            timestamp: "2026-01-01T00:00:00.000Z",
            level: "info",
            category: "general",
            message: "test.message",
            props: { areaId: "redmond" },
            errorDetail: null,
        });
    });

    it("serializes an Error into errorDetail as message + stack", () => {
        const gateway = new StubGateway();
        const sink = new GatewayTelemetrySink(gateway);
        const error = new Error("boom");

        sink.write(makeRecord({ level: "error", error }));

        const data = gateway.invocations[0].data as { errorDetail: string | null };
        expect(data.errorDetail).toContain("boom");
        expect(data.errorDetail).toContain(error.stack ?? "");
    });

    it("serializes a non-Error error value with String()", () => {
        const gateway = new StubGateway();
        const sink = new GatewayTelemetrySink(gateway);

        sink.write(makeRecord({ level: "error", error: "plain string failure" }));

        const data = gateway.invocations[0].data as { errorDetail: string | null };
        expect(data.errorDetail).toBe("plain string failure");
    });

    it("falls back to console.error on a non-OK response, never through the Logger", () => {
        const gateway = new StubGateway();
        const sink = new GatewayTelemetrySink(gateway);
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

        sink.write(makeRecord());
        gateway.respond(0, { error: 1, errorDescription: "disk full" });

        expect(errorSpy).toHaveBeenCalledWith(
            "[gateway_telemetry_sink.write.error]",
            "disk full"
        );
    });

    it("does not call back on a successful (OK) response", () => {
        const gateway = new StubGateway();
        const sink = new GatewayTelemetrySink(gateway);
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

        sink.write(makeRecord());
        gateway.respond(0, { error: 0, errorDescription: null });

        expect(errorSpy).not.toHaveBeenCalled();
    });
});
