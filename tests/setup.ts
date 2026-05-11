import { beforeEach, afterEach, vi } from "vitest";
import { Context } from "../src/runtime/context";
import { StubStorage } from "./stubs/stubStorage";

beforeEach(() => {
    vi.stubGlobal("fetch", () => {
        throw new Error("Unexpected network call in unit test.");
    });

    Context.Instance.setStorage(new StubStorage());
});

// Your tests are executed here ...

afterEach(() => {
    Context.reset();
});
