# Share Target (PWA)

## Status: Postponed

Tracked in [#35](https://github.com/croicu/geo-browser/issues/35). Blocked on CORS wall / resolver approach — CF Worker vs iframe+xhr.responseURL proof-of-concept needed before proceeding.

## Problem Statement

When a user is planning a route in Google Maps and wants to understand the neighborhood at their destination, they should be able to tap **Share → CityLife** directly from Google Maps. CityLife receives the share, extracts the destination, drops a marker on the map, and opens the detail view for the nearest catalog area.

### Primary Use Case

1. User has Google Maps open with a route to a destination (e.g. a clinic, store, office).
2. User taps the Share button in Google Maps.
3. User selects CityLife from the system share sheet.
4. CityLife opens (or comes to foreground).
5. CityLife drops a marker at the destination and opens the detail view for the nearest area.

### What Google Maps Actually Shares

The share payload from Google Maps iOS is a URL — not an image. The URL is a Firebase Dynamic Link short form:

```
https://maps.app.goo.gl/azbu2C8tVctkCeUu8?g_st=it
```

The `g_st=it` suffix indicates a share from Google Maps iOS. The short URL redirects (302) to a full `maps.google.com` URL that contains all the route parameters.

---

## Redirect Chain Analysis

Curl of the short URL (stopping at first redirect):

```
curl -si --max-redirs 0 "https://maps.app.goo.gl/azbu2C8tVctkCeUu8?g_st=it"

HTTP/1.1 302 Found
Location: https://maps.google.com/?
  geocode=FS892AIdZtC4-A%3D%3D;FaCB1gId9Ka3-...
  &daddr=The+Home+Depot,+325+120th+Ave+NE,+Bellevue,+WA+98005
  &saddr=47.7258710,-122.1057550
  &dirflg=d
  &ftid=0x54906c60ba61f021:0xffa4b146f0cfbc65
  &...
```

The full chain has three hops, all carrying the same parameters:

```
maps.app.goo.gl/...        → 302
maps.google.com/?...       → 302
maps.google.com/maps?...   → 302
www.google.com/maps?...    → 200
```

**Only the first hop is needed.** The 302 Location header already contains:

| Parameter | Value | Meaning |
|-----------|-------|---------|
| `saddr` | `47.7258710,-122.1057550` | User's GPS at share time |
| `daddr` | `The Home Depot, 325 120th Ave NE, Bellevue, WA 98005` | Destination address |
| `dirflg` | `d` | Driving directions |
| `ftid` | `0x54906c60ba61f021:0xffa4b146f0cfbc65` | Google Place ID |

Route alternatives are **not** in the URL — they are computed dynamically when the map page renders.

The `geocode` parameter contains a proprietary binary encoding (not raw IEEE 754 floats); it is not decodable client-side without reverse-engineering Google's format. `saddr` and `daddr` are the only usable fields.

### Test Fixtures

Two real captures from a device, stored as JSON:

- [`tests/fixtures/share_target/home_depot.json`](../tests/fixtures/share_target/home_depot.json) — destination: The Home Depot, Bellevue
- [`tests/fixtures/share_target/bellevue_office.json`](../tests/fixtures/share_target/bellevue_office.json) — destination: 1810 116th Ave NE #100, Bellevue

Each fixture contains `shortUrl`, the raw `redirect.location`, and the `parsed` expected output.

---

## The CORS Wall

The 302 Location header from `maps.app.goo.gl` is unreadable from browser JavaScript or a service worker. The server sends no `Access-Control-Allow-Origin` header. `fetch` with `mode: 'no-cors'` returns an opaque response; `mode: 'cors'` is rejected outright. In both cases `response.url` is empty and no headers are readable.

The request itself reaches Google's servers fine — it originates from the user's device IP. The wall is purely a browser policy that prevents JavaScript from reading the response.

---

## Resolver Architecture Options

### Option A — Cloudflare Worker (server-side)

A minimal worker makes one `fetch(shortUrl, { redirect: 'manual' })`, reads the `Location` header (no CORS restriction server-side), parses `saddr`/`daddr`, returns JSON.

**Concerns raised:**
1. **Worker URL is effectively an API key** — must not live in the repo or in any public file. Delivery mechanism: user shares a specially-formatted URL to CityLife via the share target itself (detected as a config payload, not a Maps share), stored in `localStorage`. Solves the standalone PWA storage isolation problem on iOS (Safari and installed PWA have separate storage; the share target writes directly into the PWA context).
2. **Cloudflare IP ranges are published** — Google could block datacenter IPs from accessing `maps.app.goo.gl`. Low probability (it's a public redirect service), but an external dependency risk outside our control.
3. **Worker is a generic CORS bypass** → SSRF risk. Mitigation: allowlist only `maps.app.goo.gl` and `maps.apple.com`; only follow one redirect hop; return only the `Location` header.
4. **Privacy** — `saddr` (user's GPS at share time) passes through the worker on every share. Inherent to the design.

### Option B — Hidden iframe (client-side, under investigation)

The CORS wall is a browser policy, not a network policy. The request already reaches Google from the user's device. An iframe navigating to the short URL follows the redirect chain browser-side with no datacenter IP involved.

**Key property:** The iframe navigates on the user's device — Google cannot selectively block individual users, so the IP blocking risk of Option A disappears entirely.

**Remaining challenge:** After the iframe follows the chain and lands on `www.google.com/maps?saddr=...&daddr=...`, reading `iframe.contentWindow.location` is blocked by the Same-Origin Policy.

**Candidate mechanisms for reading the URL back:**

- **XHR `responseURL` after CORS failure** — XHR follows redirects, hits the CORS wall at `maps.google.com`, throws an error. `xhr.responseURL` *may* contain the redirect destination URL at the point of failure (browser-dependent, needs testing).
- **SW intercept on return pass** — if the redirect chain can be made to touch our origin at any point, the SW captures it. Currently the chain never touches our origin.
- **CSP `navigate-to` block** — restrict the iframe from navigating to `google.com`; catch the blocked navigation event and read the attempted URL. Feasibility unclear.

**Status:** Not yet proven to work. Needs a small proof-of-concept before committing.

---

## Provider Abstraction

Multiple map apps share different URL formats. The architecture should be a provider registry:

```typescript
interface MapShareProvider {
    canHandle(url: string): boolean;
    resolve(url: string): Promise<MapSharePayload>;
}

interface MapSharePayload {
    destination: LatLng;
    destinationLabel: string;
    origin?: LatLng;       // user's GPS at share time, if present
}
```

A dispatcher tries each registered provider in order; the first `canHandle()` match wins.

| Provider | Detection | Resolution method |
|----------|-----------|-------------------|
| `GoogleMapsProvider` | `maps.app.goo.gl` | Option A or B to expand short URL, parse `daddr` |
| `AppleMapsProvider` | `maps.apple.com` | Apple Maps URLs often carry `ll=lat,lng` directly — may parse client-side, no resolver needed |

The resolver (whether CF Worker or iframe trick) is a dependency of `GoogleMapsProvider` only. The provider owns parsing; the resolver only solves the CORS/redirect problem.

---

## Runtime Config Delivery

The resolver URL (CF Worker endpoint) must not appear in the repo, in any public file, or in the built bundle. Mechanism: the user shares a specially-crafted URL to CityLife via the share sheet. The app detects it is not a Google Maps URL, recognises it as a config payload, saves to `localStorage`, shows a confirmation, and the user deletes the message.

Detection: anything arriving via the share target that is not a recognised map provider URL is treated as a potential config payload.

---

## Share Target Manifest Entry

```json
"share_target": {
  "action": "/share",
  "method": "GET",
  "params": {
    "title": "title",
    "text":  "text",
    "url":   "url"
  }
}
```

GET method — no file upload needed. URL lands as a query parameter on `/share`, readable by the SW without parsing a POST body.

---

## Open Questions

1. **Option B viability** — does `xhr.responseURL` expose the redirect destination on a CORS failure? Needs proof-of-concept on a real device before choosing between A and B.

2. **What does Google Maps put in `text`/`title` for the Web Share Target?** The iMessage link preview showed "Pin to show in Google Maps" — useless for geocoding. The actual Web Share Target payload may differ. Needs real-device testing once the manifest entry is live.

3. **What if the nearest area is far from the destination?** Need a maximum-distance threshold; show a "no nearby area" message instead of opening detail view.

4. **`daddr` as place name only** (e.g. `daddr=Seattle+Center`). Nominatim handles named places; accuracy is lower but acceptable.

5. **Destination marker lifecycle** — session-only? Dismiss on tap? TBD.

6. **Apple Maps URL format** — needs curl investigation equivalent to what was done for Google Maps.

---

## Out of Scope

- Route geometry or alternative routes (not in the URL).
- Image overlay from share (separate task).
- Outbound sharing from CityLife (separate task).
- Desktop (no share sheet; share target is install-only).
