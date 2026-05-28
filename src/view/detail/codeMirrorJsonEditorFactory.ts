import type { JsonEditor, JsonEditorFactory } from "../../contracts";
import schema from "./manifestSchema.json";

export class CodeMirrorJsonEditorFactory implements JsonEditorFactory {
    async create(container: HTMLElement, initialJson: Record<string, unknown>): Promise<JsonEditor> {
        const { EditorView, basicSetup } = await import("codemirror");
        const { json } = await import("@codemirror/lang-json");
        const { jsonSchema } = await import("codemirror-json-schema");
        const { oneDark } = await import("@codemirror/theme-one-dark");

        const view = new EditorView({
            doc: JSON.stringify(initialJson, null, 2),
            extensions: [basicSetup, json(), jsonSchema(schema), oneDark],
            parent: container,
        });

        return {
            getJson(): Record<string, unknown> {
                return JSON.parse(view.state.doc.toString()) as Record<string, unknown>;
            },
            destroy(): void {
                view.destroy();
            },
        };
    }
}
