import { describe, expect, it } from "vitest";
import { shouldUseCachingLayer, shouldRebuildTileLayer } from "../../../src/tiles/tileCacheDecision";

describe("shouldUseCachingLayer", () => {
    it("is false when neither recording nor debug is on", () => {
        expect(shouldUseCachingLayer(false, false)).toBe(false);
    });

    it("is true while recording, regardless of debug", () => {
        expect(shouldUseCachingLayer(true, false)).toBe(true);
        expect(shouldUseCachingLayer(true, true)).toBe(true);
    });

    it("is true under debug alone, even with recording off -- read-only cache-hit visualization", () => {
        expect(shouldUseCachingLayer(false, true)).toBe(true);
    });
});

describe("shouldRebuildTileLayer", () => {
    it("rebuilds whenever the recording toggle flips, regardless of area", () => {
        expect(shouldRebuildTileLayer(false, true, false)).toBe(true);
        expect(shouldRebuildTileLayer(true, false, false)).toBe(true);
    });

    // Both CachingTileLayer and OfflineFallbackTileLayer are area-scoped (each owns a TileFetcher
    // tied to one area's cache), so an area change always rebuilds now, regardless of recording --
    // unlike an earlier version where a non-recording area used a plain, area-agnostic L.tileLayer.
    it("rebuilds on an area change even while recording stays off", () => {
        expect(shouldRebuildTileLayer(false, false, true)).toBe(true);
    });

    it("rebuilds on an area change while recording stays on", () => {
        expect(shouldRebuildTileLayer(true, true, true)).toBe(true);
    });

    it("does not rebuild when nothing changed", () => {
        expect(shouldRebuildTileLayer(false, false, false)).toBe(false);
        expect(shouldRebuildTileLayer(true, true, false)).toBe(false);
    });
});
