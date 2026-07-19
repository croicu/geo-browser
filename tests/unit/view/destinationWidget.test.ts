import { beforeEach, describe, expect, it } from "vitest";
import { DestinationWidget } from "../../../src/view/detail/destinationWidget";
import { StubLayerFactory, StubMap } from "../../stubs/stubLeafletFactories";
import { setLogger } from "../../../src/services";
import { StubLogger } from "../../stubs/stubLogger";
import { StubDestinationStore } from "../../stubs/stubDestinationStore";
import type { DestinationPoint, DestinationStore } from "../../../src/contracts";

function makeWidget(
    map: StubMap,
    layerFactory: StubLayerFactory,
    store: DestinationStore,
    onMarkerTapped: (point: DestinationPoint) => void = () => {}
): DestinationWidget {
    return new DestinationWidget(map, layerFactory, store, { onMarkerTapped });
}

describe("DestinationWidget", () => {
    beforeEach(() => {
        setLogger(new StubLogger());
    });

    it("renders nothing when no destination is stored", () => {
        const map = new StubMap();
        const layerFactory = new StubLayerFactory();
        const widget = makeWidget(map, layerFactory, new StubDestinationStore());

        widget.render();

        expect(layerFactory.destinationMarkers).toHaveLength(0);
        expect(layerFactory.destinationCones).toHaveLength(0);
    });

    it("renders the pin (but not the cone) when a destination exists and no position is known", () => {
        const map = new StubMap();
        const layerFactory = new StubLayerFactory();
        const store = new StubDestinationStore();
        store.set({ lat: 40.85, lng: 14.27 });

        const widget = makeWidget(map, layerFactory, store);
        widget.render();

        expect(layerFactory.destinationMarkers).toHaveLength(1);
        expect(layerFactory.destinationMarkers[0].addedTo).toBe(map);
        expect(layerFactory.destinationCones).toHaveLength(0);
    });

    it("renders the cone once both a destination and a position are known", () => {
        const map = new StubMap();
        const layerFactory = new StubLayerFactory();
        const store = new StubDestinationStore();
        store.set({ lat: 40.85, lng: 14.27 });

        const widget = makeWidget(map, layerFactory, store);
        widget.render();
        widget.onPosition([40.84, 14.26]);

        expect(layerFactory.destinationCones).toHaveLength(1);
        expect(layerFactory.destinationCones[0].addedTo).toBe(map);
        expect(layerFactory.destinationCones[0].latLng).toEqual([40.84, 14.26]);
        expect(layerFactory.destinationCones[0].heading).not.toBeNull();
    });

    it("moves the cone to the new position and recomputes bearing on each position update", () => {
        const map = new StubMap();
        const layerFactory = new StubLayerFactory();
        const store = new StubDestinationStore();
        store.set({ lat: 40.85, lng: 14.27 });

        const widget = makeWidget(map, layerFactory, store);
        widget.render();
        widget.onPosition([40.84, 14.26]);
        widget.onPosition([40.80, 14.20]);

        expect(layerFactory.destinationCones).toHaveLength(1);
        expect(layerFactory.destinationCones[0].latLng).toEqual([40.80, 14.20]);
    });

    it("hides the cone (but keeps the marker) when position is lost", () => {
        const map = new StubMap();
        const layerFactory = new StubLayerFactory();
        const store = new StubDestinationStore();
        store.set({ lat: 40.85, lng: 14.27 });

        const widget = makeWidget(map, layerFactory, store);
        widget.render();
        widget.onPosition([40.84, 14.26]);
        widget.onPosition(null);

        expect(layerFactory.destinationCones[0].heading).toBeNull();
        expect(layerFactory.destinationMarkers[0].removed).toBe(false);
    });

    it("removes both marker and cone when the destination is cleared", () => {
        const map = new StubMap();
        const layerFactory = new StubLayerFactory();
        const store = new StubDestinationStore();
        store.set({ lat: 40.85, lng: 14.27 });

        const widget = makeWidget(map, layerFactory, store);
        widget.render();
        widget.onPosition([40.84, 14.26]);
        widget.setDestination(null);

        expect(layerFactory.destinationMarkers[0].removed).toBe(true);
        expect(layerFactory.destinationCones[0].removed).toBe(true);
    });

    it("re-renders the marker at the new location when the destination changes", () => {
        const map = new StubMap();
        const layerFactory = new StubLayerFactory();
        const store = new StubDestinationStore();
        store.set({ lat: 40.85, lng: 14.27 });

        const widget = makeWidget(map, layerFactory, store);
        widget.render();
        widget.setDestination({ lat: 41.0, lng: 15.0 });

        expect(layerFactory.destinationMarkers).toHaveLength(2);
        expect(layerFactory.destinationMarkers[0].removed).toBe(true);
        expect(layerFactory.destinationMarkers[1].removed).toBe(false);
    });

    it("invokes onMarkerTapped with the current destination when the pin is clicked", () => {
        const map = new StubMap();
        const layerFactory = new StubLayerFactory();
        const store = new StubDestinationStore();
        store.set({ lat: 40.85, lng: 14.27, label: "Ithaca" });

        let tapped: DestinationPoint | undefined;
        const widget = makeWidget(map, layerFactory, store, point => { tapped = point; });
        widget.render();

        layerFactory.destinationMarkers[0].clickHandler?.();

        expect(tapped).toEqual({ lat: 40.85, lng: 14.27, label: "Ithaca" });
    });

    it("destroy removes both marker and cone", () => {
        const map = new StubMap();
        const layerFactory = new StubLayerFactory();
        const store = new StubDestinationStore();
        store.set({ lat: 40.85, lng: 14.27 });

        const widget = makeWidget(map, layerFactory, store);
        widget.render();
        widget.onPosition([40.84, 14.26]);
        widget.destroy();

        expect(layerFactory.destinationMarkers[0].removed).toBe(true);
        expect(layerFactory.destinationCones[0].removed).toBe(true);
    });
});
