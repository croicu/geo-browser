import { beforeEach, describe, expect, it } from "vitest";
import { GeoLocationWidget } from "../../../src/view/detail/geoLocationWidget";
import { StubGeoLocationService } from "../../stubs/stubGeoLocation";
import { StubGeoLocationWidgetHandle, StubLayerFactory, StubMap, StubWidgetFactory } from "../../stubs/stubLeafletFactories";
import { setLogger } from "../../../src/services";
import { StubLogger } from "../../stubs/stubLogger";
import type { GeoLocationWidgetHandle } from "../../../src/contracts";

class CapturingWidgetFactory extends StubWidgetFactory {
    public capturedToggle?: () => void;

    override createGeoLocationWidget(
        available: boolean,
        onToggle: () => void
    ): GeoLocationWidgetHandle {
        this.capturedToggle = onToggle;
        return super.createGeoLocationWidget(available, onToggle);
    }
}

function makeWidget(
    map: StubMap,
    service: StubGeoLocationService,
    widgetFactory: StubWidgetFactory,
    layerFactory = new StubLayerFactory()
): GeoLocationWidget {
    return new GeoLocationWidget(map, service, widgetFactory, layerFactory);
}

describe("GeoLocationWidget", () => {
    beforeEach(() => {
        setLogger(new StubLogger());
    });

    it("renders and adds handle to map", () => {
        const map = new StubMap();
        const service = new StubGeoLocationService();
        const factory = new StubWidgetFactory();

        const widget = makeWidget(map, service, factory);
        widget.render();

        expect(factory.lastGeoLocationWidget?.addedTo).toBe(map);
    });

    it("starts watching on render when available", () => {
        const map = new StubMap();
        const service = new StubGeoLocationService();
        const factory = new StubWidgetFactory();

        const widget = makeWidget(map, service, factory);
        widget.render();

        expect(service.watchCalled).toBe(true);
    });

    it("does not watch when service is unavailable", () => {
        const map = new StubMap();
        const service = new StubGeoLocationService();
        service.available = false;
        const factory = new StubWidgetFactory();

        const widget = makeWidget(map, service, factory);
        widget.render();

        expect(service.watchCalled).toBe(false);
    });

    it("render is idempotent", () => {
        const map = new StubMap();
        const service = new StubGeoLocationService();
        const factory = new StubWidgetFactory();

        const widget = makeWidget(map, service, factory);
        widget.render();
        const first = factory.lastGeoLocationWidget;
        widget.render();

        expect(factory.lastGeoLocationWidget).toBe(first);
    });

    it("destroy removes handle", () => {
        const map = new StubMap();
        const service = new StubGeoLocationService();
        const factory = new StubWidgetFactory();

        const widget = makeWidget(map, service, factory);
        widget.render();
        const handle = factory.lastGeoLocationWidget!;

        widget.destroy();

        expect(handle.removed).toBe(true);
    });

    it("toggle sets following on the widget handle", () => {
        const map = new StubMap();
        const service = new StubGeoLocationService();
        const factory = new CapturingWidgetFactory();

        const widget = makeWidget(map, service, factory);
        widget.render();

        factory.capturedToggle!();

        expect(factory.lastGeoLocationWidget?.following).toBe(true);
    });

    it("toggle off clears following", () => {
        const map = new StubMap();
        const service = new StubGeoLocationService();
        const factory = new CapturingWidgetFactory();

        const widget = makeWidget(map, service, factory);
        widget.render();

        factory.capturedToggle!();
        factory.capturedToggle!();

        expect(factory.lastGeoLocationWidget?.following).toBe(false);
    });

    it("position update pans map while following", () => {
        const map = new StubMap();
        const service = new StubGeoLocationService();
        const factory = new CapturingWidgetFactory();

        let pannedTo: [number, number] | undefined;
        map.panTo = (latLng) => { pannedTo = latLng; };

        const widget = makeWidget(map, service, factory);
        widget.render();

        factory.capturedToggle!();
        service.simulatePosition([47.674, -122.121]);

        expect(pannedTo).toEqual([47.674, -122.121]);
    });

    it("position update does not pan map when not following", () => {
        const map = new StubMap();
        const service = new StubGeoLocationService();
        const factory = new StubWidgetFactory();

        let pannedTo: [number, number] | undefined;
        map.panTo = (latLng) => { pannedTo = latLng; };

        const widget = makeWidget(map, service, factory);
        widget.render();

        service.simulatePosition([47.674, -122.121]);

        expect(pannedTo).toBeUndefined();
    });

    it("denied marks widget unavailable and stops following", () => {
        const map = new StubMap();
        const service = new StubGeoLocationService();
        const factory = new CapturingWidgetFactory();

        const widget = makeWidget(map, service, factory);
        widget.render();

        factory.capturedToggle!();
        service.simulateDenied();

        expect(factory.lastGeoLocationWidget?.available).toBe(false);
        expect(factory.lastGeoLocationWidget?.following).toBe(false);
    });

    it("re-enables widget when permission is recovered after denial", () => {
        const map = new StubMap();
        const service = new StubGeoLocationService();
        const factory = new StubWidgetFactory();

        const widget = makeWidget(map, service, factory);
        widget.render();

        service.simulateDenied();
        expect(factory.lastGeoLocationWidget?.available).toBe(false);

        service.simulateRecovery();
        expect(factory.lastGeoLocationWidget?.available).toBe(true);
    });

    it("toggle pans to last known position when starting to follow", () => {
        const map = new StubMap();
        const service = new StubGeoLocationService();
        const factory = new CapturingWidgetFactory();

        let pannedTo: [number, number] | undefined;
        map.panTo = (latLng) => { pannedTo = latLng; };

        const widget = makeWidget(map, service, factory);
        widget.render();

        service.simulatePosition([47.674, -122.121]);
        factory.capturedToggle!();

        expect(pannedTo).toEqual([47.674, -122.121]);
    });

    it("creates position marker on first position update", () => {
        const map = new StubMap();
        const service = new StubGeoLocationService();
        const factory = new StubWidgetFactory();
        const layerFactory = new StubLayerFactory();

        const widget = makeWidget(map, service, factory, layerFactory);
        widget.render();

        service.simulatePosition([47.674, -122.121]);

        expect(layerFactory.positionMarkers).toHaveLength(1);
        expect(layerFactory.positionMarkers[0].addedTo).toBe(map);
    });

    it("updates position marker on subsequent position updates", () => {
        const map = new StubMap();
        const service = new StubGeoLocationService();
        const factory = new StubWidgetFactory();
        const layerFactory = new StubLayerFactory();

        const widget = makeWidget(map, service, factory, layerFactory);
        widget.render();

        service.simulatePosition([47.674, -122.121]);
        service.simulatePosition([47.675, -122.122]);

        expect(layerFactory.positionMarkers).toHaveLength(1);
        expect(layerFactory.positionMarkers[0].latLng).toEqual([47.675, -122.122]);
    });

    it("creates accuracy ring on first position update", () => {
        const map = new StubMap();
        const service = new StubGeoLocationService();
        const factory = new StubWidgetFactory();
        const layerFactory = new StubLayerFactory();

        const widget = makeWidget(map, service, factory, layerFactory);
        widget.render();

        service.simulatePosition([47.674, -122.121], 120);

        expect(layerFactory.accuracyRings).toHaveLength(1);
        expect(layerFactory.accuracyRings[0].addedTo).toBe(map);
    });

    it("accuracy ring is added before position marker so dot renders on top", () => {
        const map = new StubMap();
        const service = new StubGeoLocationService();
        const factory = new StubWidgetFactory();
        const layerFactory = new StubLayerFactory();

        const addOrder: string[] = [];
        const origCreateRing = layerFactory.createAccuracyRing.bind(layerFactory);
        const origCreateMarker = layerFactory.createPositionMarker.bind(layerFactory);
        layerFactory.createAccuracyRing = (...args) => {
            const h = origCreateRing(...args);
            const origAddTo = h.addTo.bind(h);
            h.addTo = (m) => { addOrder.push("ring"); origAddTo(m); };
            return h;
        };
        layerFactory.createPositionMarker = (...args) => {
            const h = origCreateMarker(...args);
            const origAddTo = h.addTo.bind(h);
            h.addTo = (m) => { addOrder.push("dot"); origAddTo(m); };
            return h;
        };

        const widget = makeWidget(map, service, factory, layerFactory);
        widget.render();
        service.simulatePosition([47.674, -122.121], 120);

        expect(addOrder).toEqual(["ring", "dot"]);
    });

    it("updates accuracy ring on subsequent position updates", () => {
        const map = new StubMap();
        const service = new StubGeoLocationService();
        const factory = new StubWidgetFactory();
        const layerFactory = new StubLayerFactory();

        const widget = makeWidget(map, service, factory, layerFactory);
        widget.render();

        service.simulatePosition([47.674, -122.121], 120);
        service.simulatePosition([47.675, -122.122], 60);

        expect(layerFactory.accuracyRings).toHaveLength(1);
        expect(layerFactory.accuracyRings[0].latLng).toEqual([47.675, -122.122]);
        expect(layerFactory.accuracyRings[0].radius).toBe(60);
    });

    it("removes accuracy ring and position marker on denial", () => {
        const map = new StubMap();
        const service = new StubGeoLocationService();
        const factory = new StubWidgetFactory();
        const layerFactory = new StubLayerFactory();

        const widget = makeWidget(map, service, factory, layerFactory);
        widget.render();

        service.simulatePosition([47.674, -122.121], 80);
        service.simulateDenied();

        expect(layerFactory.accuracyRings[0].removed).toBe(true);
        expect(layerFactory.positionMarkers[0].removed).toBe(true);
    });

    it("removes accuracy ring and position marker on destroy", () => {
        const map = new StubMap();
        const service = new StubGeoLocationService();
        const factory = new StubWidgetFactory();
        const layerFactory = new StubLayerFactory();

        const widget = makeWidget(map, service, factory, layerFactory);
        widget.render();

        service.simulatePosition([47.674, -122.121]);
        widget.destroy();

        expect(layerFactory.accuracyRings[0].removed).toBe(true);
        expect(layerFactory.positionMarkers[0].removed).toBe(true);
    });
});
