import WMTSTileGrid from 'ol/tilegrid/WMTS';
import { toSize } from 'ol/size';
const WMTS_PIXEL_SIZE_ = 0.28E-3;
export function colorZeroPadding(hex) {
    return hex.length === 1 ? `0${hex}` : hex;
}
export function rgbArrayToHex(rgb) {
    const r = rgb[0];
    const g = rgb[1];
    const b = rgb[2];
    if (r !== (r & 255) || g !== (g & 255) || b !== (b & 255)) {
        throw new Error(`"(${r},${g},${b})" is not a valid RGB color`);
    }
    const hexR = colorZeroPadding(r.toString(16));
    const hexG = colorZeroPadding(g.toString(16));
    const hexB = colorZeroPadding(b.toString(16));
    return `#${hexR}${hexG}${hexB}`;
}
export function getWmtsMatrices(source) {
    const projection = source.getProjection();
    const tileGrid = source.getTileGrid();
    console.assert(tileGrid instanceof WMTSTileGrid);
    const matrixIds = tileGrid.getMatrixIds();
    const wmtsMatrices = [];
    const metersPerUnit = projection.getMetersPerUnit();
    console.assert(!!metersPerUnit);
    for (let i = 0; i < matrixIds.length; i++) {
        const tileRange = tileGrid.getFullTileRange(i);
        const resolutionMeters = tileGrid.getResolution(i) * metersPerUnit;
        wmtsMatrices.push({
            identifier: matrixIds[i],
            scaleDenominator: resolutionMeters / WMTS_PIXEL_SIZE_,
            tileSize: toSize(tileGrid.getTileSize(i)),
            topLeftCorner: tileGrid.getOrigin(i),
            matrixSize: [
                tileRange.maxX - tileRange.minX,
                tileRange.maxY - tileRange.minY
            ]
        });
    }
    return wmtsMatrices;
}
//# sourceMappingURL=mapfishprintUtils.js.map