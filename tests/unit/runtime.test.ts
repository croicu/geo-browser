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
});

function setSearch(search: string): void {
    window.history.replaceState({}, "", search || "/");
}