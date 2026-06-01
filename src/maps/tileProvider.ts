export interface TileProvider {
    readonly urlTemplate: string;
    readonly maxZoom: number;
    readonly attribution: string;
    readonly subdomains?: string | string[];
}

export const osmTileProvider: TileProvider = {
    urlTemplate: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    maxZoom: 19,
    attribution: "&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors",
};

export const cartoTileProvider: TileProvider = {
    urlTemplate: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    maxZoom: 19,
    attribution:
        "&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors " +
        "&copy; <a href='https://carto.com/attributions'>CARTO</a>",
    subdomains: "abcd",
};

let _active: TileProvider = cartoTileProvider;

export function getActiveTileProvider(): TileProvider {
    return _active;
}

export function setActiveTileProvider(provider: TileProvider): void {
    _active = provider;
}
