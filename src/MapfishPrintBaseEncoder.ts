/**
 * @module app.print.Service
 */
import {getWmtsMatrices} from './mapfishprintUtils';
import olLayerGroup from 'ol/layer/Group.js';
import olLayerTile from 'ol/layer/Tile.js';
import olSourceWMTS from 'ol/source/WMTS.js';
import {create as createTransform, compose as composeTransform, Transform} from 'ol/transform.js';
import {Extent, getCenter as getExtentCenter} from 'ol/extent.js';
import {transform2D} from 'ol/geom/flat/transform.js';

import type BaseCustomizer from './BaseCustomizer';
import type Map from 'ol/Map';
import {MapFishPrintLayer, MapFishPrintMap, MapFishPrintAttributes, MapFishPrintSpec} from './mapfishprintTypes';
import BaseLayer from 'ol/layer/Base';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector';
import Layer from 'ol/layer/Layer';
import WMTS from 'ol/source/WMTS.js';
import TileLayer from 'ol/layer/Tile.js';
import {Feature} from 'ol';
import {StyleFunction} from 'ol/style/Style';
import VectorContext from 'ol/render/VectorContext';


const getAbsoluteUrl_ = (url: string): string => {
  const a = document.createElement('a');
  a.href = encodeURI(url);
  return decodeURI(a.href);
};


const scratchOpacityCanvas = document.createElement('canvas');

export function asOpacity(canvas: HTMLCanvasElement, opacity: number): HTMLCanvasElement {
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
  scratchCanvas_: HTMLCanvasElement;
  url_: string;

  /**
   * Provides a function to create app.print.Service objects used to
   * interact with MapFish Print v3 services.
   *
   */
  constructor(printUrl: string) {
    this.scratchCanvas_ = document.createElement('canvas');
    this.url_ = printUrl;
  }

  async createSpec(map: Map, scale: number, printResolution: number, dpi: number, layout: string, format: string, customAttributes: Object, customizer: BaseCustomizer): Promise<MapFishPrintSpec> {
    const mapSpec = await this.encodeMap(map, scale, printResolution, dpi, customizer);
    const attributes = {
      map: mapSpec
    } as MapFishPrintAttributes;
    Object.assign(attributes, customAttributes);

    const spec = {
      attributes,
      format,
      layout
    } as MapFishPrintSpec;

    return spec;
  }


async mapToLayers(map: Map, printResolution: number, customizer: BaseCustomizer): Promise<MapFishPrintLayer[]> {
  const mapLayerGroup = map.getLayerGroup();
  console.assert(!!mapLayerGroup);
  const flatLayers = this.getFlatLayers_(mapLayerGroup)
    .filter(customizer.layerFilter)
    .sort((layer, nextLayer) => nextLayer.getZIndex() - layer.getZIndex());

  const layers: MapFishPrintLayer[] = [];
  for (const layer of flatLayers) {
    console.assert(printResolution !== undefined);
    let spec = await this.encodeLayer(layer, printResolution, customizer);
    if (spec) {
      if (Array.isArray(spec)) {
        layers.push(...spec);
      } else {
        layers.push(spec)
      }
    }
  }
  return layers;
}

  abstract encodeMap(map: Map, scale: number, printResolution: number, dpi: number, customizer: BaseCustomizer): Promise<MapFishPrintMap>;
  abstract encodeLayer(layer: BaseLayer, printResolution: number, customizer: BaseCustomizer): Promise<MapFishPrintLayer[]| MapFishPrintLayer | null>;

  /**
   * Get an array of all layers in a group. The group can contain multiple levels
   * of others groups.
   */
  getFlatLayers_(layer: BaseLayer): Layer[] {
    if (layer instanceof olLayerGroup) {
      let flatLayers: Layer[] = [];
      layer.getLayers().forEach((sublayer) => {
        const flatSublayers = this.getFlatLayers_(sublayer);
        flatLayers = flatLayers.concat(flatSublayers);
      });
      return flatLayers;
    } else {
      // @ts-ignore
      return [layer];
    }
  }

  encodeTileLayer(layer: TileLayer<WMTS>, customizer: BaseCustomizer) {
    console.assert(layer instanceof olLayerTile);
    const source = layer.getSource();
    if (source instanceof olSourceWMTS) {
      return this.encodeTileWmtsLayer(layer, customizer);
    } else {
      return null;
    }
  }


  encodeTileWmtsLayer(layer: TileLayer<WMTS>, customizer: BaseCustomizer): MapFishPrintLayer {
    console.assert(layer instanceof olLayerTile);
    const source = layer.getSource()!;
    console.assert(source instanceof olSourceWMTS);

    const dimensionParams = source.getDimensions();
    const dimensions = Object.keys(dimensionParams);

    const wmtsLayer = /** @type {MapFishPrintWmtsLayer} */ ({
      baseURL: getWmtsUrl_(source),
      dimensions,
      dimensionParams,
      name: layer.get('name'),
      imageFormat: source.getFormat(),
      layer: source.getLayer(),
      matrices: getWmtsMatrices(source),
      matrixSet: source.getMatrixSet(),
      opacity: layer.getOpacity(),
      requestEncoding: source.getRequestEncoding(),
      style: source.getStyle(),
      type: 'WMTS',
      version: source.getVersion()
    });
    customizer.wmtsLayer(layer, wmtsLayer, source);
    return wmtsLayer;
  }


  drawFeaturesToContext(features: Feature[], styleFunction: StyleFunction | undefined, resolution: number, coordinateToPixelTransform: Transform , vectorContext: VectorContext, additionnalDraw): void {
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
        return transform2D(flatCoordinates, 0, flatCoordinates.length, stride || 2, coordinateToPixelTransform, dest);
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
        additionnalDraw(geometry);
      }
    });
  }


  createCoordinateToPixelTransform(printExtent: Extent, resolution: number, size: number[]): Transform {
    const coordinateToPixelTransform = createTransform();
    const center = getExtentCenter(printExtent);
    // See VectorImageLayer
    // this.coordinateToVectorPixelTransform_ = compose(this.coordinateToVectorPixelTransform_,
    composeTransform(coordinateToPixelTransform,
      size[0] / 2, size[1] / 2,
      1 / resolution, -1 / resolution,
      0,
      -center[0], -center[1]
    );
    return coordinateToPixelTransform;
  }

  abstract encodeAsImageLayer(layer: VectorLayer<VectorSource>, resolution: number, customizer: BaseCustomizer): void;
}
