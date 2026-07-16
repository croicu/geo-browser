# Area Grouping

**Status: Ready to Submit** (geo-browser side implemented and verified — `tsc --noEmit`
clean, `npm run build` clean, all 199 unit tests pass, end-to-end browser check against
the real `public/catalog.json` confirms all three filter cases; geo-builder side was
already done when this task file was created in this repo — see Acceptance Checklist
below).

## Summary

Replace the separate debug catalog files with a single `catalog.json` containing
all areas. Areas gain an optional `group` attribute. A query-string filter
narrows which areas are shown; with no filter, all areas show (including
debug-tagged ones).

## Data Model

`AreaSummary` (catalog entry) gains an optional field:

```ts
group?: string[];
```

- Omitted or empty array = ungrouped.
- `"debug"` is not a special type — it's just a conventional group name used
  by convention for areas that only make sense during development/testing.
- An area may belong to multiple groups.

## Files

- Delete `catalog.head.debug.json` and `catalog.debug.json`.
- `catalog.head.json` → `catalog.json` becomes the only pair. It contains
  every area, including anything previously only in the debug catalog.
- Two-step fetch (`catalog.head.json` → fallback `catalogs/catalog.json`)
  stays as-is, minus the debug branch.

## Query String Filtering

Client-side, applied after the catalog is fetched — not a server/build-time
concern.

Parse into a single `groupFilter: string | null`:

1. `?group=<name>` present → `groupFilter = <name>`.
2. Else, `?debug=<truthy>` present → `groupFilter = "debug"` (back-compat
   shorthand).
3. Neither present → `groupFilter = null`.

If both `group` and `debug` are present, `group` wins.

Apply when building the area list for Summary:

- `groupFilter === null` → include **all** areas, no filtering. This is the
  default — debug-tagged areas are visible by default, same as everything
  else.
- `groupFilter !== null` → include only areas whose `group` array contains
  `groupFilter` (exact string match).

> **Superseded 2026-07-15:** the single-filter-value constraint above no longer holds —
> geo-builder always emits *every* configured group as a comma-separated `?group=` value
> (e.g. `?group=debug,Europe`), not just the first. `groupFilter` should therefore be
> `string[] | null` (parsed by splitting on `,`), not `string | null`.
>
> The intended semantics as of this writing are **AND, not OR** — an area must belong to
> *all* listed groups to show, so "include only areas whose `group` array contains
> `groupFilter`" below would become "include only areas whose `group` array is a superset
> of `groupFilter`". But this is explicitly **not a contract geo-builder enforces or cares
> about** — geo-builder only joins the configured groups into the query string and is
> agnostic to how geo-browser interprets them; the AND/OR call may still change before this
> is implemented. Whatever semantics geo-browser lands on, geo-builder needs no further
> changes — see `docs/MESSAGING.md` (geo-builder repo) for the query string it actually
> emits.

V1 supports a single filter value only — no comma-separated / multi-group
queries (e.g. `?group=a,b` is out of scope). *(Superseded — see note above.)*

## Context Changes

> **Superseded 2026-07-15:** the plan below (replace `debug` outright with a single
> `groupFilter: string | null`) is stale on two counts: (1) `groupFilter` is now
> `string[] | null` per the Superseded note in Query String Filtering above, and (2)
> `Context.debug` is **kept**, not removed — it already has unrelated jobs
> (`GeoLocationWidget`'s synthetic-heading debug mode, debug-only buttons in
> `ImageOverlayWidget`'s toolbar) that predate this task and have nothing to do with
> catalog/area filtering. Deleting it would silently break those features. This mirrors
> the geo-builder-side decision to keep `settings.debug` and `settings.group` as
> independent inputs (see Builder-Side Decisions above) — `Context.debug` and
> `Context.groupFilter` are two independent fields on `Context`, not one replacing the
> other. `?debug=1` alone still maps to `groupFilter = ["debug"]` as a back-compat
> shorthand (see Query String Filtering above), but that's `groupFilter`'s derivation,
> not a reason to delete the underlying flag.

Actual implementation: `Context` gained a new `groupFilter: string[] | null` getter
(`src/runtime/context.ts`), computed from the query string per the rules in Query
String Filtering above. `Context.debug: boolean` is unchanged and still serves its
existing non-filtering purposes.

## Out of Scope (V2)

- ~~Comma-separated / multi-value group filters.~~ **Now in scope — see the Superseded
  note above.**
- Group as a visible UI control (picker, toggle, chips).
- Nested or hierarchical groups.
- Group membership editable in design mode / builder UI.

## Builder-Side Decisions (this repo)

- **Group assignment (V1)**: new `settings.json` array field `"group": ["debug", "foo"]` (also
  mergeable via `settings.local.json`, same override rule as every other setting — the same
  literal name `group` is used for the settings field, the `Area`/`AreaSummary` field, and the
  query-string param; nothing is pluralized). `Builder.add_area()` — the single choke point
  where new `Area` entries are created, for both CLI build-mode acquisition from `template.json`
  and the designer's `AddArea` API — stamps every newly created area with
  `group=list(Settings.current().group)`. "Current session" = one `geo-builder` process
  invocation, since `Settings` is loaded once per run. No new per-call API input, no builder UI
  — matches the V2-out-of-scope note above that group editing isn't exposed anywhere yet. This
  fully replaces the earlier draft of this plan, which tied group-stamping to the existing
  `debug: bool` flag — that coupling is explicitly rejected; `group` is a new, independent
  settings field.
- **`settings.debug` (bool) keeps its existing jobs, plus the query string**: (1) re-raising
  exceptions instead of printing them (`cli.py`), (2) per-worker debug snapshots under
  `./build/` (`builder.py`), (3) WebView2 remote-debugging port (`host.py`), and (4) appending
  `?debug=1` to `designUrl` when `true` — this was originally removed and then restored: `debug`
  stays in the query string, in sync with the setting, but its role there is purely browser-side
  diagnostics. It has **no role in area selection** — that's `group`'s job exclusively, and the
  two params are independent (both can appear together, e.g.
  `?design=1&debug=1&group=debug,Europe`). `debug` has no effect on catalog file layout (that
  mechanism is deleted outright, see below).
- **Multi-group query string**: geo-builder appends `?group=<all of settings.group,
  comma-joined>` to `designUrl` when `settings.group` is non-empty (e.g. `group: ["debug",
  "Europe"]` → `?group=debug,Europe`) — every configured group, not just the first. This
  supersedes the original V1 "single filter value only" constraint in the Query String
  Filtering section above — see the Superseded note there. geo-builder itself is agnostic
  to how geo-browser interprets multiple groups (AND vs. OR) — it just joins and passes them
  through; see the Superseded note for the intended-but-not-locked-in semantics.
- **Migration**: none. No real data lives only in `catalog.debug.json` today; this is a clean
  schema change.
- After this change there must be **zero** remaining references anywhere to
  `catalog.debug.json` / `catalog.head.debug.json` — `debug` is fully removed as a parameter to
  `load_catalog` / `save_catalog` / `save_catalog_meta` / `save_area_to_catalog` /
  `_resolve_catalog_url`, and `pull.py` only ever fetches `catalog.head.json`.

## Implementation Plan

1. `protocols.py`: `Area` gains `group: list[str] = field(default_factory=list)`.
2. `api.py`: `AreaSummary` gains the same `group: list[str] = field(default_factory=list)`
   (wire type mirrors `Area` exactly, as it already does for every other field).
3. `settings.py`: `Settings` gains `group: list[str] = field(default_factory=list)`, parsed
   from `settings.json`/`settings.local.json`'s `"group"` array (validated as a list, same
   style as `providers`). Keep the `if debug and design_url is not None: …?debug=1` block
   as-is (pure diagnostics flag now); add
   `if group and design_url is not None: …?group=<','.join(group)>` after it.
4. `entities/geo_area.py`:
   - `GeoArea.load()` reads `group` from `area_payload` (default `[]`) into `Area(...)`.
   - New `GeoArea.group` property (mirrors `.bbox`, `.manifestUrl`, etc.) for callers in
     `host.py` that build `AreaSummary` from a `GeoArea`.
5. `builder.py`: `Builder.add_area()` sets `group=list(Settings.current().group)` on the new
   `Area`.
6. `persistence.py`: drop the `debug` parameter and all debug-catalog constants/writes
   (`_CATALOG_HEAD_DEBUG`, `_DEFAULT_CATALOG_URL_DEBUG`, the `catalog.head.debug.json` write in
   `save_catalog`/`save_catalog_meta`). `_resolve_catalog_url` / `_default_catalog_url` collapse
   to the single-file case.
7. `designer/pull.py`: `_HEAD_FILES`/`_HEAD_DEFAULTS` collapse to `catalog.head.json` only.
8. `cli.py`: drop `debug=` from `load_catalog`/`save_catalog` calls. Keep `debug=settings.debug`
   passed to `_launch_designer` (remote-debugging port) and the `if settings.debug: raise`
   branch untouched.
9. `designer/host.py`: drop `debug=debug` from every `load_catalog`/`save_catalog`/
   `save_catalog_meta`/`save_area_to_catalog` call; the `debug: bool` parameter itself stays
   threaded through (still used for the remote-debugging-port arg). Pass `group=` through in
   the three `AreaSummary(...)` construction sites (`_fire_area_changed`, `on_add_area`,
   `on_put_area_json`).
10. Docs: `docs/MESSAGING.md` (`AreaSummary` TS interface, `catalog.json` shape, drop the
    `catalog.head.debug.json` paragraph, document `?group=` designUrl append), `docs/PROTOCOL.md`
    / `docs/ARCHITECTURE.md` if they reference the debug catalog files, `Area` shape, or
    `settings.json` schema.
11. Tests: update `test_pull.py`, `test_persistence.py`, `test_cli.py`, `test_builder.py`,
    `test_user_layer.py` — remove `debug=True/False` args and debug-catalog-file assertions;
    add coverage for `group` round-tripping, `Settings.group` parsing, the `Builder.add_area`
    group stamping, and the `?debug=1`/`?group=` designUrl appends (independent of each other).

## Acceptance Checklist

**geo-builder (this repo) — done:**

- [x] `catalog.head.debug.json` and `catalog.debug.json` removed from repo
      and build output (zero references left anywhere in `src/`).
- [x] `Area` / `AreaSummary` gain `group: list[str]` (empty by default).
- [x] `settings.json` `group` array stamps every newly created area's
      `group` for the current session (`Builder.add_area`).
- [x] `settings.debug` no longer affects catalog file layout or area
      selection; its other jobs (exception re-raise, `./build/` snapshots,
      WebView2 remote-debugging port, and appending `?debug=1` to
      `designUrl` as a pure diagnostics flag in sync with the setting) are
      untouched / restored.
- [x] geo-builder appends `?group=<all of settings.group, comma-joined>` to `designUrl`
      when `group` is non-empty (e.g. `?group=debug,Europe`), independent of `?debug=1`.
- [x] `docs/MESSAGING.md`, `docs/PROTOCOL.md`, `docs/ARCHITECTURE.md` updated.
- [x] 411 tests pass (`test_settings.py` new; `test_builder.py`,
      `test_geo_area.py`, `test_persistence.py` extended for `group`;
      `test_pull.py`/`test_persistence.py`/`test_cli.py` de-debug-catalog'd).
      `ruff format` / `ruff check` clean.

**geo-browser (this repo) — done:**

- [x] `catalog.json` includes all areas (formerly-debug-only areas now
      present with `group: ["debug"]`) — `public/catalog.json` /
      `public/catalog.head.json` regenerated by geo-builder;
      `catalog.head.debug.json` / `catalog.debug.json` deleted from `public/`.
- [x] No query string → all areas render, including debug-tagged ones
      (`GeoCatalog.load()` skips filtering when `groupFilter === null`).
- [x] `?debug=1` → only areas with `"debug"` in `group` render
      (`Context.parseGroupFilter` back-compat shorthand → `groupFilter = ["debug"]`).
- [x] `?group=<name>` → only areas with `<name>` in `group` render.
- [x] `?group=<a,b>` → AND semantics — area's `group` must be a superset of
      the filter (`matchesGroupFilter` in `src/catalog/groupFilter.ts`).
- [x] `?group=<name>&debug=1` → `group` wins; `Context.debug` itself stays
      `true` (used for its own unrelated diagnostics), but has no role in
      area selection once `group` is present.
- [x] `Context.groupFilter: string[] | null` added; `Context.debug: boolean`
      kept as an independent field (see Superseded note in Context Changes
      above — deleting it would break `GeoLocationWidget`/`ImageOverlayWidget`
      debug features unrelated to catalog filtering).
- [x] `AreaSummary.group?: string[]` added to `src/protocols.ts`.
- [x] `GeoCatalog` takes `{ groupFilter }` via a `GeoCatalogOptions` constructor
      arg (DI, not a direct `Context` import) and filters `catalog.areas`
      in `load()`; wired from `Context.groupFilter` in `src/main.ts`.
      `GeoCatalog.addArea()` (used by the `AddArea` designer flow) is
      intentionally **not** filtered — a newly created area always shows
      immediately regardless of the active filter.
- [x] `docs/MESSAGING.md` / `docs/PROTOCOL.md` updated (surgical edits only —
      an earlier working-tree version of this task had accidentally pasted
      in geo-builder's own `PROTOCOL.md` content and a stale pre-precompute
      `__void__` description into `docs/MESSAGING.md`; both were reverted
      before making the real edits).
- [x] Unit tests: `tests/unit/runtime.test.ts` (groupFilter parsing, all four
      query-string cases), `tests/unit/catalog.groupFilter.test.ts`
      (`matchesGroupFilter` pure logic), `tests/unit/catalog.test.ts`
      (`GeoCatalog` filtering integration). `npx tsc --noEmit` clean, all
      199 tests pass.
