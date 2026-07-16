import { describe, expect, it } from "vitest";
import { matchesGroupFilter } from "../../src/catalog/groupFilter";

describe("matchesGroupFilter", () => {
    it("matches everything when the filter is null", () => {
        expect(matchesGroupFilter(undefined, null)).toBe(true);
        expect(matchesGroupFilter([], null)).toBe(true);
        expect(matchesGroupFilter(["debug"], null)).toBe(true);
    });

    it("treats missing group as ungrouped", () => {
        expect(matchesGroupFilter(undefined, ["debug"])).toBe(false);
    });

    it("matches when the area's group is a superset of the filter", () => {
        expect(matchesGroupFilter(["debug", "Europe"], ["debug"])).toBe(true);
        expect(matchesGroupFilter(["debug", "Europe"], ["debug", "Europe"])).toBe(true);
    });

    it("requires every filter entry to be present (AND, not OR)", () => {
        expect(matchesGroupFilter(["debug"], ["debug", "Europe"])).toBe(false);
    });

    it("does not match unrelated groups", () => {
        expect(matchesGroupFilter(["Europe"], ["debug"])).toBe(false);
    });
});
