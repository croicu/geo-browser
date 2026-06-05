import { describe, expect, it } from "vitest";
import { LocalStorageUserPointsStore } from "../../../src/runtime/userPointsStore";
import { StubStorage } from "../../stubs/stubStorage";

describe("LocalStorageUserPointsStore", () => {
    it("stores weight equal to pressure on addPoint", async () => {
        const store = new LocalStorageUserPointsStore(new StubStorage());
        await store.addPoint("berlin", 52.5, 13.4, 0.8);

        const result = await store.getPoints("berlin") as { features: { properties: Record<string, unknown> }[] };
        const props = result.features[0].properties;

        expect(props.pressure).toBe(0.8);
        expect(props.weight).toBe(0.8);
    });

    it("stores timestamp on addPoint", async () => {
        const store = new LocalStorageUserPointsStore(new StubStorage());
        await store.addPoint("berlin", 52.5, 13.4, 0.5);

        const result = await store.getPoints("berlin") as { features: { properties: Record<string, unknown> }[] };
        const props = result.features[0].properties;

        expect(typeof props.timestamp).toBe("string");
        expect(new Date(props.timestamp as string).getTime()).toBeGreaterThan(0);
    });

    it("returns empty FeatureCollection when no points exist", async () => {
        const store = new LocalStorageUserPointsStore(new StubStorage());
        const result = await store.getPoints("berlin") as { type: string; features: unknown[] };

        expect(result.type).toBe("FeatureCollection");
        expect(result.features).toHaveLength(0);
    });

    it("setBookmarked sets bookmarked flag on matching point", async () => {
        const store = new LocalStorageUserPointsStore(new StubStorage());
        await store.addPoint("berlin", 52.5, 13.4, 0.5);
        await store.setBookmarked("berlin", 13.4, 52.5, true);

        const result = await store.getPoints("berlin") as { features: { properties: Record<string, unknown> }[] };
        expect(result.features[0].properties.bookmarked).toBe(true);
    });

    it("setBookmarked removes bookmarked flag when set to false", async () => {
        const store = new LocalStorageUserPointsStore(new StubStorage());
        await store.addPoint("berlin", 52.5, 13.4, 0.5);
        await store.setBookmarked("berlin", 13.4, 52.5, true);
        await store.setBookmarked("berlin", 13.4, 52.5, false);

        const result = await store.getPoints("berlin") as { features: { properties: Record<string, unknown> }[] };
        expect(result.features[0].properties.bookmarked).toBeUndefined();
    });

    it("setBookmarked does nothing when point not found", async () => {
        const store = new LocalStorageUserPointsStore(new StubStorage());
        await store.addPoint("berlin", 52.5, 13.4, 0.5);
        await store.setBookmarked("berlin", 99.9, 99.9, true);

        const result = await store.getPoints("berlin") as { features: { properties: Record<string, unknown> }[] };
        expect(result.features[0].properties.bookmarked).toBeUndefined();
    });
});
