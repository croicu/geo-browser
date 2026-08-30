---
name: geo-browser-call-gateway-method
description: Use when adding TypeScript-side support for a geo-builder gateway method or event — mirroring a new/changed src/geo_builder/api.py entry into src/api.ts, calling it, or subscribing to an event. Triggers on requests like "call the new geo-builder API from geo-browser", "mirror this Python API method in api.ts", "subscribe to a gateway event", "add design-mode support for X". Encodes the api.ts mirroring convention and the mode-selection-at-composition pattern that keeps browse/design branching out of call sites — the actual answer to "how should rendering degrade in browse mode."
---

# Calling a gateway method or handling an event

geo-browser only runs the design-mode gateway when hosted by geo-builder inside a WebView
(`?design=1`); in plain browse mode there is no gateway at all. This skill is about writing new
gateway-backed code so that distinction never has to be checked ad hoc at a call site.

The Python-side contract this mirrors is defined in `src/geo_builder/api.py` and documented in
`docs/MESSAGING.md`; defining/registering the Python side is a separate skill
(`geo-builder-expose-gateway-method`) owned by that repo. This skill only covers the TypeScript
side: mirroring the contract and calling it correctly.

## 1. Mirror the contract in `src/api.ts`

Every Python dataclass in `api.py` becomes a TypeScript `interface`; every `*_ID` constant becomes
a `MethodDef`/`EventDef` object. Type mapping (see `docs/MESSAGING.md`):

| Python        | TypeScript         |
|---------------|--------------------|
| `str`         | `string`           |
| `int`/`float` | `number`           |
| `bool`        | `boolean`          |
| `list[T]`     | `T[]`              |
| `dict[str,T]` | `Record<string,T>` |
| `T \| None`   | `T \| null`        |

```typescript
export interface RemoveUserPointInput {
    areaId: string;
    lon: number;
    lat: number;
}

export interface RemoveUserPointOutput {
    error: number;
    errorDescription: string | null;
}

export const RemoveUserPoint: MethodDef<RemoveUserPointInput, RemoveUserPointOutput> = {
    id: "__geo_remove_user_point__",
    _kind: "method",
};
```

For an event, use `EventDef` and `_kind: "event"` instead — same shape otherwise.

**The `id` string must match the Python `_ID` constant exactly**, character for character. This
is the entire routing mechanism — there's no compiler or schema to catch a typo here, only a
silently-dead message at runtime.

**New error codes**: append to the shared `OK`/`ERR_*` const block in `api.ts`, using the *same
integer* the Python side assigned in `api.py`. These are a wire contract, not something either
side picks independently.

## 2. Never branch on mode or null-check `gateway` at the call site

`HostService.gateway` is typed `GatewayService | null` — `null` in browse mode. That type is a
deliberate trap for the wrong instinct: it exists so nothing calls it directly from UI/view code.

If the new capability is one that behaves differently (or isn't available at all) in browse mode
vs. design mode, model it as an interface in `contracts.ts` with **two** concrete implementations
— mirror the existing `UserPointsStore` / `LocalStorageUserPointsStore` / `GatewayUserPointsStore`
split:

```typescript
export interface UserPointsStore {
    getPoints(areaId: string): Promise<unknown>;
    addPoint(areaId: string, lat: number, lon: number, pressure: number, poiProperties?: Record<string, unknown>): Promise<void>;
    removePoint(areaId: string, lon: number, lat: number): Promise<void>;
}
```

One implementation is backed by `StorageService`/`localStorage` (browse mode); the other is backed
by `GatewayService.invoke(...)` (design mode). `Context` (`runtime/context.ts`) picks which one to
construct **once, at composition time**, based on `Context.mode` — not the view, not the widget
that ends up calling it. Everything downstream depends on the interface and never learns which
mode it's running in. This is the actual mechanism behind "rendering must never assume browse vs.
design mode" — it's enforced by construction, not by scattered `if (gateway)` checks.

**This does not apply to design-mode-only flows with no browse-mode equivalent at all** — e.g.
`AddArea`/`SetAreaBbox`-driven UI (drawing a new area, dragging its bbox). There is nothing to
build a second implementation *of*; browse mode simply can't do this. For these, a direct
`if (!this._gateway) return;`/early-return guard at the one call site that owns the flow (see
`Controller.commitArea`, `BboxWidget`) is correct and is the existing convention — it is not the
"wrong instinct" this section warns about. The interface+DI split is specifically for capabilities
that behave differently, not ones that are entirely absent, in browse mode.

## 3. A gateway-backed implementation never throws to its caller

Wrap `gateway.invoke(Def, input, callback)` in a `Promise`; in the callback, check
`response.error !== OK`, log a warning, and resolve with a safe fallback — never reject:

```typescript
getPoints(areaId: string): Promise<unknown> {
    return new Promise((resolve) => {
        this._gateway.invoke(GetUserPoints, { areaId }, (response) => {
            if (response.error !== OK || !response.geojson) {
                this._log.warning("user_points_store.get_points.error", { areaId, error: response.error });
                resolve(EMPTY_COLLECTION);
                return;
            }
            resolve(response.geojson);
        });
    });
}
```

The fallback value should match what the *browse-mode* implementation already returns on its own
failure paths (missing key, parse error) — an empty collection, `void`, `null` — so the two
implementations are symmetric in failure behavior, not just in success behavior. A caller that
only ever tested the happy path on one implementation should still behave correctly on the other.

**Branch only on the numeric `error` field, never on `errorDescription`.** That field is for
logging only — `docs/MESSAGING.md` states this explicitly on the Python side too; it's a wire
contract, not a per-side convention either repo can quietly relax.

## 4. Subscribing to an event

```typescript
const cookie = gateway.subscribe(AreaChanged, (data) => {
    // handle data.area
});
// later:
gateway.unsubscribe(cookie);
```

`gateway` here is still the same `GatewayService | null` from `HostService` — an event-driven
feature that only makes sense in design mode should live behind the same interface-and-composition
pattern as section 2, not a direct null-check at the subscribe call (except the design-mode-only
carve-out above — `Controller`/`BboxWidget`-style flows may null-check directly).

**Pick a subscription lifecycle deliberately — there are two shapes in this codebase:**

- **Component-scoped**: subscribe in `render()`, unsubscribe in `destroy()`. Use when the event
  can arrive at any time the component is mounted, unrelated to any one call this component makes
  (`ManifestEditorWidget` subscribing to `AreaChanged` — the manifest can change from outside the
  widget's own edits).
- **Request-scoped**: subscribe immediately before the triggering `invoke()`, unsubscribe inside
  that `invoke`'s response callback — *and* defensively in `destroy()`, in case the component is
  torn down mid-request. Use when the event only makes sense while one specific call is in flight
  (`TaskProgress` alongside `AddArea`/`SetAreaBbox` — see `Controller.commitArea`, `BboxWidget`).
  Never leave a request-scoped subscription live past its response; the next call to the same flow
  would otherwise stack a duplicate handler.

**Filter by payload id when the event is a broadcast, not inherently scoped to your request.**
`TaskProgressData`/`AreaChanged` carry `areaId` because the same event fires for whatever the
builder is doing, not just for your caller. If you already know the id (editing an existing area:
`BboxWidget` filters `data.areaId === this._areaId`), check it before acting. If you don't yet —
creating a brand-new area, before its id exists — there's nothing to filter on; only subscribe for
the duration of that one request and accept any message that arrives while it's pending.

**Testing**: `tests/stubs/stubGateway.ts`'s `StubGateway` records every `subscribe()` call
(`gateway.subscriptions`) and every `unsubscribe()` call (`gateway.unsubscribed`), and exposes
`gateway.fire(id, data)` to simulate the builder emitting an event. Use it to assert forwarding,
id-filtering, and unsubscribe-on-response/destroy — don't reach for a module mock for this.

## 5. Update `docs/MESSAGING.md`

Mandatory in the same change — geo-browser's own `CLAUDE.md` states a "Cross-Repo Contract Rule":
any change to `src/api.ts` (adding, removing, or renaming a method/event or its payload types)
must be reflected in `docs/MESSAGING.md` in the same commit, since that file is what keeps this
repo and geo-builder in sync without a shared schema.
