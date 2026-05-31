# User Points Service Worker

## Status: Brainstorm

## Problem statement

User points are currently stored in localStorage (standalone) or routed through the builder gateway (design mode). Neither is durable across devices or browsers. The long-term storage target is a Cloudflare Worker that exposes the same bulk-access contract (`GetUserPoints` / `AddUserPoint`) already used by the gateway path.

## Key constraints

- The `UserPointsStore` interface already abstracts storage; a `CloudflareUserPointsStore` implementation needs to satisfy it without changing callers.
- Access is bulk (`GetUserPoints` returns a full FeatureCollection) — compatible with a simple KV or R2 store keyed by `areaId`.
- `AddUserPoint` must be optimistic (marker placed immediately) and eventually consistent (Worker write may lag).
- Auth: TBD — could be anonymous per-device token, user account, or area-scoped secret.
- Offline support: if the Worker is unreachable, fall back to localStorage and sync on reconnect.
