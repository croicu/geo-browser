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
    it("rebuilds whenever the recording toggle flips, regardless of area/debug", () => {
        expect(shouldRebuildTileLayer(false, true, false, false)).toBe(true);
        expect(shouldRebuildTileLayer(true, false, false, false)).toBe(true);
        expect(shouldRebuildTileLayer(false, true, false, true)).toBe(true);
    });

    it("does not rebuild on an area change while recording stays off and debug is off", () => {
        expect(shouldRebuildTileLayer(false, false, true, false)).toBe(false);
    });

    it("rebuilds on an area change while debug is on, even with recording off both times", () => {
        expect(shouldRebuildTileLayer(false, false, true, true)).toBe(true);
    });

    it("rebuilds on an area change while recording stays on", () => {
        expect(shouldRebuildTileLayer(true, true, true, false)).toBe(true);
    });

    it("does not rebuild when nothing changed", () => {
        expect(shouldRebuildTileLayer(false, false, false, false)).toBe(false);
        expect(shouldRebuildTileLayer(true, true, false, false)).toBe(false);
        expect(shouldRebuildTileLayer(false, false, false, true)).toBe(false);
    });
});
