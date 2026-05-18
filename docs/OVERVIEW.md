# OVERVIEW.md

## Role Split

- **Claude (this conversation)**: PM and marketing voice — product decisions, feature prioritization, launch copy, README, announcements.
- **Claude Code**: Developer voice — implementation, architecture, code.
- **John**: Engineer, and founder. Occasionally patronizing toward PMs. Justified. Ships. 😄

Paste these two URLs at the start of any new conversation to restore full context:
```
https://raw.githubusercontent.com/croicu/geo-browser/main/CLAUDE.md
https://raw.githubusercontent.com/croicu/geo-browser/main/docs/OVERVIEW.md
```

---

## Origin Story

John and his wife were visiting Naples. Google Maps routed them from Capodimonte
down through Rione Sanità — one of Naples' most notorious neighborhoods — on a narrow,
deserted, rundown street. His wife nearly had a panic attack.

The alternative route via Viale Colli Aminei was only 2 minutes faster on paper.
Google Maps picked the wrong one by every measure: slower AND more dangerous.

**RioneSanità is the tool that would have prevented that.**

The Capodimonte → Piazza Cavour walk is the canonical validation test:
if the heatmap shows Rione Sanità visibly darker than the Viale Colli Aminei
alternative, the concept is validated.

---

## What RioneSanità Is

A heatmap of urban liveliness, built from OpenStreetMap POI density, that helps
travelers intuitively identify neighborhoods worth walking through — before they walk
through them.

**Core insight**: where cafes, churches, piazzas, fountains, shops, and markets
cluster is where a city is alive. The absence of amenities signals the absence of
life — and the presence of risk — without ever using the word "dangerous."

**It is not a navigation app.** RioneSanità shows data. The user decides where to walk.
This is intentional — zero liability, zero controversy.

---

## The Composite Signal (Key Algorithm Decision)

Single signals are insufficient:

- **OSM amenity density alone**: measures infrastructure, not actual human activity.
  A street with 20 closed cafes still scores high.
- **Photo density alone** (e.g. Flickr): high photo counts can indicate
  notable-but-unsafe locations. Rione Sanità has thousands of photos online
  precisely *because* it looks rough. Dark tourism, urban decay photography,
  documentarians.

**The right signal is the combination**:

```
High photos + high amenities = lively neighborhood → GO
High photos + low amenities = danger tourism / urban decay → AVOID
Low photos + low amenities = dead area → AVOID
Low photos + high amenities = quiet residential → NEUTRAL
```

Multiply the signals rather than add them. Zero amenities kills the photo score
entirely. This is how Rione Sanità scores correctly: lots of photos, almost no
amenities → red flag.

**Current V1 implementation**: OSM amenity density only via Overpass API.
Flickr was considered but dropped — moved to a paid subscription model ($20/month)
making it unsuitable. Photo density layer is a V2 consideration.

---

## Nearest Competitor: Hoodmaps

**hoodmaps.com** — crowdsourced neighborhood vibe maps. Brutally honest
("No locals, just tourists and pickpockets" over Barcelona's tourist center).
Has a "Crime" layer based on crowdsourced opinion.

**How RioneSanità differs**:
- Objective data signal (OSM POI density) vs. subjective human opinion
- Offline-first — works with no connectivity
- Street-level heatmap granularity vs. large hand-drawn blobs
- Baked static data — no server dependency at runtime
- No crowdsourcing needed — data comes from OSM

Hoodmaps validates the market: people want honest city intelligence that
Google Maps won't give them. RioneSanità delivers it more reliably and objectively.

---

## The Offline-First Constraint (Non-Negotiable)

**The core user scenario**:
1. At home before the trip: open RioneSanità, the Naples area loads and caches via PWA service worker
2. On the plane: app works, no connectivity needed
3. In the catacombs under Naples: full offline, tap a dot, get context
4. In Rione Sanità: know to turn around before you're in too deep

**Every architectural decision flows from this constraint**:
- Static GeoJSON files generated at build time — not live API calls
- Nominatim reverse geocoding data baked into GeoJSON by the builder — not fetched live
- PWA with service worker — caches all assets on first load
- Cloudflare Pages hosting — static files, CDN, no server

This was not an accident. It was designed this way from the start.

---

## The Early Adopter

John's wife. Her UX reactions are a reliable product signal.

- The Capodimonte panic attack → motivated the entire product
- Tapping heatmap dots and expecting information → drove the decision to bake
  Nominatim reverse geocoding data into GeoJSON at build time
- "She tapped it and nothing happened, therefore it must do something" —
  best user feedback, always the most direct

---

## What Was Considered and Dropped

**Strada** — considered as product name, evocative Italian name for "the street."
Dropped in favor of RioneSanità — simpler, self-explanatory, works across languages.

**Routing engine** — considered and explicitly rejected. RioneSanità shows a heatmap,
the user decides where to walk. Adding routing would create liability and complexity.

**Flickr photo density** — considered as the primary data signal. Dropped because
Flickr moved to a paid subscription model. May be reconsidered for V2 as a
complementary signal on top of OSM amenity density.

**Walking satisfaction metric** — discussed as a broader framing. Captured in the
composite signal instead.

**Live Nominatim API calls** — considered for popup data when user taps a dot.
Rejected because it breaks offline-first. Solution: bake geocoding data into
GeoJSON at build time via the builder.

**Crime data** — considered as a routing signal. No reliable free source exists.
Irrelevant anyway — the composite signal (high photos + low amenities) identifies
the same areas without needing crime data, without liability, and without controversy.

---

## Architecture Summary (PM View)

Two separate repos, two separate tools:

**geo-browser** (github.com/croicu/geo-browser)
- The PWA the traveler uses on their phone
- Static HTML + TypeScript + Leaflet + leaflet.heat
- Renders catalog-driven GeoJSON heatmaps
- Hosted on Cloudflare Pages at geo-browser.croicu.com
- Fully offline after first load

**geo-builder** (separate repo, in development)
- Local desktop tool John runs before a trip
- Python + pywebview
- Opens a browser UI — drag a rectangle over a city on the map
- Rectangle coordinates sent via pywebview JS bridge to Python
- Python queries Overpass API, crunches GeoJSON, bakes in Nominatim data
- Sends result back to browser for preview and adjustment
- Final GeoJSON pushed to GitHub → auto-deployed to Cloudflare Pages

**The flow**:
```
John draws rectangle in builder
  → Overpass query for OSM POIs
  → Nominatim reverse geocoding baked in
  → GeoJSON generated
  → Pushed to GitHub
  → Cloudflare auto-deploys
  → Wife opens PWA on phone, area cached
  → Works offline in the catacombs
```

---

## Pending Deliverables (PM → Marketing)

When the builder is complete and the product is stable:

1. **GitHub README** — technical, for the OSM and developer community
2. **OSM community launch announcement** — for OSM forums and subreddits
3. **Landing page copy** — for geo-browser.croicu.com

All three anchor on the same origin story: the guy who got sent through Rione Sanità
by Google Maps and built something better out of spite.

---

## Misc Notes

- John has been at Microsoft for 27 years as a developer
- Based in Seattle
- Uses swipe typing on iPhone — autocomplete errors should be interpreted charitably
- Can be self-admittedly patronizing toward PM-style thinking
- The product is MIT licensed and open source
- Personal tool first — John and his wife are the target users
- "Freshness is not a concern" — Rione Sanità has been sketchy since the 17th century
- Cities planned: Naples (done), Prague, Dresden, Berlin
- Cloudflare free plan: 20,000 files max, 25MB per file — not a concern for personal use
- GitHub is the source of truth; Cloudflare just serves what's in the repo
