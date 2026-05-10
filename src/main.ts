import "./style.css";
import "leaflet/dist/leaflet.css";

import { Controller } from "./app/controller";
import { GeoCatalog } from "./catalog/catalog";
import { Context } from "./runtime/context";

const context = Context.Instance;

const catalogUrl = await context.resolveCatalogUrl();
const catalog = new GeoCatalog(catalogUrl);

const controller = new Controller({
    catalog,
});

await controller.start().catch((err) => {
    context.logger.error("app.start_failed", err, {});
});