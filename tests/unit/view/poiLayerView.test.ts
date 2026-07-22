import { afterEach, describe, expect, it, vi } from "vitest";

import type { ClickableMapLayerHandle, MapHandle } from "../../../src/contracts";
import { GeoLayer } from "../../../src/catalog/layer";
import { PoiLayerView } from "../../../src/view/detail/poiLayerView";
import { StubLayerFactory, StubMap, StubMarker } from "../../stubs/stubLeafletFactories";
import { stubFetch } from "../../fakes/fakeFetch";

class CountingMarker extends StubMarker {
    public addCount = 0;

    override addTo(map: MapHandle): void {
        this.addCount++;
        super.addTo(map);
    }
}

class CountingLayerFactory extends StubLayerFactory {
    public readonly counting: CountingMarker[] = [];

    override createCircleMarker(): ClickableMapLayerHandle {
        const marker = new CountingMarker();
        this.counting.push(marker);
        return marker;
    }
}

const twoPoiPayload = {
    type: "FeatureCollection",
    features: [
        {
            type: "Feature",
            properties: { hasDetails: true, name: "A" },
            geometry: { type: "Point", coordinates: [14.0, 40.0] },
        },
        {
            type: "Feature",
            properties: { hasDetails: true, name: "B" },
            geometry: { type: "Point", coordinates: [14.1, 40.1] },
        },
    ],
};

function buildView(factory: CountingLayerFactory) {
    const map = new StubMap();
    const poiLayer = new GeoLayer({ id: "__poi__", type: "__poi__", url: null, visible: true });
    const source = new GeoLayer({
        id: "circle1",
        type: "circle",
        url: "/areas/x/layers/circle1.geojson",
        visible: true,
    });
    const view = new PoiLayerView(map, poiLayer, [source], factory);
    return { view, map };
}

describe("PoiLayerView hide/show", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("hides and re-shows all markers without rebuilding", async () => {
        stubFetch(twoPoiPayload);
        const factory = new CountingLayerFactory();
        const { view, map } = buildView(factory);

        await view.render();
        expect(factory.counting.length).toBe(2);
        expect(factory.counting[0].addCount).toBe(1);

        view.hide();
        expect(factory.counting[0].removeCalled).toBe(true);
        expect(factory.counting[1].removeCalled).toBe(true);

        view.show();
        expect(factory.counting[0].addCount).toBe(2);
        expect(factory.counting[1].addCount).toBe(2);
        expect(factory.counting[0].addToMap).toBe(map);
        // No re-fetch/re-scan: still exactly the two markers built by render().
        expect(factory.counting.length).toBe(2);
    });

    it("show() does not reattach a marker whose source is currently toggled off", async () => {
        stubFetch(twoPoiPayload);
        const factory = new CountingLayerFactory();
        const { view } = buildView(factory);

        await view.render();
        view.setSourceVisible("circle1", false);
        expect(factory.counting[0].addCount).toBe(1); // only the initial render add

        view.hide();
        view.show();

        // Source is still off, so show() must not have re-added it.
        expect(factory.counting[0].addCount).toBe(1);
    });

    it("is a no-op when called redundantly", async () => {
        stubFetch(twoPoiPayload);
        const factory = new CountingLayerFactory();
        const { view } = buildView(factory);

        await view.render();

        view.hide();
        view.hide();
        expect(factory.counting[0].removeCalled).toBe(true);

        view.show();
        view.show();
        expect(factory.counting[0].addCount).toBe(2);
    });
});
