import WMTSTileGrid from 'ol/tilegrid/WMTS.js';
import {toSize} from 'ol/size.js';
import type {MapFishPrintWmtsMatrix} from './mapfishprintTypes';
import type {WMTS} from 'ol/source.js';

// "Standardized rendering pixel size" is defined as 0.28 mm, see http://www.opengeospatial.org/standards/wmts
const WMTS_PIXEL_SIZE_ = 0.28e-3;

/**
 * Takes a hex value and prepends a zero if it's a single digit.
 *
 * @param hex Hex value to prepend if single digit.
 * @returns hex value prepended with zero if it was single digit,
 *     otherwise the same value that was passed in.
 */
export function colorZeroPadding(hex: string): string {
  return hex.length === 1 ? `0${hex}` : hex;
}

/**
 * Converts a color from RGB to hex representation.
 *
 * @param rgb rgb representation of the color.
 * @returns hex representation of the color.
 */
export function rgbArrayToHex(rgb: number[]): string {
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

export function getWmtsMatrices(source: WMTS): MapFishPrintWmtsMatrix[] {
  const projection = source.getProjection()!;
  const tileGrid = source.getTileGrid() as WMTSTileGrid;
  console.assert(tileGrid instanceof WMTSTileGrid);

  const matrixIds = tileGrid.getMatrixIds();
  const wmtsMatrices: MapFishPrintWmtsMatrix[] = [];
  const metersPerUnit = projection.getMetersPerUnit()!;
  console.assert(!!metersPerUnit);

  for (let i = 0; i < matrixIds.length; i++) {
    const tileRange = tileGrid.getFullTileRange(i);
    const resolutionMeters = tileGrid.getResolution(i) * metersPerUnit;
    wmtsMatrices.push({
      identifier: matrixIds[i],
      scaleDenominator: resolutionMeters / WMTS_PIXEL_SIZE_,
      tileSize: toSize(tileGrid.getTileSize(i)),
      topLeftCorner: tileGrid.getOrigin(i),
      matrixSize: [tileRange.maxX - tileRange.minX, tileRange.maxY - tileRange.minY],
    } as MapFishPrintWmtsMatrix);
  }

  return wmtsMatrices;
}

const scratchOpacityCanvas = document.createElement('canvas');
export function asOpacity(canvas: HTMLCanvasElement, opacity: number): HTMLCanvasElement {
  const ctx = scratchOpacityCanvas.getContext('2d')!;
  scratchOpacityCanvas.width = canvas.width;
  scratchOpacityCanvas.height = canvas.height;
  ctx.globalAlpha = opacity;
  ctx.drawImage(canvas, 0, 0);
  return scratchOpacityCanvas;
}

export function getAbsoluteUrl(url: string): string {
  const a = document.createElement('a');
  a.href = encodeURI(url);
  return decodeURI(a.href);
}

/**
 * Return the WMTS URL to use in the print spec.
 */
export function getWmtsUrl(source: WMTS): string {
  const urls = source.getUrls()!;
  console.assert(urls.length > 0);
  return getAbsoluteUrl(urls[0]);
}
