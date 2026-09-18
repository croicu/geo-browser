import "./style.css";
import "leaflet/dist/leaflet.css";

import { Controller } from "./app/controller";
import { GeoCatalog } from "./catalog/catalog";
import { Context } from "./runtime/context";
import { LocalStorageService } from "./runtime/localStorageService";
import { renderStartupError, renderVersionBadge } from "./runtime/appDiagnostics";

// Rendered first, unconditionally -- independent of everything below succeeding, so "which build
// is this" is always answerable just by looking at the screen (see appDiagnostics.ts).
renderVersionBadge(document.body, __APP_VERSION__);

const context = Context.Instance;
context.setStorage(new LocalStorageService());

const catalogUrl = await context.resolveCatalogUrl();
const catalog = new GeoCatalog(catalogUrl, { groupFilter: context.groupFilter });

const controller = new Controller({
    catalog,
    storage: context.storage,
    gateway: context.host.gateway,
    initialCenter: context.initialCenter,
    initialZoom: context.initialZoom,
});

await controller.start().catch((err) => {
    context.logger.error("app.start_failed", err, {});
    const app = document.querySelector<HTMLDivElement>("#app");
    if (app) {
        renderStartupError(app, err instanceof Error ? err.message : String(err));
    }
});
