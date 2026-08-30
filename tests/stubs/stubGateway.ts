import type { GatewayService } from "../../src/contracts";
import type { Cookie, EventDef, MethodDef } from "../../src/api";

export interface StubInvocation {
    id: string;
    data: unknown;
    callback?: (response: unknown) => void;
}

export interface StubSubscription {
    cookie: Cookie;
    id: string;
    fn: (data: unknown) => unknown;
}

export class StubGateway implements GatewayService {
    public readonly invocations: StubInvocation[] = [];
    public readonly subscriptions: StubSubscription[] = [];
    public readonly unsubscribed: Cookie[] = [];

    private _nextCookie = 0;

    invoke<TIn, TOut>(def: MethodDef<TIn, TOut>, data: TIn, callback?: (response: TOut) => void): void {
        this.invocations.push({
            id: def.id,
            data,
            callback: callback as ((response: unknown) => void) | undefined,
        });
    }

    subscribe<TIn, TOut>(def: EventDef<TIn, TOut>, fn: (data: TIn) => TOut | void): Cookie {
        const cookie = this._nextCookie++;
        this.subscriptions.push({
            cookie,
            id: def.id,
            fn: fn as (data: unknown) => unknown,
        });
        return cookie;
    }

    unsubscribe(cookie: Cookie): void {
        this.unsubscribed.push(cookie);
    }

    respond(index: number, response: unknown): void {
        this.invocations[index]?.callback?.(response);
    }

    // Simulates the builder firing an event: invokes every still-subscribed
    // handler registered for `id`, in subscribe order.
    fire(id: string, data: unknown): void {
        for (const sub of this.subscriptions) {
            if (sub.id === id && !this.unsubscribed.includes(sub.cookie)) {
                sub.fn(data);
            }
        }
    }
}
