// tests/unit/runtime/context.test.ts

import { describe, expect, it } from "vitest";

import { Context } from "../../src/runtime/context";

describe("Context", () => {
    it("defaults to browse mode", () => {
        setSearch("");

        const context = Context.Instance;

        expect(context.mode).toBe("browse");
        expect(context.debug).toBe(false);
    });

    it("enables debug mode when debug has a value", () => {
        setSearch("?debug=1");

        const context = Context.Instance;

        expect(context.mode).toBe("browse");
        expect(context.debug).toBe(true);
    });

    it("switches to design mode when design has a value", () => {
        setSearch("?design=1");

        const context = Context.Instance;

        expect(context.mode).toBe("design");
        expect(context.debug).toBe(false);
    });

    it("supports debug and design together", () => {
        setSearch("?debug=1&design=1");

        const context = Context.Instance;

        expect(context.mode).toBe("design");
        expect(context.debug).toBe(true);
    });

    it("ignores empty debug value", () => {
        setSearch("?debug=");

        const context = Context.Instance;

        expect(context.debug).toBe(false);
    });

    it("ignores empty design value", () => {
        setSearch("?design=");

        const context = Context.Instance;

        expect(context.mode).toBe("browse");
    });

    it("defaults groupFilter to null with no query string", () => {
        setSearch("");

        expect(Context.Instance.groupFilter).toBeNull();
    });

    it("parses a single ?group value", () => {
        setSearch("?group=debug");

        expect(Context.Instance.groupFilter).toEqual(["debug"]);
    });

    it("parses a comma-separated ?group value", () => {
        setSearch("?group=debug,Europe");

        expect(Context.Instance.groupFilter).toEqual(["debug", "Europe"]);
    });

    it("falls back to [\"debug\"] when only ?debug is present", () => {
        setSearch("?debug=1");

        expect(Context.Instance.groupFilter).toEqual(["debug"]);
    });

    it("prefers ?group over ?debug when both are present", () => {
        setSearch("?group=Europe&debug=1");

        expect(Context.Instance.groupFilter).toEqual(["Europe"]);
        expect(Context.Instance.debug).toBe(true);
    });

    it("ignores empty ?group value", () => {
        setSearch("?group=");

        expect(Context.Instance.groupFilter).toBeNull();
    });
});

function setSearch(search: string): void {
    window.history.replaceState({}, "", search || "/");
    Context.reset();
}