import type {GeoJSONFeature} from 'ol/format/GeoJSON';
import type {Geometry} from 'ol/geom';
import type BaseLayer from 'ol/layer/Base';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import {WMTS} from 'ol/source';
import VectorSource from 'ol/source/Vector';
import {Image, Stroke} from 'ol/style';
import type {MapFishPrintWmtsLayer} from './mapfishprintTypes';


export default class {
  readonly printExtent: number[]

  constructor(printExtent: number[]) {
    this.printExtent = printExtent
  }

  layerFilter(layer: BaseLayer): boolean {
    return true;
  }

  geometryFilter(geometry: Geometry): boolean {
    return true;
  }

  feature(layer, feature: GeoJSONFeature) {}

  line(layer: VectorLayer<VectorSource>, symbolizer: Object, stroke: Stroke) {}

  point(layer: VectorLayer<VectorSource>, symbolizer: Object, image: Image) {}

  wmtsLayer(layer: TileLayer<any>, wmtsLayer: MapFishPrintWmtsLayer, source: WMTS) {}
}
