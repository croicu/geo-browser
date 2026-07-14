import { describe, expect, it } from "vitest";
import { VoidVariantResolver } from "../../src/view/detail/voidVariantResolver";

describe("VoidVariantResolver.parseEffectiveIds", () => {
    it("resolves the bare id to every source layer id, sorted numerically", () => {
        expect(VoidVariantResolver.parseEffectiveIds("__void__", ["3", "1", "10", "2"]))
            .toEqual(["1", "2", "3", "10"]);
    });

    it("parses a single-layer variant id", () => {
        expect(VoidVariantResolver.parseEffectiveIds("__void__2__", [])).toEqual(["2"]);
    });

    it("parses and sorts a multi-layer variant id numerically", () => {
        expect(VoidVariantResolver.parseEffectiveIds("__void__10_2__", [])).toEqual(["2", "10"]);
    });

    it("returns null for an id that doesn't match the naming convention", () => {
        expect(VoidVariantResolver.parseEffectiveIds("__poi__", [])).toBeNull();
        expect(VoidVariantResolver.parseEffectiveIds("__void_2__", [])).toBeNull();
        expect(VoidVariantResolver.parseEffectiveIds("2", [])).toBeNull();
    });
});

describe("VoidVariantResolver.resolve", () => {
    const variants = [
        { id: "__void__", effectiveIds: ["1", "2", "3", "4", "5"] },
        { id: "__void__1__", effectiveIds: ["1"] },
        { id: "__void__2__", effectiveIds: ["2"] },
        { id: "__void__3__", effectiveIds: ["3"] },
    ];

    it("resolves to the bare variant when nothing is visible", () => {
        expect(VoidVariantResolver.resolve(variants, [])).toBe("__void__");
    });

    it("resolves to the exact single-layer match when exactly one sibling is visible", () => {
        expect(VoidVariantResolver.resolve(variants, ["2"])).toBe("__void__2__");
    });

    it("falls back to the bare variant when multiple siblings are visible and no combo exists", () => {
        expect(VoidVariantResolver.resolve(variants, ["1", "2"])).toBe("__void__");
    });

    it("falls back to the bare variant when the single visible layer has no precomputed variant", () => {
        // "5" is a real source layer (included in the bare variant's effective ids,
        // same as every other source layer in the area) but has no __void__5__ of its own.
        expect(VoidVariantResolver.resolve(variants, ["5"])).toBe("__void__");
    });

    it("picks the smallest qualifying superset when a closer combo is available", () => {
        const withCombo = [
            ...variants,
            { id: "__void__2_3__", effectiveIds: ["2", "3"] },
        ];
        expect(VoidVariantResolver.resolve(withCombo, ["2", "3"])).toBe("__void__2_3__");
    });

    it("prefers a smaller superset over the bare fallback when both qualify", () => {
        const withCombo = [
            ...variants,
            { id: "__void__1_2_3__", effectiveIds: ["1", "2", "3"] },
        ];
        expect(VoidVariantResolver.resolve(withCombo, ["1", "2"])).toBe("__void__1_2_3__");
    });

    it("returns undefined when even the bare variant is missing", () => {
        expect(VoidVariantResolver.resolve([], ["1"])).toBeUndefined();
        expect(VoidVariantResolver.resolve([], [])).toBeUndefined();
    });
});
