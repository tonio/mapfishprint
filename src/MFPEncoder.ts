import {getWmtsMatrices, asOpacity, getWmtsUrl} from './utils';
import {drawFeaturesToContext, createCoordinateToPixelTransform} from './mvtUtils';

import TileLayer from 'ol/layer/Tile.js';
import WMTSSource from 'ol/source/WMTS.js';
import OSMSource from 'ol/source/OSM.js';

import {getWidth as getExtentWidth, getHeight as getExtentHeight} from 'ol/extent.js';

import BaseCustomizer from './BaseCustomizer';
import type Map from 'ol/Map.js';
import type {
  MFPAttributes,
  MFPImageLayer,
  MFPLayer,
  MFPMap,
  MFPOSMLayer,
  MFPSpec,
  MFPWmtsLayer,
} from './types';
import type WMTS from 'ol/source/WMTS.js';

import type {Geometry} from 'ol/geom.js';
import type {State} from 'ol/layer/Layer.js';
import {toDegrees} from 'ol/math.js';
import VectorTileLayer from 'ol/layer/VectorTile.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorEncoder from './VectorEncoder';
import {toContext} from 'ol/render.js';
import VectorSource from 'ol/source/Vector.js';
import LayerGroup from 'ol/layer/Group';
import VectorContext from 'ol/render/VectorContext';

export interface CreateSpecOptions {
  map: Map;
  scale: number;
  printResolution: number;
  dpi: number;
  layout: string;
  format: 'pdf' | 'jpg' | 'png';
  customAttributes: Record<string, any>;
  customizer: BaseCustomizer;
}

export interface EncodeMapOptions {
  map: Map;
  scale: number;
  printResolution: number;
  dpi: number;
  customizer: BaseCustomizer;
}

/**
 * Converts OpenLayers map / layers to Mapfish print v3 format.
 */
export default class MFPBaseEncoder {
  readonly url: string;
  private scratchCanvas: HTMLCanvasElement = document.createElement('canvas');

  /**
   *
   * @param printUrl The base URL to a mapfish print server / proxy
   */
  constructor(printUrl: string) {
    this.url = printUrl;
  }

  /**
   * Introspect the map and convert each of its layers to Mapfish print v3 format.
   * @param options
   * @return a top level Mapfish print spec
   */
  async createSpec(options: CreateSpecOptions): Promise<MFPSpec> {
    const mapSpec = await this.encodeMap({
      map: options.map,
      scale: options.scale,
      printResolution: options.printResolution,
      dpi: options.dpi,
      customizer: options.customizer,
    });
    const attributes: MFPAttributes = {
      map: mapSpec,
      datasource: [],
    };
    Object.assign(attributes, options.customAttributes);

    return {
      attributes,
      format: options.format,
      layout: options.layout,
    };
  }

  /**
   *
   * @param options
   * @return the map portion of a Mapfish print spec
   */
  async encodeMap(options: EncodeMapOptions): Promise<MFPMap> {
    const view = options.map.getView();
    const center = view.getCenter();
    const projection = view.getProjection().getCode();
    const rotation = toDegrees(view.getRotation());
    const mapLayerGroup = options.map.getLayerGroup();
    const layers = await this.encodeLayerGroup(mapLayerGroup, options.printResolution, options.customizer);

    const spec = {
      center,
      dpi: options.dpi,
      pdfA: false,
      projection,
      rotation,
      scale: options.scale,
      layers,
    } as MFPMap;
    return spec;
  }

  /**
   *
   * @param layerGroup The top level layer group of a map
   * @param printResolution
   * @param customizer
   * @return a list of Mapfish print layer specs
   */
  async encodeLayerGroup(
    layerGroup: LayerGroup,
    printResolution: number,
    customizer: BaseCustomizer,
  ): Promise<MFPLayer[]> {
    const layerStates = layerGroup
      .getLayerStatesArray()
      .filter(customizer.layerFilter)
      .sort((state, nextState) => (state.zIndex || 0) - (nextState.zIndex || 0))
      .reverse();

    const layers: MFPLayer[] = [];
    for (const layerState of layerStates) {
      console.assert(printResolution !== undefined);
      const spec = await this.encodeLayerState(layerState, printResolution, customizer);
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

  /**
   * Encodes a given OpenLayers layerState to Mapfish print format.
   * @param layerState
   * @param printResolution
   * @param customizer
   * @return a spec fragment
   */
  async encodeLayerState(
    layerState: State,
    printResolution: number,
    customizer: BaseCustomizer,
  ): Promise<MFPLayer[] | MFPLayer | null> {
    if (
      !layerState.visible ||
      printResolution < layerState.minResolution ||
      printResolution >= layerState.maxResolution
    ) {
      return null;
    }
    const layer = layerState.layer;

    if (layer instanceof VectorTileLayer) {
      return await this.encodeMVTLayerState(layerState, printResolution, customizer);
    }

    if (layer instanceof TileLayer) {
      return this.encodeTileLayerState(layerState, customizer);
    } else if (layer instanceof VectorLayer) {
      const encoded = new VectorEncoder(layerState, customizer).encodeVectorLayer(printResolution)!;
      const renderAsSvg = layer.get('renderAsSvg');
      if (renderAsSvg !== undefined) {
        encoded.renderAsSvg = renderAsSvg;
      }
      return encoded;
    }

    return null;
  }

  /**
   *
   * @param layerState An MVT layer state
   * @param printResolution
   * @param customizer
   * @return a spec fragment
   */
  async encodeMVTLayerState(
    layerState: State,
    printResolution: number,
    customizer: BaseCustomizer,
  ): Promise<MFPLayer[] | MFPLayer | null> {
    const layer = layerState.layer as VectorTileLayer;
    const {MVTEncoder} = await import('@geoblocks/print');
    const encoder = new MVTEncoder();
    const printExtent = customizer.printExtent;
    const width = getExtentWidth(printExtent) / printResolution;
    const height = getExtentHeight(printExtent) / printResolution;
    const canvasSize: [number, number] = [width, height];
    const printOptions = {
      layer,
      printExtent: customizer.printExtent,
      tileResolution: printResolution,
      styleResolution: printResolution,
      canvasSize: canvasSize,
    };
    const results = await encoder.encodeMVTLayer(printOptions);
    return results
      .filter((resut) => resut.baseURL.length > 6)
      .map(
        (result) =>
          Object.assign(
            {
              type: 'image',
              name: layer.get('name'),
              opacity: 1,
              imageFormat: 'image/png',
            },
            result,
          ) as MFPLayer,
      );
  }

  /**
   * Encodes a tile layerState (high level method)
   * @param layerState
   * @param customizer
   * @return a spec fragment
   */
  encodeTileLayerState(layerState: State, customizer: BaseCustomizer): MFPOSMLayer | MFPWmtsLayer {
    const layer = layerState.layer;
    console.assert(layer instanceof TileLayer);
    const source = layer.getSource();
    if (source instanceof WMTSSource) {
      return this.encodeTileWmtsLayer(layerState, customizer);
    } else if (source instanceof OSMSource) {
      return this.encodeOSMLayerState(layerState, customizer);
    } else {
      return null;
    }
  }

  /**
   * Encodes an OSM layerState
   * @param layerState
   * @param customizer
   * @return a spec fragment
   */
  encodeOSMLayerState(layerState: State, customizer: BaseCustomizer): MFPOSMLayer {
    const layer = layerState.layer;
    const source = layer.getSource()! as OSMSource;
    return {
      type: 'osm',
      baseURL: source.getUrls()[0],
      opacity: layerState.opacity,
      name: layer.get('name'),
    };
  }

  /**
   * Encodes a WMTS layerState
   * @param layerState
   * @param customizer
   * @return a spec fragment
   */
  encodeTileWmtsLayer(layerState: State, customizer: BaseCustomizer): MFPWmtsLayer {
    const layer = layerState.layer;
    console.assert(layer instanceof TileLayer);
    const source = layer.getSource()! as WMTS;
    console.assert(source instanceof WMTSSource);

    const dimensionParams = source.getDimensions();
    const dimensions = Object.keys(dimensionParams);

    const wmtsLayer: MFPWmtsLayer = {
      type: 'wmts',
      baseURL: getWmtsUrl(source),
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

  /**
   * Encodes Image layerState.
   * @param layerState
   * @param resolution
   * @param customizer
   * @return a spec file
   */
  async encodeAsImageLayer(
    layerState: State,
    resolution: number,
    customizer: BaseCustomizer,
    additionalDraw: (cir: VectorContext, geometry: Geometry) => void,
  ): Promise<MFPImageLayer> {
    const layer = layerState.layer as VectorLayer<VectorSource>;
    const printExtent = customizer.printExtent;
    const width = getExtentWidth(printExtent) / resolution;
    const height = getExtentHeight(printExtent) / resolution;
    const size: [number, number] = [width, height];
    const vectorContext: VectorContext = toContext(this.scratchCanvas.getContext('2d')!, {
      size,
      pixelRatio: 1,
    });
    const coordinateToPixelTransform = createCoordinateToPixelTransform(printExtent, resolution, size);
    const features = layer.getSource()!.getFeatures();
    const styleFunction = layer.getStyleFunction();

    drawFeaturesToContext(
      features,
      styleFunction,
      resolution,
      coordinateToPixelTransform,
      vectorContext,
      additionalDraw,
    );

    const spec: MFPImageLayer = {
      type: 'image',
      extent: printExtent,
      imageFormat: 'image/png', // this is the target image format in the mapfish-print
      opacity: 1, // FIXME: mapfish-print is not handling the opacity correctly for images with dataurl.
      name: layer.get('name'),
      baseURL: asOpacity(this.scratchCanvas, layer.getOpacity()).toDataURL('PNG'),
    };
    return spec;
  }
}
