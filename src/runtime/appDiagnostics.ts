// Always-visible startup diagnostics, deliberately independent of Controller/MapView/Leaflet ever
// successfully constructing anything -- both functions here operate on plain DOM elements handed
// to them, no app state required. This exists because a silent console.error() with no on-screen
// fallback made a real production bug (geo-browser#107, a blank screen on offline cold-start)
// practically undebuggable on an installed phone PWA with no attached console -- confirmed live,
// the device just showed nothing with no way to tell why short of a Mac + USB + Safari's remote
// Web Inspector. Both are plain DOM manipulation, Leaflet-free and network-free, so they're
// unit-testable with happy-dom per CLAUDE.md's testing rules.

export function renderVersionBadge(root: HTMLElement, version: string): void {
    const badge = document.createElement("div");
    badge.className = "app-version-badge";
    badge.textContent = version;
    root.appendChild(badge);
}

// Called from main.ts's top-level startup .catch() -- replaces whatever (nothing, in practice)
// was in the root element with a plain-language error the user can actually read and relay,
// instead of a blank screen with no signal at all.
export function renderStartupError(root: HTMLElement, message: string): void {
    root.innerHTML = "";

    const container = document.createElement("div");
    container.className = "app-startup-error";

    const heading = document.createElement("h2");
    heading.textContent = "Couldn't start geo-browser";
    container.appendChild(heading);

    const detail = document.createElement("p");
    detail.textContent = message;
    container.appendChild(detail);

    const hint = document.createElement("p");
    hint.textContent = "Check your connection and try reloading.";
    container.appendChild(hint);

    root.appendChild(container);
}
