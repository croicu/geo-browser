import "./style.css";
import "leaflet/dist/leaflet.css";

import { ConsoleTelemetrySink, DefaultLogger } from "./logging";
import { setLogger } from "./services";
import { resolveCatalogUrl } from "./catalog/loader";
import { GeoCatalog } from "./catalog/catalog";
import { Controller } from "./app/controller";

import type { ResolveCatalogUrlOptions } from "./catalog/loader"

function getCatalogOptions(debug: string | null): ResolveCatalogUrlOptions {
    if (debug === "1") {
        return {
            headUrl: "/catalog.head.debug.json",
            fallbackUrl: "/catalogs/catalog.debug.json",
        };
    }

    return {};
}

setLogger(new DefaultLogger(new ConsoleTelemetrySink()));

const params = new URLSearchParams(window.location.search);
const catalogUrl = await resolveCatalogUrl(getCatalogOptions(params.get("debug")));
const catalog = new GeoCatalog(catalogUrl);
const controller = new Controller({ catalog });

await controller.start().catch((err) => {
    console.error(err);
});
