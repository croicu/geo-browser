import "./style.css";
import "leaflet/dist/leaflet.css";

import { Controller } from "./app/controller";
import { GeoCatalog } from "./catalog/catalog";
import { Context } from "./runtime/context";
import { LocalStorageService } from "./runtime/localStorageService";

const context = Context.Instance;
context.setStorage(new LocalStorageService());

const catalogUrl = await context.resolveCatalogUrl();
const catalog = new GeoCatalog(catalogUrl);

const controller = new Controller({
    catalog,
    storage: context.storage,
    gateway: context.host.gateway,
});

await controller.start().catch((err) => {
    context.logger.error("app.start_failed", err, {});
});
