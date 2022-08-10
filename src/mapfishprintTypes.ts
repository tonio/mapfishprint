import type {GeoJSONObject} from 'ol/format/GeoJSON';


export interface MapFishPrintLayer {
  renderAsSvg?: boolean;
  type: string
  opacity: number
};

export interface MapFishPrintSymbolizer {
  type: string
};

export interface MapFishPrintSymbolizers {
  symbolizers: MapFishPrintSymbolizer[]
}

export type MapFishPrintVectorStyle = MapFishPrintSymbolizers | Record<string, number>;

export interface MapFishPrintVectorLayer {
  type: string
  opacitry: number
  geoJson: GeoJSONObject
  style: MapFishPrintVectorStyle
};

export interface MapFishPrintWmtsMatrix {
  identifier: string
  scaleDenominator: number
  tileSize: number[]
  topLeftCorner: number[]
  matrixSize: number[]
}

export interface MapFishPrintWmtsLayer extends MapFishPrintLayer {
  baseURL: string
  dimensions: Object
  dimensionParams: Object
  imageFormat: string
  layer: string
  matrices: MapFishPrintWmtsMatrix[]
  matrixSet: string
  requestEncoding: string
  style: string
  version: string
}

export interface MapFishPrintMap {
  box?: number[]
  center: number[]
  scale: number
  dpi: number
  layers: MapFishPrintLayer[]
  projection: string
  rotation: number
  useNearestScale?: boolean
}


export interface MapFishPrintAttributes {
  map: MapFishPrintMap
}

export interface MapFishPrintSpec {
  attributes: MapFishPrintAttributes
  layout: string
  format: string
  lang: string
  smtp: [any]
}