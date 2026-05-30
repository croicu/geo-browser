import { Decoration, EditorView, ViewPlugin, WidgetType } from "@codemirror/view";
import type { DecorationSet, ViewUpdate } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { Range } from "@codemirror/state";

const HEX_RE = /^"(#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3}(?:[0-9a-fA-F]{2})?)?)"$/;

function toFullHex(hex: string): string {
    if (hex.length === 4) {
        return "#" + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
    }
    return hex.slice(0, 7);
}

const widgetPos = new WeakMap<HTMLElement, { from: number; to: number }>();

class ColorSwatchWidget extends WidgetType {
    private readonly _hex: string;
    private readonly _from: number;
    private readonly _to: number;

    constructor(hex: string, from: number, to: number) {
        super();
        this._hex = hex;
        this._from = from;
        this._to = to;
    }

    eq(other: ColorSwatchWidget): boolean {
        return other._hex === this._hex && other._from === this._from;
    }

    toDOM(): HTMLElement {
        const picker = document.createElement("input");
        picker.type = "color";
        picker.value = toFullHex(this._hex);

        const swatch = document.createElement("span");
        swatch.className = "cm-color-swatch";
        swatch.style.backgroundColor = this._hex;
        swatch.appendChild(picker);

        widgetPos.set(swatch, { from: this._from, to: this._to });
        return swatch;
    }

    ignoreEvent(): boolean {
        return false;
    }
}

function buildDecorations(view: EditorView): DecorationSet {
    const widgets: Range<Decoration>[] = [];
    for (const { from, to } of view.visibleRanges) {
        syntaxTree(view.state).iterate({
            from,
            to,
            enter(node) {
                if (node.name !== "String") return;
                const raw = view.state.doc.sliceString(node.from, node.to);
                const match = HEX_RE.exec(raw);
                if (!match) return;
                widgets.push(
                    Decoration.widget({
                        widget: new ColorSwatchWidget(match[1], node.from, node.to),
                        side: 0,
                    }).range(node.from),
                );
            },
        });
    }
    return Decoration.set(widgets);
}

function onColorChange(event: Event, view: EditorView): boolean {
    const target = event.target as HTMLInputElement;
    if (target.type !== "color" || !target.parentElement) return false;
    const pos = widgetPos.get(target.parentElement);
    if (!pos) return false;
    view.dispatch({ changes: { from: pos.from, to: pos.to, insert: `"${target.value}"` } });
    return true;
}

class JsonColorPickerView {
    decorations: DecorationSet;

    constructor(view: EditorView) {
        this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate): void {
        if (update.docChanged || update.viewportChanged) {
            this.decorations = buildDecorations(update.view);
        }
    }
}

const jsonColorPickerTheme = EditorView.baseTheme({
    ".cm-color-swatch": {
        display: "inline-block",
        width: "12px",
        height: "12px",
        borderRadius: "2px",
        marginRight: "0.4ch",
        marginTop: "-2px",
        verticalAlign: "middle",
        outline: "1px solid rgba(0,0,0,0.3)",
        overflow: "hidden",
        cursor: "pointer",
    },
    ".cm-color-swatch input[type=color]": {
        display: "block",
        width: "100%",
        height: "100%",
        border: "none",
        padding: "0",
        opacity: "0",
        cursor: "pointer",
    },
});

export const jsonColorPicker = [
    ViewPlugin.fromClass(JsonColorPickerView, {
        decorations: (v) => v.decorations,
        eventHandlers: { change: onColorChange },
    }),
    jsonColorPickerTheme,
];
