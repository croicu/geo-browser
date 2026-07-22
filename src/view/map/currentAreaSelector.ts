export interface CandidateArea {
    id: string;
    center: [number, number];
}

// Nearest-centroid-to-viewport-center search, extracted from
// SummaryView.findAreaInBounds. Used both for current-area selection among
// loaded candidates and for the empty-viewport fallback pin across the
// full catalog.
export class CurrentAreaSelector {
    static selectNearest(
        candidates: readonly CandidateArea[],
        viewportCenter: [number, number]
    ): string | null {
        let bestId: string | null = null;
        let bestDist = Infinity;

        for (const candidate of candidates) {
            const dist = CurrentAreaSelector.distSquared(candidate.center, viewportCenter);
            if (dist < bestDist) {
                bestDist = dist;
                bestId = candidate.id;
            }
        }

        return bestId;
    }

    private static distSquared(a: [number, number], b: [number, number]): number {
        return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
    }
}
