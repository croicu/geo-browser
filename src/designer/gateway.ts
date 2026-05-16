import type { GatewayService } from "../contracts";
import type { Cookie, EventDef, MethodDef } from "../api";
import { Ping, Pong } from "../api";
import { getLogger } from "../services";

type Handler = (data: unknown) => unknown;

interface GeoHost {
    invoke(id: string, payload: unknown, callback?: (data: unknown) => void): void;
    subscribe(id: string, fn: (data: unknown) => unknown): void;
    unsubscribe(id: string): void;
}

declare global {
    interface Window {
        geo?: GeoHost;
    }
}

export class Gateway implements GatewayService {
    private _cookieCounter: number = 0;
    private _registrations: Map<Cookie, { id: string; fn: Handler }> = new Map();

    constructor() {
        this.registerInternals();
    }

    subscribe<TIn, TOut>(def: MethodDef<TIn, TOut>, fn: (data: TIn) => TOut): void {
        window.geo?.subscribe(def.id, fn as Handler);
    }

    unsubscribe<TIn, TOut>(def: MethodDef<TIn, TOut>): void {
        window.geo?.unsubscribe(def.id);
    }

    invoke<TIn, TOut>(def: EventDef<TIn, TOut>, data: TIn, callback?: (response: TOut) => void): void {
        window.geo?.invoke(def.id, data, callback as ((data: unknown) => void) | undefined);
    }

    register<TIn, TOut>(def: EventDef<TIn, TOut>, fn: (data: TIn) => TOut | void): Cookie {
        const cookie = ++this._cookieCounter;
        this._registrations.set(cookie, { id: def.id, fn: fn as Handler });
        this.rebuildSubscription(def.id);
        return cookie;
    }

    unregister(cookie: Cookie): void {
        const reg = this._registrations.get(cookie);
        if (!reg) {
            return;
        }
        this._registrations.delete(cookie);
        this.rebuildSubscription(reg.id);
    }

    private registerInternals(): void {
        this.subscribe(Ping, ({ token }) => {
            getLogger().diagnostic("gateway.ping", { token });
            this.invoke(Pong, { token });
            return { token };
        });
    }

    private rebuildSubscription(id: string): void {
        const handlers: Handler[] = [];
        for (const reg of this._registrations.values()) {
            if (reg.id === id) {
                handlers.push(reg.fn);
            }
        }

        if (handlers.length === 0) {
            window.geo?.unsubscribe(id);
            return;
        }

        window.geo?.subscribe(id, (data) => {
            for (const fn of handlers) {
                fn(data);
            }
        });
    }
}
