# Coding Style

## General Philosophy

Prefer explicit readable code over terse JavaScript idioms.

This project values:

- explicit ownership
- explicit lifecycle
- explicit contracts
- small narrow abstractions
- easy unit testing

## File and Type Naming

Files are camelCase:

```text
mapView.ts
areaViewState.ts
leafletFactories.ts
```

Types/classes/interfaces are PascalCase:

```ts
MapView
AreaViewState
MapFactory
GeoLayer
```

Private fields use `_` prefix in current code examples.

## Constructor Fields

Because `erasableSyntaxOnly` is enabled, avoid constructor parameter properties.

Bad:

```ts
constructor(private readonly _sink: TelemetrySink) {}
```

Good:

```ts
private readonly _sink: TelemetrySink;

constructor(sink: TelemetrySink) {
    this._sink = sink;
}
```

## Lambdas

Rule:

```text
If a lambda is more than one logical statement, promote it to a method.
```

Bad:

```ts
button.addEventListener("click", () => {
    item.visible = !item.visible;
    this.updateButton(button, item);
    this._actions.setLayerVisible(this._areaId, item.id, item.visible);
});
```

Good:

```ts
button.addEventListener("click", () => {
    this.handleLayerToggle(item, button);
});
```

Even better when binding allows it:

```ts
button.addEventListener("click", this.handleLayerToggle);
```

## Test Doubles

Avoid anonymous inline object fakes.

Bad:

```ts
return { remove(): void {} };
```

Good:

```ts
class StubMapLayerHandle implements MapLayerHandle {
    addTo(_map: MapHandle): void {
    }

    remove(): void {
    }
}
```

## DI Over Module Mocks

Prefer dependency injection over module mocks.

Fake/stub the contract used by the class under test, not the third-party dependency.

## Functions vs Methods

Prefer methods over free/global functions when behavior is semantically part of a class, even if the method does not currently access member variables.

This improves:

- ownership clarity
- discoverability
- subclass extensibility

## Protocols

No functions or classes in `protocols.ts`.

`protocols.ts` is pure data shape.

## Contracts

`contracts.ts` is for cross-boundary runtime behavior:

- controller actions
- logger/sink
- renderer handles/factories
- runtime service contracts

Do not turn `contracts.ts` into a misc helper bucket.
