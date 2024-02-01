import {getWmtsMatrices, asOpacity, getWmtsUrl} from './mapfishprintUtils';
import olLayerTile from 'ol/layer/Tile.js';
import olSourceWMTS from 'ol/source/WMTS.js';
import OSM from 'ol/source/OSM.js';
import type {Transform} from 'ol/transform.js';
import {
  create as createTransform,
  compose as composeTransform,
} from 'ol/transform.js';
import type {Extent} from 'ol/extent.js';
import {
  getWidth as getExtentWidth,
  getHeight as getExtentHeight,
} from 'ol/extent.js';
import {getCenter as getExtentCenter} from 'ol/extent.js';
import {transform2D} from 'ol/geom/flat/transform.js';

import BaseCustomizer from './BaseCustomizer';
import type Map from 'ol/Map.js';
import type {
  MapFishPrintAttributes,
  MapFishPrintLayer,
  MapFishPrintMap,
  MapFishPrintOSMLayer,
  MapFishPrintReportResponse,
  MapFishPrintSpec,
  MapFishPrintStatusResponse,
  MapFishPrintWmtsLayer,
} from './mapfishprintTypes';
import type WMTS from 'ol/source/WMTS.js';
import type {Feature} from 'ol';
import type {StyleFunction} from 'ol/style/Style.js';
import type VectorContext from 'ol/render/VectorContext.js';
import type {Geometry, MultiPolygon, Polygon} from 'ol/geom.js';
import type {State} from 'ol/layer/Layer.js';
import {toDegrees} from 'ol/math.js';
import VectorTileLayer from 'ol/layer/VectorTile.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorEncoder from './VectorEncoder';
import {toContext} from 'ol/render.js';
import VectorSource from 'ol/source/Vector.js';
import {MVTEncoder} from '@geoblocks/print';

interface CreateSpecOptions {
  map: Map;
  scale: number;
  printResolution: number;
  dpi: number;
  layout: string;
  format: 'pdf' | 'jpg' | 'png';
  customAttributes: Record<string, any>;
  customizer: BaseCustomizer;
}

interface EncodeMapOptions {
  map: Map;
  scale: number;
  printResolution: number;
  dpi: number;
  customizer: BaseCustomizer;
}

export default class MapfishPrintBaseEncoder {
  readonly url: string;
  private scratchCanvas: HTMLCanvasElement = document.createElement('canvas');

  /**
   * Provides a function to create app.print.Service objects used to
   * interact with MapFish Print v3 services.
   *
   */
  constructor(printUrl: string) {
    this.url = printUrl;
  }

  async createSpec(options: CreateSpecOptions): Promise<MapFishPrintSpec> {
    const mapSpec = await this.encodeMap({
      map: options.map,
      scale: options.scale,
      printResolution: options.printResolution,
      dpi: options.dpi,
      customizer: options.customizer,
    });
    const attributes: MapFishPrintAttributes = {
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

  async getStatus(ref: string): Promise<MapFishPrintStatusResponse> {
    return await (await fetch(`${this.url}/status/${ref}.json`)).json();
  }

  async requestReport(
    spec: MapFishPrintSpec,
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
    interval = 1000,
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
    customizer: BaseCustomizer,
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
        customizer,
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

  async encodeMap(options: EncodeMapOptions): Promise<MapFishPrintMap> {
    const view = options.map.getView();
    const center = view.getCenter();
    const projection = view.getProjection().getCode();
    const rotation = toDegrees(view.getRotation());
    const layers = await this.mapToLayers(
      options.map,
      options.printResolution,
      options.customizer,
    );

    const spec = {
      center,
      dpi: options.dpi,
      pdfA: false,
      projection,
      rotation,
      scale: options.scale,
      layers,
    } as MapFishPrintMap;
    return spec;
  }

  async encodeLayer(
    layerState: State,
    printResolution: number,
    customizer: BaseCustomizer,
  ): Promise<MapFishPrintLayer[] | MapFishPrintLayer | null> {
    if (
      !layerState.visible ||
      printResolution < layerState.minResolution ||
      printResolution >= layerState.maxResolution
    ) {
      return null;
    }
    const layer = layerState.layer;

    if (layer instanceof VectorTileLayer) {
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
      const r = await encoder.encodeMVTLayer(printOptions);
      return r
        .filter((rr) => rr.baseURL.length > 6)
        .map(
          (rr) =>
            Object.assign(
              {
                type: 'image',
                name: layer.get('name'),
                opacity: 1,
                imageFormat: 'image/png',
              },
              rr,
            ) as MapFishPrintLayer,
        );
    }
    if (layer instanceof olLayerTile) {
      return this.encodeTileLayer(layerState, customizer);
    } else if (layer instanceof VectorLayer) {
      const encoded = new VectorEncoder(
        layerState,
        customizer,
      ).encodeVectorLayer(printResolution)!;
      const renderAsSvg = layer.get('renderAsSvg');
      if (renderAsSvg !== undefined) {
        encoded.renderAsSvg = renderAsSvg;
      }
      return encoded;
    } else {
      return null;
    }
  }

  encodeTileLayer(layerState: State, customizer: BaseCustomizer) {
    const layer = layerState.layer;
    console.assert(layer instanceof olLayerTile);
    const source = layer.getSource();
    if (source instanceof olSourceWMTS) {
      return this.encodeTileWmtsLayer(layerState, customizer);
    } else if (source instanceof OSM) {
      return this.encodeOSMLayer(layerState, customizer);
    } else {
      return null;
    }
  }

  encodeOSMLayer(
    layerState: State,
    customizer: BaseCustomizer,
  ): MapFishPrintOSMLayer {
    const layer = layerState.layer;
    const source = layer.getSource()! as OSM;
    return {
      type: 'osm',
      baseURL: source.getUrls()[0],
      opacity: layerState.opacity,
      name: layer.get('name'),
    };
  }

  encodeTileWmtsLayer(
    layerState: State,
    customizer: BaseCustomizer,
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

  drawFeaturesToContext(
    features: Feature[],
    styleFunction: StyleFunction | undefined,
    resolution: number,
    coordinateToPixelTransform: Transform,
    vectorContext: VectorContext,
    additionalDraw: (geometry: Geometry) => void,
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
          dest,
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
    size: number[],
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
      -center[1],
    );
    return coordinateToPixelTransform;
  }

  async encodeAsImageLayer(
    layerState: State,
    resolution: number,
    customizer: BaseCustomizer,
  ) {
    const layer = layerState.layer as VectorLayer<VectorSource>;
    const printExtent = customizer.printExtent;
    const width = getExtentWidth(printExtent) / resolution;
    const height = getExtentHeight(printExtent) / resolution;
    const size: [number, number] = [width, height];
    const vectorContext = toContext(this.scratchCanvas.getContext('2d')!, {
      size,
      pixelRatio: 1,
    });
    const coordinateToPixelTransform = this.createCoordinateToPixelTransform(
      printExtent,
      resolution,
      size,
    );
    const features = layer.getSource()!.getFeatures();
    const styleFunction = layer.getStyleFunction();
    const additionalDraw = (geometry: Polygon | MultiPolygon) => {};

    this.drawFeaturesToContext(
      features,
      styleFunction,
      resolution,
      coordinateToPixelTransform,
      vectorContext,
      additionalDraw as any,
    );

    return {
      type: 'image',
      extent: printExtent,
      imageFormat: 'image/png', // this is the target image format in the mapfish-print
      opacity: 1, // FIXME: mapfish-print is not handling the opacity correctly for images with dataurl.
      name: layer.get('name'),
      baseURL: asOpacity(this.scratchCanvas, layer.getOpacity()).toDataURL(
        'PNG',
      ),
    };
  }
}
