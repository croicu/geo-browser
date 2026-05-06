import { vi } from "vitest"

export function stubFetch(payload: unknown): void {
    vi.stubGlobal("fetch", async () => {
        return {
            ok: true,
            json: async () => payload,
        };
    });
}
