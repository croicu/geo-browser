import type { GatewayService } from "../../src/contracts";
import type { Cookie, EventDef, MethodDef } from "../../src/api";

export interface StubInvocation {
    id: string;
    data: unknown;
    callback?: (response: unknown) => void;
}

export class StubGateway implements GatewayService {
    public readonly invocations: StubInvocation[] = [];

    invoke<TIn, TOut>(def: MethodDef<TIn, TOut>, data: TIn, callback?: (response: TOut) => void): void {
        this.invocations.push({
            id: def.id,
            data,
            callback: callback as ((response: unknown) => void) | undefined,
        });
    }

    subscribe<TIn, TOut>(_def: EventDef<TIn, TOut>, _fn: (data: TIn) => TOut | void): Cookie {
        return 0;
    }

    unsubscribe(_cookie: Cookie): void {}

    respond(index: number, response: unknown): void {
        this.invocations[index]?.callback?.(response);
    }
}
