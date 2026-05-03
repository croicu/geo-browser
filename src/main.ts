import "./style.css";

// import L from "leaflet";
// import "leaflet/dist/leaflet.css";

import { getLogger, setLogger } from "./services"
import { ConsoleTelemetrySink, DefaultLogger } from "./logging";
import { resolveCatalogUrl } from "./catalog/loader";
import { GeoCatalog } from "./catalog/catalog";

import type { ResolveCatalogUrlOptions } from "./catalog/loader";

setLogger(new DefaultLogger(new ConsoleTelemetrySink()));

const logger = getLogger();
logger.info("geo-browser starting");

const params = new URLSearchParams(window.location.search);

function getCatalogOptions(debug: string | null): ResolveCatalogUrlOptions {
    if (debug === null) {
        return {};
    }

    if (debug === "1") {
        return {
            headUrl: "/catalog.head.debug.json",
            fallbackUrl: "/catalogs/catalog.debug.json",
        };
    }

    return {};
}

async function main(): Promise<void> {
    const app = document.querySelector<HTMLDivElement>("#app");
    const logger = getLogger();

    if (!app) {
        throw new Error("Missing #app element.");
    }

    app.innerHTML = `
        <main class="intro-map">
            <img class="world-map" src="/world.svg" alt="World map" />
            <div class="bubbles-layer"></div>
        </main>
    `;

    logger.info("geo-browser starting");

    const catalogUrl = await  resolveCatalogUrl(getCatalogOptions(params.get("debug")));
    logger.info("catalog resolved", { catalogUrl });

    const catalog = new GeoCatalog(catalogUrl);

    await catalog.load();
    logger.info("catalog loaded", { areaCount: catalog.areas.length });

    for (const area of catalog.areas) {
        logger.info("loading area", { areaId: area.id, areaName: area.name });

        await area.load();

        logger.info("area loaded", {
            areaId: area.id,
            layerCount: area.layers.length,
        });
    }

    logger.info("areas loaded", { areaCount: catalog.areas.length });

    // next:
    // render bubbles into .bubbles-layer
}

main().catch((err) => {
    getLogger().error("app.start.failed", {
        message: err instanceof Error ? err.message : String(err),
    });
});

// const map = L.map("map").setView([40.8518, 14.2681], 13);

// L.tileLayer(
//   "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", 
//   { attribution: "&copy; OpenStreetMap contributors", }
// ).addTo(map);

