# Logging API

**Status: Done**

## Summary

In design mode the geo-builder will expose an API callable by geo-browser in order to
provide logging information in python, inspectable by the end user.
The API will implement the `TelemetrySink` interface.
The enabled categories are going to be passed by the query string (i.e. this reuses the
existing `?logCategory=`/`?debug` gating in `DefaultLogger` — no separate filtering axis).

Scope grew during brainstorm to also cover: today, only exceptions caught by an explicit
`try/catch` (or raised via `fail()`) ever reach the `Logger`. Truly uncaught exceptions and
unhandled promise rejections have no global handler anywhere in `src/` and are invisible to
`Logger`/`TelemetrySink` entirely — they'd stay invisible to geo-builder even after this ships.
This task adds global handlers so those reach the logger too.

## Design

### 1. Gateway telemetry sink (fan-out, not replace)

- New `CompositeTelemetrySink` (in `src/logging.ts`, next to `ConsoleTelemetrySink` — no
  gateway dependency, stays pure) implements `TelemetrySink` by writing to a list of sinks.
- New `GatewayTelemetrySink` (in `src/runtime/`, matching where `GatewayUserPointsStore`
  lives — it depends on `GatewayService`) calls `gateway.invoke(WriteTelemetryRecord, ...)` per
  record, fire-and-forget (no callback).
- `Context` (`src/runtime/context.ts`) wires:
  ```ts
  this._host = new WebViewHostService(this._mode); // moved up, before _logger construction
  const sinks: TelemetrySink[] = [new ConsoleTelemetrySink()];
  if (this._design && this._host.gateway) {
      sinks.push(new GatewayTelemetrySink(this._host.gateway));
  }
  this._logger = new DefaultLogger(new CompositeTelemetrySink(sinks), this.parseLogCategories(params), this._debug);
  ```
- Browse mode: console only (unchanged). Design mode: console + gateway, same category
  gating applies to both since `DefaultLogger.write()` filters before dispatching to the sink.

### 2. Wire contract (`src/api.ts`)

```ts
export interface WriteTelemetryRecordInput {
    timestamp: string;
    level: "diagnostic" | "info" | "warning" | "error" | "fatal";
    category: string;
    message: string;
    props?: Record<string, unknown>;
    errorDetail: string | null; // serialized Error (message + stack); NOT the response error-code field
}

export interface WriteTelemetryRecordOutput {
    error: number;
    errorDescription: string | null;
}

export const WriteTelemetryRecord: MethodDef<WriteTelemetryRecordInput, WriteTelemetryRecordOutput> = {
    id: "__geo_write_telemetry_record__",
    _kind: "method",
};
```

`errorDetail` (not `error`) deliberately avoids colliding with the API Shape Rule's universal
`error: number` response-code field on the same payload family.

Per Cross-Repo Contract Rule, this new `MethodDef`/payload must be reflected in
`docs/MESSAGING.md` in the same commit as `api.ts`.

### 3. Recursion gotcha (must-fix, not optional)

`GatewayTelemetrySink.write()` must never route its own failures back through
`getLogger().error(...)` — that would be a log call whose own delivery failure logs again,
recursing. On `invoke` failure (or a non-`OK` `WriteTelemetryRecordOutput.error`), fall back to a
raw `console.error(...)`, bypassing `Logger` entirely.

### 4. Global uncaught-exception / unhandled-rejection handlers

- Installed unconditionally (both modes) — this is about `Logger` visibility in general, not
  a design-mode-only concern. Only the *forwarding to geo-builder* (section 1) is design-mode
  gated.
- `Context` is the external-world boundary (Hard Architecture Rules), so it owns installation:
  ```ts
  private readonly _onWindowError = (event: ErrorEvent): void => {
      this._logger.fatal("window.uncaught_error", event.error ?? event.message);
  };
  private readonly _onUnhandledRejection = (event: PromiseRejectionEvent): void => {
      this._logger.fatal("window.unhandled_rejection", event.reason);
  };
  ```
  registered in the constructor via `window.addEventListener("error"/"unhandledrejection", ...)`.
- No new `LogCategory` — these are genuine anomalies per the Log Categories doc section
  ("stay on the default `general` category... needed regardless of what's being actively
  debugged"), not verbose/opt-in diagnostic volume.
- **Test-isolation gotcha found during brainstorm**: `tests/setup.ts` constructs a fresh
  `Context.Instance` in every test's `beforeEach` and calls `Context.reset()` in `afterEach`,
  but happy-dom's `window` is shared for the whole test file, not recreated per test. If
  `Context`'s constructor unconditionally calls `window.addEventListener` without ever
  removing the old instance's listeners, every test in a file adds another pair of listeners
  that outlive their `Context` — leaking across tests and eventually firing stale handlers.
  Fix: `Context` needs a teardown (`removeGlobalErrorHandlers()`) that `Context.reset()` calls
  on the outgoing `s_instance` before discarding it:
  ```ts
  public static reset(): void {
      if (Context.s_instance) {
          Context.s_instance.removeGlobalErrorHandlers();
      }
      Context.s_instance = undefined;
      resetLogger();
  }
  ```
- Combined with gotcha #3: if a bug inside `GatewayTelemetrySink.write()` itself throws
  uncaught, the global `error` handler fires, calls `logger.fatal()`, which re-enters
  `write()` — same recursion risk from a different entry point. The console.error-only
  fallback in section 3 is what breaks this loop; it must hold no matter which path triggers
  the sink's failure.

## Geo-builder review

Proposal sent to the geo-builder team via `docs/MESSAGING.md`. No pushback — design as
written above is confirmed, including the `errorDetail` naming. Proceeding to implementation.

## Implementation plan

1. `src/api.ts` — add `WriteTelemetryRecordInput`/`Output` + `WriteTelemetryRecord` MethodDef.
2. `src/logging.ts` — add `CompositeTelemetrySink`.
3. `src/runtime/gatewayTelemetrySink.ts` (new) — `GatewayTelemetrySink implements TelemetrySink`.
4. `src/runtime/context.ts` — reorder `_host` before `_logger`; wire composite sink; add
   `_onWindowError`/`_onUnhandledRejection` fields + install/remove methods; `reset()` tears
   down the outgoing instance's listeners first.
5. Tests: `CompositeTelemetrySink` fan-out (logging.test.ts), `GatewayTelemetrySink` invoke
   payload + console.error-only failure fallback (new runtime test), global handler
   installation/removal + no-leak-across-reset (runtime.test.ts).
6. Docs: finalize `docs/MESSAGING.md` (drop the "Proposal, not yet implemented" callout, fold
   into the Shared Types catalog like the other methods), README if user-facing, IMPLEMENTATION.md
   directory tree, CLAUDE.md Completed Tasks entry + Status: Done on this file.

## Test results

- `npx tsc --noEmit`: clean.
- `npx vitest run`: 310/310 passing (35 files), including new coverage:
  - `tests/unit/logging.test.ts` — `CompositeTelemetrySink` fan-out, zero-sink no-op.
  - `tests/unit/runtime/gatewayTelemetrySink.test.ts` — payload shape, `Error`/non-`Error`
    `errorDetail` serialization, console.error-only fallback on non-`OK`, silent on `OK`.
  - `tests/unit/runtime.test.ts` — global `error`/`unhandledrejection` handlers route to
    `Logger.fatal`, listeners are removed on `Context.reset()` (no leak across the
    per-test `Context.Instance` construction in `tests/setup.ts`), `GatewayTelemetrySink`
    is wired only in design mode.
- Not verified live against a real geo-builder WebView (no host available in this
  environment) — the gateway side of this was validated via `StubGateway`/`window.geo`
  stubs only. Flagging for a manual pass once run against the actual geo-builder build,
  matching the caveat already on Destination Marker's task file for a similar reason.

## Docs updated

`docs/MESSAGING.md` (finalized `WriteTelemetryRecord` section + Shared Types catalog entry),
`docs/IMPLEMENTATION.md` (directory tree, new Telemetry Sinks section, fixed a stale
`Context.resetForTest()` reference in the adjacent Context section), `CLAUDE.md` (this task's
entry). README.md: no change — this feature has no browse-mode/end-user-facing surface.

## Follow-up: `?logCategory=`/`?debug` precedence bug

The geo-builder team's review of the `WriteTelemetryRecord` proposal included details of their
own `settings.json` → `?logCategory=`/`?debug=1` query-string emission (`docs/MESSAGING.md`'s
`WriteTelemetryRecord` → Categories section), which documents that an explicit `?logCategory=`
must win outright over `?debug=1`'s show-everything shorthand — the same precedent already
established for `groupFilter`'s `?group=`/`?debug` relationship.

That exposed a real, pre-existing bug: `Context`'s constructor was passing `this._debug`
straight through as `DefaultLogger.showAllCategories`, with no regard for whether
`?logCategory=` was explicitly set. Since `showAllCategories` bypasses `DefaultLogger`'s
allow-list unconditionally, `?debug=1&logCategory=overpass` silently showed every category,
not just `["overpass"]` — the explicit list was ignored whenever `?debug=1` was also present.

**Fix** (`src/runtime/context.ts`): compute `showAllCategories` as
`this._debug && logCategories === null` instead of `this._debug` alone. `DefaultLogger` itself
needed no change — the bug was entirely in how `Context` computed the flag it hands to it.

**Tests added** (`tests/unit/runtime.test.ts`, describe block "Context log category
precedence"): `?debug=1&logCategory=overpass` shows only `overpass`; `?debug=1` alone still
shows every category; `?logCategory=overpass` alone (no debug) still restricts to the list.

Typecheck clean; full suite 313/313 passing after this fix.

## Follow-up: `?logCategoryExclude=` (new query string)

geo-builder added a new `excludedCategories` setting, forwarded as `?logCategoryExclude=<comma-joined>`
whenever non-empty — sent independently of `?logCategory=`/`?debug=1` (`docs/MESSAGING.md`'s
`WriteTelemetryRecord` → Categories section). geo-builder only emits the param; it explicitly
leaves the combination semantics to geo-browser, same as `groupFilter`'s AND/OR semantics were
geo-browser's own call.

**Design decision**: exclusion is unconditional and wins outright over both `showAllCategories`
(`?debug=1`) and the `?logCategory=` allow-list — checked first in `DefaultLogger.write()`,
before either of the other two gates. No special-casing for `general`: excluding it suppresses
uncategorized calls too, consistent with the project's existing "no special-casing" stance on
unrecognized `?logCategory=` values.

**Implementation**:
- `src/logging.ts` — `DefaultLogger` gains a 4th constructor param, `excludedCategories?: readonly string[] | null`,
  stored as a `Set<string>` and checked first in `write()`.
- `src/runtime/context.ts` — new `parseLogCategoryExclude(params)` (shares a `parseCommaList`
  helper with `parseLogCategories` now, since the two became near-identical), wired into the
  `DefaultLogger` constructor call.

**Tests added**: `tests/unit/logging.test.ts` ("DefaultLogger excludedCategories" — exclusion
wins over `showAllCategories`, wins over an overlapping `enabledCategories` entry, excluding
`general` suppresses uncategorized calls, defaults to empty when omitted); `tests/unit/runtime.test.ts`
(two `Context`-level cases: exclusion under `?debug=1`, exclusion overlapping an explicit
`?logCategory=`).

**Docs updated**: `docs/MESSAGING.md` (geo-browser's chosen semantics documented alongside
geo-builder's emission description, "not yet implemented" flag dropped), `CLAUDE.md` (Log
Categories section + this task's Completed Tasks entry).

Typecheck clean; full suite 319/319 passing after this addition.
