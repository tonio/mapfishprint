import type {Geometry} from 'ol/geom';
import type BaseLayer from 'ol/layer/Base';
import type TileLayer from 'ol/layer/Tile';
import type VectorLayer from 'ol/layer/Vector';
import type {WMTS} from 'ol/source';
import type VectorSource from 'ol/source/Vector';
import type {Image, Stroke} from 'ol/style';
import type {MapFishPrintSymbolizerLine, MapFishPrintSymbolizerPoint, MapFishPrintWmtsLayer} from './mapfishprintTypes';


export default class {
  readonly printExtent: number[];

  constructor(printExtent: number[]) {
    this.printExtent = printExtent;
  }

  layerFilter(layer: BaseLayer): boolean {
    return true;
  }

  geometryFilter(geometry: Geometry): boolean {
    return true;
  }

  feature(layer: VectorLayer<VectorSource>, feature: GeoJSON.Feature) {}

  line(layer: VectorLayer<VectorSource>, symbolizer: MapFishPrintSymbolizerLine, stroke: Stroke) {}

  point(layer: VectorLayer<VectorSource>, symbolizer: MapFishPrintSymbolizerPoint, image: Image) {}

  wmtsLayer(layer: TileLayer<WMTS>, wmtsLayer: MapFishPrintWmtsLayer, source: WMTS) {}
}
