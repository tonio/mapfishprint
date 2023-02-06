/**
 * @module app.print.Service
 */
import {getWmtsMatrices} from './mapfishprintUtils';
import olLayerTile from 'ol/layer/Tile';
import olSourceWMTS from 'ol/source/WMTS';
import type {Transform} from 'ol/transform';
import {
  create as createTransform,
  compose as composeTransform,
} from 'ol/transform';
import type {Extent} from 'ol/extent';
import {getCenter as getExtentCenter} from 'ol/extent';
import {transform2D} from 'ol/geom/flat/transform';

import type BaseCustomizer from './BaseCustomizer';
import type Map from 'ol/Map';
import type {
  MapFishPrintLayer,
  MapFishPrintMap,
  MapFishPrintReportResponse,
  MapFishPrintSpec,
  MapFishPrintStatusResponse,
  MapFishPrintWmtsLayer,
} from './mapfishprintTypes';
import type WMTS from 'ol/source/WMTS';
import type {Feature} from 'ol';
import type {StyleFunction} from 'ol/style/Style';
import type VectorContext from 'ol/render/VectorContext';
import type {Geometry} from 'ol/geom';
import type {State} from 'ol/layer/Layer';

const getAbsoluteUrl_ = (url: string): string => {
  const a = document.createElement('a');
  a.href = encodeURI(url);
  return decodeURI(a.href);
};

const scratchOpacityCanvas = document.createElement('canvas');

export function asOpacity(
  canvas: HTMLCanvasElement,
  opacity: number
): HTMLCanvasElement {
  const ctx = scratchOpacityCanvas.getContext('2d')!;
  scratchOpacityCanvas.width = canvas.width;
  scratchOpacityCanvas.height = canvas.height;
  ctx.globalAlpha = opacity;
  ctx.drawImage(canvas, 0, 0);
  return scratchOpacityCanvas;
}

/**
 * Return the WMTS URL to use in the print spec.
 */
const getWmtsUrl_ = (source: WMTS): string => {
  const urls = source.getUrls()!;
  console.assert(urls.length > 0);
  return getAbsoluteUrl_(urls[0]);
};

export default abstract class MapfishPrintBaseEncoder {
  readonly url: string;

  /**
   * Provides a function to create app.print.Service objects used to
   * interact with MapFish Print v3 services.
   *
   */
  constructor(printUrl: string) {
    this.url = printUrl;
  }

  async createSpec(
    map: Map,
    scale: number,
    printResolution: number,
    dpi: number,
    layout: string,
    format: string,
    customAttributes: Record<string, any>,
    customizer: BaseCustomizer
  ): Promise<MapFishPrintSpec> {
    const mapSpec = await this.encodeMap(
      map,
      scale,
      printResolution,
      dpi,
      customizer
    );
    const attributes = {
      map: mapSpec,
    };
    Object.assign(attributes, customAttributes);

    return {
      attributes,
      format,
      layout,
    };
  }

  async getStatus(ref: string): Promise<MapFishPrintStatusResponse> {
    return await (await fetch(`${this.url}/status/${ref}.json`)).json();
  }

  async requestReport(
    spec: MapFishPrintSpec
  ): Promise<MapFishPrintReportResponse> {
    const report = await fetch(`${this.url}/report.${spec.format}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(spec),
    });
    return await report.json();
  }

  // FIXME: add timeout
  // FIXME: handle errors
  getDownloadUrl(
    response: MapFishPrintReportResponse,
    interval = 1000
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const intervalId = setInterval(async () => {
        const status = await this.getStatus(response.ref);
        if (status.done) {
          clearInterval(intervalId);
          resolve(`${this.url}/report/${response.ref}`);
        }
      }, interval);
    });
  }

  async mapToLayers(
    map: Map,
    printResolution: number,
    customizer: BaseCustomizer
  ): Promise<MapFishPrintLayer[]> {
    const mapLayerGroup = map.getLayerGroup();
    console.assert(!!mapLayerGroup);

    const layerStates = mapLayerGroup
      .getLayerStatesArray()
      .filter(customizer.layerFilter)
      .sort((state, nextState) => (state.zIndex || 0) - (nextState.zIndex || 0))
      .reverse();

    const layers: MapFishPrintLayer[] = [];
    for (const layerState of layerStates) {
      console.assert(printResolution !== undefined);
      const spec = await this.encodeLayer(
        layerState,
        printResolution,
        customizer
      );
      if (spec) {
        if (Array.isArray(spec)) {
          layers.push(...spec);
        } else {
          layers.push(spec);
        }
      }
    }
    return layers;
  }

  abstract encodeMap(
    map: Map,
    scale: number,
    printResolution: number,
    dpi: number,
    customizer: BaseCustomizer
  ): Promise<MapFishPrintMap>;
  abstract encodeLayer(
    layerState: State,
    printResolution: number,
    customizer: BaseCustomizer
  ): Promise<MapFishPrintLayer[] | MapFishPrintLayer | null>;

  encodeTileLayer(layerState: State, customizer: BaseCustomizer) {
    const layer = layerState.layer;
    console.assert(layer instanceof olLayerTile);
    const source = layer.getSource();
    if (source instanceof olSourceWMTS) {
      return this.encodeTileWmtsLayer(layerState, customizer);
    } else {
      return null;
    }
  }

  encodeTileWmtsLayer(
    layerState: State,
    customizer: BaseCustomizer
  ): MapFishPrintWmtsLayer {
    const layer = layerState.layer;
    console.assert(layer instanceof olLayerTile);
    const source = layer.getSource()! as WMTS;
    console.assert(source instanceof olSourceWMTS);

    const dimensionParams = source.getDimensions();
    const dimensions = Object.keys(dimensionParams);

    // FIXME: remove "as const"
    const wmtsLayer = {
      type: 'wmts' as const,
      baseURL: getWmtsUrl_(source),
      dimensions,
      dimensionParams,
      imageFormat: source.getFormat(),
      name: layer.get('name'),
      layer: source.getLayer(),
      matrices: getWmtsMatrices(source),
      matrixSet: source.getMatrixSet(),
      opacity: layerState.opacity,
      requestEncoding: source.getRequestEncoding(),
      style: source.getStyle(),
      version: source.getVersion(),
    };
    customizer.wmtsLayer(layerState, wmtsLayer, source);
    return wmtsLayer;
  }

  drawFeaturesToContext(
    features: Feature[],
    styleFunction: StyleFunction | undefined,
    resolution: number,
    coordinateToPixelTransform: Transform,
    vectorContext: VectorContext,
    additionalDraw: (geometry: Geometry) => void
  ): void {
    if (!styleFunction) {
      return;
    }
    features.forEach((f) => {
      const optGeometry = f.getGeometry();
      if (!optGeometry) {
        return;
      }
      const geometry = optGeometry.clone();
      geometry.applyTransform((flatCoordinates, dest, stride) => {
        return transform2D(
          flatCoordinates,
          0,
          flatCoordinates.length,
          stride || 2,
          coordinateToPixelTransform,
          dest
        );
      });
      const styles = styleFunction(f, resolution);
      if (styles) {
        if (Array.isArray(styles)) {
          styles.forEach((style) => {
            vectorContext.setStyle(style);
            vectorContext.drawGeometry(geometry);
          });
        } else {
          vectorContext.setStyle(styles);
          vectorContext.drawGeometry(geometry);
        }
        additionalDraw(geometry);
      }
    });
  }

  createCoordinateToPixelTransform(
    printExtent: Extent,
    resolution: number,
    size: number[]
  ): Transform {
    const coordinateToPixelTransform = createTransform();
    const center = getExtentCenter(printExtent);
    // See VectorImageLayer
    // this.coordinateToVectorPixelTransform_ = compose(this.coordinateToVectorPixelTransform_,
    composeTransform(
      coordinateToPixelTransform,
      size[0] / 2,
      size[1] / 2,
      1 / resolution,
      -1 / resolution,
      0,
      -center[0],
      -center[1]
    );
    return coordinateToPixelTransform;
  }

  abstract encodeAsImageLayer(
    layerState: State,
    resolution: number,
    customizer: BaseCustomizer
  ): void;
}
