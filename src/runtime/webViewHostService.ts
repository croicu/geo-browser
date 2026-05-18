import type { GatewayService, HostService } from "../contracts";
import { Gateway } from "../designer/gateway";

export class WebViewHostService implements HostService {
    private readonly _gateway: GatewayService | null;

    constructor(mode: "browse" | "design") {
        this._gateway = mode === "design" ? new Gateway() : null;
    }

    get gateway(): GatewayService | null {
        return this._gateway;
    }

    getCapability(_name: string): unknown {
        return undefined;
    }
}
