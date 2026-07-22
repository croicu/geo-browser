import { describe, expect, it } from "vitest";

import { GeoLayer } from "../../../src/catalog/layer";
import { LocalStorageUserPointsStore } from "../../../src/runtime/userPointsStore";
import { UserLayerView } from "../../../src/view/detail/userLayerView";
import { StubLayerFactory, StubMap } from "../../stubs/stubLeafletFactories";
import { StubStorage } from "../../stubs/stubStorage";

function buildView() {
    const store = new LocalStorageUserPointsStore(new StubStorage());
    const map = new StubMap();
    const factory = new StubLayerFactory();
    const layer = new GeoLayer({ id: "__user__", type: "__user__", url: null, visible: true });
    const view = new UserLayerView(map, layer, factory, store, "area1");
    return { view, map, factory, store };
}

describe("UserLayerView hide/show", () => {
    it("hides and re-shows all markers without rebuilding", async () => {
        const { view, map, factory, store } = buildView();
        await store.addPoint("area1", 40.0, 14.0, 0.5);
        await store.addPoint("area1", 40.1, 14.1, 0.5);
        await view.render();

        expect(factory.markers.length).toBe(2);
        expect(factory.markers[0].addToMap).toBe(map);

        view.hide();
        expect(factory.markers[0].removeCalled).toBe(true);
        expect(factory.markers[1].removeCalled).toBe(true);

        view.show();
        expect(factory.markers[0].addToMap).toBe(map);
        // No re-fetch/re-scan: still exactly the two markers built by render().
        expect(factory.markers.length).toBe(2);
    });

    it("is a no-op when already in the target state", async () => {
        const { view, factory, store } = buildView();
        await store.addPoint("area1", 40.0, 14.0, 0.5);
        await view.render();

        view.show(); // already visible -> setVisible's guard no-ops
        expect(factory.markers[0].removeCalled).toBe(false);

        view.hide();
        view.hide(); // already hidden -> second call is harmless
        expect(factory.markers[0].removeCalled).toBe(true);
    });
});
