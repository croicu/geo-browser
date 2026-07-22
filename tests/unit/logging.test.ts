import { describe, expect, it } from "vitest";

import { DefaultLogger, DEFAULT_LOG_CATEGORY, LogCategory } from "../../src/logging";
import type { TelemetryRecord, TelemetrySink } from "../../src/contracts";

class RecordingSink implements TelemetrySink {
    public readonly records: TelemetryRecord[] = [];

    write(record: TelemetryRecord): void {
        this.records.push(record);
    }
}

describe("DefaultLogger categories", () => {
    it("defaults uncategorized calls to LogCategory.General and only enables it by default", () => {
        const sink = new RecordingSink();
        const logger = new DefaultLogger(sink);

        logger.info("hello");

        expect(sink.records).toHaveLength(1);
        expect(sink.records[0].category).toBe(DEFAULT_LOG_CATEGORY);
        expect(DEFAULT_LOG_CATEGORY).toBe(LogCategory.General);
        expect(LogCategory.General).toBe("general");
    });

    it("suppresses a category that was not enabled", () => {
        const sink = new RecordingSink();
        const logger = new DefaultLogger(sink, [LogCategory.AreaLifecycle]);

        logger.info("hidden", undefined, LogCategory.General);
        logger.info("shown", undefined, LogCategory.AreaLifecycle);

        expect(sink.records).toHaveLength(1);
        expect(sink.records[0].message).toBe("shown");
    });

    it("enables multiple categories at once", () => {
        const sink = new RecordingSink();
        const logger = new DefaultLogger(sink, [LogCategory.General, LogCategory.AreaLifecycle]);

        logger.info("a", undefined, LogCategory.General);
        logger.info("b", undefined, LogCategory.AreaLifecycle);
        logger.info("c", undefined, "other");

        expect(sink.records.map((r) => r.message)).toEqual(["a", "b"]);
    });

    it("falls back to the default category when the enabled list is empty", () => {
        const sink = new RecordingSink();
        const logger = new DefaultLogger(sink, []);

        logger.info("still shown");

        expect(sink.records).toHaveLength(1);
    });

    it("showAllCategories bypasses the allow-list entirely, regardless of enabledCategories", () => {
        const sink = new RecordingSink();
        const logger = new DefaultLogger(sink, [LogCategory.AreaLifecycle], true);

        logger.info("a", undefined, LogCategory.General);
        logger.info("b", undefined, LogCategory.AreaLifecycle);
        logger.info("c", undefined, "some_other_category");

        expect(sink.records.map((r) => r.message)).toEqual(["a", "b", "c"]);
    });

    it("showAllCategories defaults to false", () => {
        const sink = new RecordingSink();
        const logger = new DefaultLogger(sink);

        logger.info("hidden", undefined, LogCategory.AreaLifecycle);

        expect(sink.records).toHaveLength(0);
    });
});
