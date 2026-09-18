import { describe, expect, it } from "vitest";
import { buildTileUrl } from "../../../src/tiles/tileUrl";
import { osmTileProvider, cartoTileProvider } from "../../../src/maps/tileProvider";

describe("buildTileUrl", () => {
    it("substitutes z/x/y and the fixed first subdomain for a provider with no subdomains list", () => {
        const url = buildTileUrl(osmTileProvider, { x: 4, y: 2, z: 3 });

        expect(url).toBe("https://a.tile.openstreetmap.org/3/4/2.png");
    });

    it("uses the first entry of an explicit subdomains string, not a rotating one", () => {
        const url = buildTileUrl(cartoTileProvider, { x: 4, y: 2, z: 3 });

        expect(url).toContain("https://a.basemaps.cartocdn.com/");
    });

    it("is deterministic for the same coordinate (required for cache-key consistency)", () => {
        const first = buildTileUrl(osmTileProvider, { x: 10, y: 20, z: 8 });
        const second = buildTileUrl(osmTileProvider, { x: 10, y: 20, z: 8 });

        expect(first).toBe(second);
    });
});
