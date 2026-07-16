import { describe, expect, it } from "vitest";
import { matchesGroupFilter } from "../../src/catalog/groupFilter";

describe("matchesGroupFilter", () => {
    it("matches ungrouped areas when the filter is null", () => {
        expect(matchesGroupFilter(undefined, null)).toBe(true);
        expect(matchesGroupFilter([], null)).toBe(true);
    });

    it("hides the debug group by default when the filter is null", () => {
        expect(matchesGroupFilter(["debug"], null)).toBe(false);
        expect(matchesGroupFilter(["debug", "Europe"], null)).toBe(false);
    });

    it("shows debug areas when debug is explicitly requested", () => {
        expect(matchesGroupFilter(["debug"], ["debug"])).toBe(true);
        expect(matchesGroupFilter(["debug", "Europe"], ["debug"])).toBe(true);
    });

    it("hides debug-tagged areas under an unrelated explicit filter", () => {
        expect(matchesGroupFilter(["debug", "Europe"], ["Europe"])).toBe(false);
    });

    it("treats missing group as ungrouped", () => {
        expect(matchesGroupFilter(undefined, ["debug"])).toBe(false);
    });

    it("matches when the area's group is a superset of the filter", () => {
        expect(matchesGroupFilter(["debug", "Europe"], ["debug", "Europe"])).toBe(true);
        expect(matchesGroupFilter(["Europe", "Sweden"], ["Europe"])).toBe(true);
    });

    it("requires every filter entry to be present (AND, not OR)", () => {
        expect(matchesGroupFilter(["debug"], ["debug", "Europe"])).toBe(false);
    });

    it("does not match unrelated groups", () => {
        expect(matchesGroupFilter(["Europe"], ["Sweden"])).toBe(false);
    });
});
