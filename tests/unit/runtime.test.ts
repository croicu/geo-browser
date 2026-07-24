// tests/unit/runtime/context.test.ts

import { afterEach, describe, expect, it, vi } from "vitest";

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

describe("Context log category precedence", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("an explicit ?logCategory= wins outright over ?debug=1's show-everything shorthand", () => {
        setSearch("?debug=1&logCategory=overpass");
        const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

        Context.Instance.logger.info("shown", undefined, "overpass");
        Context.Instance.logger.info("hidden", undefined, "some_other_category");

        expect(infoSpy).toHaveBeenCalledTimes(1);
        expect(infoSpy).toHaveBeenCalledWith("[info][overpass]", "shown", {});
    });

    it("?debug=1 alone (no ?logCategory=) still shows every category", () => {
        setSearch("?debug=1");
        const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

        Context.Instance.logger.info("a", undefined, "some_category");
        Context.Instance.logger.info("b", undefined, "some_other_category");

        expect(infoSpy).toHaveBeenCalledTimes(2);
    });

    it("?logCategory= alone (no ?debug=1) still restricts to the given list", () => {
        setSearch("?logCategory=overpass");
        const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

        Context.Instance.logger.info("shown", undefined, "overpass");
        Context.Instance.logger.info("hidden", undefined, "some_other_category");

        expect(infoSpy).toHaveBeenCalledTimes(1);
        expect(infoSpy).toHaveBeenCalledWith("[info][overpass]", "shown", {});
    });

    it("?logCategoryExclude= suppresses a category even under ?debug=1's show-everything mode", () => {
        setSearch("?debug=1&logCategoryExclude=area_lifecycle");
        const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

        Context.Instance.logger.info("shown", undefined, "general");
        Context.Instance.logger.info("hidden", undefined, "area_lifecycle");
        Context.Instance.logger.info("also shown", undefined, "some_other_category");

        expect(infoSpy).toHaveBeenCalledTimes(2);
        expect(infoSpy).toHaveBeenCalledWith("[info][general]", "shown", {});
        expect(infoSpy).toHaveBeenCalledWith("[info][some_other_category]", "also shown", {});
    });

    it("?logCategoryExclude= suppresses a category even when it's also in an explicit ?logCategory=", () => {
        setSearch("?logCategory=general,overpass&logCategoryExclude=overpass");
        const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

        Context.Instance.logger.info("shown", undefined, "general");
        Context.Instance.logger.info("hidden", undefined, "overpass");

        expect(infoSpy).toHaveBeenCalledTimes(1);
        expect(infoSpy).toHaveBeenCalledWith("[info][general]", "shown", {});
    });
});

describe("Context global error handlers", () => {
    afterEach(() => {
        delete (window as unknown as { geo?: unknown }).geo;
        vi.restoreAllMocks();
    });

    it("routes uncaught window errors to the logger as fatal", () => {
        setSearch("");
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

        Context.Instance;
        const error = new Error("boom");
        window.dispatchEvent(new ErrorEvent("error", { message: "boom", error }));

        expect(errorSpy).toHaveBeenCalledWith(
            "[fatal][general]",
            "window.uncaught_error",
            {},
            error
        );
    });

    it("routes unhandled promise rejections to the logger as fatal", () => {
        setSearch("");
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

        Context.Instance;
        const event = new Event("unhandledrejection") as Event & { reason?: unknown };
        event.reason = "boom";
        window.dispatchEvent(event);

        expect(errorSpy).toHaveBeenCalledWith(
            "[fatal][general]",
            "window.unhandled_rejection",
            {},
            "boom"
        );
    });

    it("removes its listeners on reset so no stale handler fires afterward", () => {
        setSearch("");
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

        Context.Instance;
        Context.reset();

        window.dispatchEvent(new ErrorEvent("error", { message: "boom", error: new Error("boom") }));

        expect(errorSpy).not.toHaveBeenCalled();
    });

    it("wires GatewayTelemetrySink into the logger in design mode", () => {
        setSearch("?design=1");
        const invoke = vi.fn();
        (window as unknown as { geo?: unknown }).geo = { invoke, subscribe: vi.fn(), unsubscribe: vi.fn() };

        Context.Instance.logger.info("test.message");

        expect(invoke).toHaveBeenCalledWith(
            "__geo_write_telemetry_record__",
            expect.objectContaining({ message: "test.message" }),
            expect.any(Function)
        );
    });

    it("does not wire GatewayTelemetrySink in browse mode", () => {
        setSearch("");
        const invoke = vi.fn();
        (window as unknown as { geo?: unknown }).geo = { invoke, subscribe: vi.fn(), unsubscribe: vi.fn() };

        Context.Instance.logger.info("test.message");

        expect(invoke).not.toHaveBeenCalled();
    });
});

function setSearch(search: string): void {
    window.history.replaceState({}, "", search || "/");
    Context.reset();
}