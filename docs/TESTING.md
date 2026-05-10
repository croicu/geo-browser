# Testing

## Commands

```bash
npm test
npm run test:run
```

`npm test` runs Vitest watch mode.
`npm run test:run` runs one-shot.

## Structure

```text
tests/
  unit/
  stubs/
  fakes/
  fixtures/
```

## Rules

- Unit tests must run offline.
- Unit tests must not import Leaflet.
- Unit tests must not hit network.
- Use DI stubs/fakes over module mocks.
- Test behavior and wiring, not exact pixels.
- Reset global singletons between tests.

## Context Reset

Use a setup file if configured:

```ts
import { afterEach } from "vitest";
import { Context } from "../src/runtime/context";

beforeEach(() => {
    Context.resetForTest();
});

afterEach(() => {
    Context.resetForTest();
});
```

At minimum, reset after each test.

## Fetch Stubbing

Local helper is acceptable:

```ts
function stubFetch(payload: unknown): void {
    vi.stubGlobal("fetch", async () => {
        return {
            ok: true,
            json: async () => payload,
        };
    });
}
```

Cleanup:

```ts
afterEach(() => {
    vi.unstubAllGlobals();
});
```

## Leaflet Testing

Do not fake Leaflet. Fake the contracts the app uses.

Example:

```ts
class StubMap implements MapHandle {
    remove(): void {
    }
}

class StubMapFactory implements MapFactory {
    createMap(): MapHandle {
        return new StubMap();
    }
}
```

## What to Assert

Good assertions:

- element exists
- factory called
- marker/layer added to map
- click emits controller intent
- destroy removes handles
- layer visibility reconciliation creates/destroys expected LayerViews
- coordinate conversion is correct

Avoid brittle assertions:

- exact pixel positioning
- exact CSS details unless behavior-critical
- Leaflet internals

## Network Validation

The project has validated offline unit testing by physically disconnecting network and running tests.

Keep that invariant.
