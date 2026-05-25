import { AreaChanged, GetAreaJson, OK, PutAreaJson } from "../../api";
import type { Cookie, GetAreaJsonOutput, ManifestJson, PutAreaJsonOutput } from "../../api";
import type { GatewayService, JsonEditor, JsonEditorFactory, MapHandle, WidgetHandle } from "../../contracts";
import { getLogger } from "../../services";

export interface ManifestEditorWidgetOptions {
    editorFactory: JsonEditorFactory;
    onReload?: () => void;
}

export class ManifestEditorWidget {
    private readonly _map: MapHandle;
    private readonly _gateway: GatewayService;
    private readonly _areaId: string;
    private readonly _editorFactory: JsonEditorFactory;
    private readonly _onReload: () => void;

    private _buttonHandle?: WidgetHandle;
    private _spinner?: HTMLElement;
    private _editorOverlay?: HTMLElement;
    private _jsonEditor?: JsonEditor;
    private _areaChangedCookie?: Cookie;
    private _putPending = false;
    private _queuedReload = false;

    constructor(
        map: MapHandle,
        gateway: GatewayService,
        areaId: string,
        options: ManifestEditorWidgetOptions
    ) {
        this._map = map;
        this._gateway = gateway;
        this._areaId = areaId;
        this._editorFactory = options.editorFactory;
        this._onReload = options.onReload ?? (() => undefined);
    }

    render(): void {
        if (this._buttonHandle) {
            return;
        }

        const button = document.createElement("button");
        button.type = "button";
        button.className = "manifest-editor-button";
        button.title = "Edit area manifest";

        const img = document.createElement("img");
        img.src = "/icons/design-edit.svg";
        img.alt = "Edit";
        button.appendChild(img);

        button.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.onEditClick();
        });

        this._buttonHandle = this._map.addControl("topleft", button);

        this._areaChangedCookie = this._gateway.subscribe(AreaChanged, ({ area }) => {
            if (area.id !== this._areaId) {
                return;
            }
            this.onAreaChanged();
        });
    }

    destroy(): void {
        if (this._areaChangedCookie !== undefined) {
            this._gateway.unsubscribe(this._areaChangedCookie);
            this._areaChangedCookie = undefined;
        }

        this._buttonHandle?.remove();
        this._buttonHandle = undefined;

        this.hideEditorOverlay();
        this.hideSpinner();
    }

    private onEditClick(): void {
        this._gateway.invoke(GetAreaJson, { areaId: this._areaId }, response => {
            this.onGetResponse(response);
        });
    }

    private onGetResponse(response: GetAreaJsonOutput): void {
        if (response.error !== OK) {
            getLogger().warning("manifest_editor.get_failed", { error: response.error, desc: response.errorDescription });
            return;
        }

        this.showEditorOverlay(response.manifest!);
    }

    private showEditorOverlay(manifest: ManifestJson): void {
        const overlay = document.createElement("div");
        overlay.className = "manifest-editor-overlay";

        const panel = document.createElement("div");
        panel.className = "manifest-editor-panel";

        const content = document.createElement("div");
        content.className = "manifest-editor-content";

        const toolbar = document.createElement("div");
        toolbar.className = "manifest-editor-toolbar";

        const cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.className = "manifest-editor-cancel";
        cancelBtn.textContent = "Cancel";
        cancelBtn.addEventListener("click", () => this.onEditorCancel());

        const saveBtn = document.createElement("button");
        saveBtn.type = "button";
        saveBtn.className = "manifest-editor-save";
        saveBtn.textContent = "Save";
        saveBtn.addEventListener("click", () => this.onEditorSave());

        toolbar.appendChild(cancelBtn);
        toolbar.appendChild(saveBtn);
        panel.appendChild(content);
        panel.appendChild(toolbar);
        overlay.appendChild(panel);

        this.blockMapEvents(overlay);

        this._map.getContainer().appendChild(overlay);
        this._editorOverlay = overlay;

        this.loadEditor(content, manifest);
    }

    private blockMapEvents(element: HTMLElement): void {
        const stop = (e: Event) => e.stopPropagation();
        for (const type of ["wheel", "mousedown", "mouseup", "click", "dblclick", "touchstart", "touchend", "touchmove"]) {
            element.addEventListener(type, stop, { passive: false });
        }
    }

    private loadEditor(container: HTMLElement, manifest: ManifestJson): void {
        this._editorFactory.create(container, manifest).then(editor => {
            if (!this._editorOverlay) {
                editor.destroy();
                return;
            }
            this._jsonEditor = editor;
        }).catch((error: unknown) => {
            getLogger().error("manifest_editor.create_failed", error);
            this.hideEditorOverlay();
        });
    }

    private onEditorSave(): void {
        if (!this._jsonEditor) {
            return;
        }

        let manifest: ManifestJson;
        try {
            manifest = this._jsonEditor.getJson();
        } catch {
            getLogger().warning("manifest_editor.invalid_json", {});
            return;
        }

        this.hideEditorOverlay();
        this.showSpinner();
        this._putPending = true;

        this._gateway.invoke(PutAreaJson, { areaId: this._areaId, manifest }, response => {
            this.onPutResponse(response);
        });
    }

    private onEditorCancel(): void {
        this.hideEditorOverlay();
    }

    private hideEditorOverlay(): void {
        this._jsonEditor?.destroy();
        this._jsonEditor = undefined;
        this._editorOverlay?.remove();
        this._editorOverlay = undefined;
    }

    private onPutResponse(response: PutAreaJsonOutput): void {
        this._putPending = false;
        this.hideSpinner();

        if (response.error !== OK) {
            getLogger().warning("manifest_editor.put_failed", { error: response.error, desc: response.errorDescription });
        }

        if (this._queuedReload) {
            this._queuedReload = false;
            this._onReload();
        }
    }

    private onAreaChanged(): void {
        if (this._putPending) {
            this._queuedReload = true;
            return;
        }
        this._onReload();
    }

    private showSpinner(): void {
        if (this._spinner) {
            return;
        }

        const overlay = document.createElement("div");
        overlay.className = "area-build-overlay";

        const content = document.createElement("div");
        content.className = "area-build-overlay-content";

        const ring = document.createElement("div");
        ring.className = "area-build-spinner-ring";

        const label = document.createElement("div");
        label.className = "area-build-overlay-label";
        label.textContent = "Saving…";

        content.appendChild(ring);
        content.appendChild(label);
        overlay.appendChild(content);

        this._map.getContainer().appendChild(overlay);
        this._spinner = overlay;
    }

    private hideSpinner(): void {
        this._spinner?.remove();
        this._spinner = undefined;
    }
}
