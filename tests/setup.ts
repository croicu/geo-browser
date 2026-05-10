import { beforeEach, afterEach, vi } from "vitest";
import { Context } from "../src/runtime/context";

beforeEach(() => {
    vi.stubGlobal("fetch", () => {
        throw new Error("Unexpected network call in unit test.");
    });
});

// Your tests are executed here ...

afterEach(() => {
    Context.reset();
});