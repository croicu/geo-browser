export type TwoTapAction =
    | { kind: "expand"; previous: string | undefined }
    | { kind: "toggle"; visible: boolean };

export class TwoTapState {
    private _expandedId: string | undefined;

    tap(layerId: string, currentVisible: boolean): TwoTapAction {
        if (this._expandedId === layerId) {
            this._expandedId = undefined;
            return { kind: "toggle", visible: !currentVisible };
        }
        const previous = this._expandedId;
        this._expandedId = layerId;
        return { kind: "expand", previous };
    }

    dismiss(): string | undefined {
        const id = this._expandedId;
        this._expandedId = undefined;
        return id;
    }

    get expandedId(): string | undefined {
        return this._expandedId;
    }
}
