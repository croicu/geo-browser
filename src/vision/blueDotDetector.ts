import { getLogger } from "../services";

export interface DetectionResult {
    confidence: number;  // 0–1; product of blue_score × ring_score
    x: number;           // normalised 0–1 within image natural dimensions
    y: number;
}

// Confidence at or above this value triggers automatic 1-DOF pin on paste.
export const AUTO_PIN_THRESHOLD = 0.1;

const WORK_WIDTH = 512;
// Window diameters tried in the multi-scale scan (px at WORK_WIDTH resolution).
// Covers the dot's white ring across 1×/2×/3× DPI screenshots normalised to 512 px wide.
// Smaller sizes (10, 12) catch dots on low-DPI or already-cropped images.
const SCALES = [10, 12, 14, 18, 22, 26] as const;

// Ring zone is split into this many angular sectors for uniformity scoring.
// The heading cone typically covers 1-2 sectors; the worst (100% - TOP_SECTOR_PCT)
// sectors are excluded so the cone does not drag down the ring score.
const N_SECTORS = 8;
const TOP_SECTOR_PCT = 0.75;         // average the best 6 of 8 sectors
// Minimum number of ring sectors that must exceed SECTOR_WHITE_MIN to accept a candidate.
// A genuine "you are here" dot has white ring in 5-7 sectors (all minus heading cone).
// ETA cards and UI rectangles have white only on 1-3 sides → filtered out.
const MIN_RING_SECTORS  = 4;
const SECTOR_WHITE_MIN  = 0.20;

interface ZoneOffsets {
    inner: Array<[number, number]>;           // offsets within blue-fill circle (r ≤ 0.35W)
    ring:  Array<[number, number, number]>;   // [dx, dy, sector] within white-ring annulus (0.35W < r ≤ 0.5W)
}

function buildZoneOffsets(W: number): ZoneOffsets {
    // Inner zone covers the blue fill core (r ≤ 0.35W).
    // Ring zone (0.35W–0.50W) targets where the white ring actually sits — the outer
    // 15 % of the radius — rather than the wide W/4–W/2 band that was mostly blue fill.
    const inner_r2 = (W * 0.35) * (W * 0.35);
    const outer_r2 = (W / 2) * (W / 2);
    const inner: Array<[number, number]>           = [];
    const ring:  Array<[number, number, number]>   = [];
    const r = Math.ceil(W / 2);

    for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
            const d2 = dx * dx + dy * dy;
            if (d2 <= inner_r2) {
                inner.push([dx, dy]);
            } else if (d2 <= outer_r2) {
                const angle  = Math.atan2(dy, dx);
                const sector = Math.floor((angle + Math.PI) / (2 * Math.PI) * N_SECTORS) % N_SECTORS;
                ring.push([dx, dy, sector]);
            }
        }
    }

    return { inner, ring };
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
    const rn = r / 255, gn = g / 255, bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const l   = (max + min) / 2;

    if (max === min) return [0, 0, l];

    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    let h: number;
    if (max === rn)      h = (gn - bn) / d + (gn < bn ? 6 : 0);
    else if (max === gn) h = (bn - rn) / d + 2;
    else                 h = (rn - gn) / d + 4;

    return [h * 60, s, l];  // hue in degrees 0–360
}

function isBlue(r: number, g: number, b: number): boolean {
    const [h, s, l] = rgbToHsl(r, g, b);
    return h >= 205 && h <= 235 && s > 0.55 && l >= 0.38 && l <= 0.68;
}

function isWhiteish(r: number, g: number, b: number): boolean {
    const [, s, l] = rgbToHsl(r, g, b);
    return l > 0.82 && s < 0.28;
}

interface Candidate {
    cx: number;
    cy: number;
    W: number;
    blueScore: number;
    ringScore: number;
    dotScore: number;
    normX: number;
    normY: number;
}

// Synchronous. Runs in < 5 ms on typical phone screenshots.
// Returns null only if no blue pixel was found at all.
export function detectBlueDot(img: HTMLImageElement): DetectionResult | null {
    if (!img.naturalWidth || !img.naturalHeight) return null;

    // --- Downsample to fixed working width ---
    const workW = WORK_WIDTH;
    const workH = Math.round(workW * img.naturalHeight / img.naturalWidth);

    const canvas = document.createElement("canvas");
    canvas.width  = workW;
    canvas.height = workH;

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(img, 0, 0, workW, workH);
    const { data } = ctx.getImageData(0, 0, workW, workH);

    const px = (x: number, y: number): [number, number, number] => {
        const i = (y * workW + x) * 4;
        return [data[i], data[i + 1], data[i + 2]];
    };

    // Precompute zone offset lists once per scale
    const zones = SCALES.map(W => ({ W, ...buildZoneOffsets(W) }));

    let bestScore = 0;
    let bestX     = 0;
    let bestY     = 0;

    // Diagnostic: track stage pass counts, top candidates, and spatial heatmap
    let stage1Pass = 0;
    let stage2Pass = 0;
    let stage3Pass = 0;
    const topCandidates: Candidate[] = [];
    // 10×10 grid of stage-1 hit counts (col = normX band, row = normY band)
    const GRID = 10;
    const heatmap = new Uint16Array(GRID * GRID);

    for (const { W, inner, ring } of zones) {
        // Stride W/5 limits the center-miss to W/10, enough to land within
        // ~1-2 px of the dot center. W/3 still allowed W/6 miss which, for a
        // narrow white ring (2-3 px), meant the ring zone slid off the ring
        // entirely and ring_score collapsed.
        const stride = Math.max(1, Math.round(W / 5));
        const margin = Math.ceil(W / 2);

        for (let cy = margin; cy < workH - margin; cy += stride) {
            for (let cx = margin; cx < workW - margin; cx += stride) {

                // Stage 1 — center pixel (eliminates ~90 % of positions)
                const [r0, g0, b0] = px(cx, cy);
                if (!isBlue(r0, g0, b0)) continue;
                stage1Pass++;
                const gx = Math.min(GRID - 1, Math.floor(cx / workW * GRID));
                const gy = Math.min(GRID - 1, Math.floor(cy / workH * GRID));
                heatmap[gy * GRID + gx]++;

                // Stage 2 — inner circle blue fraction (overall, not sector-split).
                let blueCount = 0;
                for (const [dx, dy] of inner) {
                    const [r, g, b] = px(cx + dx, cy + dy);
                    if (isBlue(r, g, b)) blueCount++;
                }
                const blueScore = blueCount / inner.length;
                if (blueScore < 0.4) continue;
                stage2Pass++;

                // Stage 3 — sector-aware white ring score with circular coverage check.
                // The ring zone is divided into N_SECTORS angular buckets.  The top
                // TOP_SECTOR_PCT bucket fractions are averaged to get ringScore, ignoring
                // the heading cone sectors (which score 0).
                //
                // KEY FILTER: at least MIN_RING_SECTORS sectors must show outerWhite above
                // SECTOR_WHITE_MIN.  A genuine "you are here" dot has white ring in 5-7
                // sectors; ETA cards and UI rectangles have white on only 1-3 sides and
                // fail this check.
                const sectorWhite = new Uint16Array(N_SECTORS);
                const sectorTotal = new Uint16Array(N_SECTORS);
                for (const [dx, dy, sector] of ring) {
                    const [r, g, b] = px(cx + dx, cy + dy);
                    sectorTotal[sector]++;
                    if (isWhiteish(r, g, b)) sectorWhite[sector]++;
                }
                const fracs = Array.from({ length: N_SECTORS }, (_, s) =>
                    sectorTotal[s] > 0 ? sectorWhite[s] / sectorTotal[s] : 0);

                let goodSectors = 0;
                for (const f of fracs) {
                    if (f > SECTOR_WHITE_MIN) goodSectors++;
                }
                if (goodSectors < MIN_RING_SECTORS) continue;
                stage3Pass++;

                fracs.sort((a, b) => b - a);
                const topK = Math.ceil(N_SECTORS * TOP_SECTOR_PCT);
                let fracSum = 0;
                for (let i = 0; i < topK; i++) fracSum += fracs[i];
                const ringScore = fracSum / topK;
                const dotScore  = blueScore * ringScore;

                // Keep top 20 candidates for diagnostic logging
                const candidate: Candidate = {
                    cx, cy, W,
                    blueScore: Math.round(blueScore * 1000) / 1000,
                    ringScore: Math.round(ringScore * 1000) / 1000,
                    dotScore:  Math.round(dotScore  * 1000) / 1000,
                    normX: Math.round(cx / workW * 1000) / 1000,
                    normY: Math.round(cy / workH * 1000) / 1000,
                };
                topCandidates.push(candidate);
                if (topCandidates.length > 20) {
                    topCandidates.sort((a, b) => b.dotScore - a.dotScore);
                    topCandidates.pop();
                }

                if (dotScore > bestScore) {
                    bestScore = dotScore;
                    bestX     = cx;
                    bestY     = cy;
                }
            }
        }
    }

    const log = getLogger();
    log.info("blue_dot.scan_stats", {
        workW, workH,
        stage1Pass, stage2Pass, stage3Pass,
    });

    // Log heatmap as ASCII grid: each cell = normX band (col) × normY band (row).
    // '.' = 0 hits, '1'-'9' = 1-9 hits, '+' = 10-49, '#' = 50+
    // Row 0 = top of image (normY 0.0-0.1), col 0 = left (normX 0.0-0.1).
    const rows: string[] = [];
    for (let gy = 0; gy < GRID; gy++) {
        let row = "";
        for (let gx = 0; gx < GRID; gx++) {
            const n = heatmap[gy * GRID + gx];
            row += n === 0 ? "." : n < 10 ? String(n) : n < 50 ? "+" : "#";
        }
        rows.push(`y${gy * 10}-${gy * 10 + 9}% ${row}`);
    }
    log.info("blue_dot.heatmap (x=0-100% left-to-right, each col=10%)", { grid: rows.join(" | ") });

    topCandidates.sort((a, b) => b.dotScore - a.dotScore);
    for (let i = 0; i < topCandidates.length; i++) {
        const c = topCandidates[i];
        log.info(`blue_dot.candidate[${i}]`, {
            rank: i + 1,
            normX: c.normX, normY: c.normY,
            W: c.W,
            blueScore: c.blueScore,
            ringScore: c.ringScore,
            dotScore: c.dotScore,
        });
    }

    if (bestScore === 0) return null;

    return {
        confidence: bestScore,
        x: bestX / workW,
        y: bestY / workH,
    };
}
