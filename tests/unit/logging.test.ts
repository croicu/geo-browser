import { describe, expect, it } from "vitest";

import { DefaultLogger, DEFAULT_LOG_CATEGORY } from "../../src/logging";
import type { TelemetryRecord, TelemetrySink } from "../../src/contracts";

class RecordingSink implements TelemetrySink {
    public readonly records: TelemetryRecord[] = [];

    write(record: TelemetryRecord): void {
        this.records.push(record);
    }
}

describe("DefaultLogger categories", () => {
    it("defaults uncategorized calls to 'generic' and only enables 'generic' by default", () => {
        const sink = new RecordingSink();
        const logger = new DefaultLogger(sink);

        logger.info("hello");

        expect(sink.records).toHaveLength(1);
        expect(sink.records[0].category).toBe(DEFAULT_LOG_CATEGORY);
    });

    it("suppresses a category that was not enabled", () => {
        const sink = new RecordingSink();
        const logger = new DefaultLogger(sink, ["area_lifecycle"]);

        logger.info("hidden", undefined, "generic");
        logger.info("shown", undefined, "area_lifecycle");

        expect(sink.records).toHaveLength(1);
        expect(sink.records[0].message).toBe("shown");
    });

    it("enables multiple categories at once", () => {
        const sink = new RecordingSink();
        const logger = new DefaultLogger(sink, ["generic", "area_lifecycle"]);

        logger.info("a", undefined, "generic");
        logger.info("b", undefined, "area_lifecycle");
        logger.info("c", undefined, "other");

        expect(sink.records.map((r) => r.message)).toEqual(["a", "b"]);
    });

    it("falls back to the default category when the enabled list is empty", () => {
        const sink = new RecordingSink();
        const logger = new DefaultLogger(sink, []);

        logger.info("still shown");

        expect(sink.records).toHaveLength(1);
    });
});
