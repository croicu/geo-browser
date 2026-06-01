export type StatusLevel = "info" | "warning" | "error";

const DISPLAY_MS = 3000;

export class StatusWidget {
    private readonly _el: HTMLSpanElement;
    private _timer?: ReturnType<typeof setTimeout>;

    constructor() {
        const el = document.createElement("span");
        el.className = "status-widget";
        el.hidden = true;
        document.body.appendChild(el);
        this._el = el;
    }

    show(message: string, level: StatusLevel = "error"): void {
        this._el.textContent = message;
        this._el.className = `status-widget status-widget--${level}`;
        this._el.hidden = false;
        clearTimeout(this._timer);
        this._timer = setTimeout(() => {
            this._el.hidden = true;
        }, DISPLAY_MS);
    }

    remove(): void {
        clearTimeout(this._timer);
        this._el.remove();
    }
}

let _instance: StatusWidget | undefined;

export function initStatusWidget(): void {
    _instance = new StatusWidget();
}

export function getStatusWidget(): StatusWidget | undefined {
    return _instance;
}

export function resetStatusWidget(): void {
    _instance?.remove();
    _instance = undefined;
}
