import type {Geometry} from 'ol/geom';
import type {State} from 'ol/layer/Layer';
import type {WMTS} from 'ol/source';
import type {Image, Stroke} from 'ol/style';
import type {
  MapFishPrintSymbolizerLine,
  MapFishPrintSymbolizerPoint,
  MapFishPrintWmtsLayer,
} from './mapfishprintTypes';

export default class {
  readonly printExtent: number[];

  constructor(printExtent: number[]) {
    this.printExtent = printExtent;
  }

  layerFilter(layerState: State): boolean {
    return true;
  }

  geometryFilter(geometry: Geometry): boolean {
    return true;
  }

  feature(layerState: State, feature: GeoJSON.Feature) {}

  line(
    layerState: State,
    symbolizer: MapFishPrintSymbolizerLine,
    stroke: Stroke,
  ) {}

  point(
    layerState: State,
    symbolizer: MapFishPrintSymbolizerPoint,
    image: Image,
  ) {}

  wmtsLayer(
    layerState: State,
    wmtsLayer: MapFishPrintWmtsLayer,
    source: WMTS,
  ) {}
}
