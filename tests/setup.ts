import { beforeEach, vi } from "vitest";

beforeEach(() => {
    vi.stubGlobal("fetch", () => {
        throw new Error("Unexpected network call in unit test.");
    });
});