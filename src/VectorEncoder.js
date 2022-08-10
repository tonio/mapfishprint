import { rgbArrayToHex } from './mapfishprintUtils';
import { GeoJSON as olFormatGeoJSON } from 'ol/format';
import { Circle as olStyleCircle, Icon as olStyleIcon } from 'ol/style';
import olStyleIconAnchorUnits from 'ol/style/IconAnchorUnits';
import olStyleIconOrigin from 'ol/style/IconOrigin';
import { getUid } from 'ol';
import { asArray } from 'ol/color';
import { toDegrees } from 'ol/math';
import VectorSource from 'ol/source/Vector';
export const PrintStyleType = {
    LINE_STRING: 'LineString',
    POINT: 'Point',
    POLYGON: 'Polygon'
};
export const PrintStyleTypes_ = {
    'LineString': PrintStyleType.LINE_STRING,
    'Point': PrintStyleType.POINT,
    'Polygon': PrintStyleType.POLYGON,
    'MultiLineString': PrintStyleType.LINE_STRING,
    'MultiPoint': PrintStyleType.POINT,
    'MultiPolygon': PrintStyleType.POLYGON
};
const FEATURE_STYLE_PROP = '_ngeo_style';
const featureTypePriority_ = (feature) => {
    const geometry = feature.geometry;
    if (geometry && geometry.type === 'Point') {
        return 0;
    }
    else {
        return 1;
    }
};
const styleKey = (styles) => {
    const keys = Array.isArray(styles) ? styles.join(',') : styles;
    return `[${FEATURE_STYLE_PROP} = '${keys}']`;
};
export default class VectorEncoder {
    constructor(layer, customizer) {
        this.geojsonFormat = new olFormatGeoJSON();
        this.deepIds_ = new Map();
        this.lastDeepId_ = 0;
        this.layer_ = layer;
        this.customizer_ = customizer;
    }
    encodeVectorLayer(resolution) {
        const source = this.layer_.getSource();
        if (!source) {
            return null;
        }
        console.assert(source instanceof VectorSource);
        const features = source.getFeaturesInExtent(this.customizer_.printExtent);
        const geojsonFeatures = [];
        const mapfishStyleObject = {
            version: 2
        };
        features.forEach((feature) => {
            let styleData = null;
            let styleFunction = feature.getStyleFunction();
            if (styleFunction !== undefined) {
                styleData = styleFunction.call(feature, feature, resolution, true);
            }
            else {
                styleFunction = this.layer_.getStyleFunction();
                if (styleFunction !== undefined) {
                    styleData = styleFunction.call(this.layer_, feature, resolution);
                }
            }
            const origGeojsonFeature = this.geojsonFormat.writeFeatureObject(feature);
            let styles = (styleData !== null && !Array.isArray(styleData)) ? [styleData] : styleData;
            if (!styles) {
                return;
            }
            styles = styles.filter(style => !!style);
            if (styles.length === 0) {
                return;
            }
            console.assert(Array.isArray(styles));
            let isOriginalFeatureAdded = false;
            for (let j = 0, jj = styles.length; j < jj; ++j) {
                const style = styles[j];
                let geometry = style.getGeometry();
                let geojsonFeature;
                if (geometry) {
                    const styledFeature = feature.clone();
                    styledFeature.setGeometry(geometry);
                    geojsonFeature = this.geojsonFormat.writeFeatureObject(styledFeature);
                    geojsonFeatures.push(geojsonFeature);
                }
                else {
                    geojsonFeature = origGeojsonFeature;
                    geometry = feature.getGeometry();
                    if (!geometry) {
                        continue;
                    }
                    if (!this.customizer_.geometryFilter(geometry)) {
                        continue;
                    }
                    if (!isOriginalFeatureAdded) {
                        geojsonFeatures.push(geojsonFeature);
                        isOriginalFeatureAdded = true;
                    }
                }
                const geometryType = geometry.getType();
                this.addVectorStyle(mapfishStyleObject, geojsonFeature, geometryType, style);
            }
        });
        if (geojsonFeatures.length > 0) {
            geojsonFeatures.sort((feature0, feature1) => {
                const priority = featureTypePriority_;
                return priority(feature1) - priority(feature0);
            });
            const geojsonFeatureCollection = {
                type: 'FeatureCollection',
                features: geojsonFeatures
            };
            return {
                geoJson: geojsonFeatureCollection,
                opacity: this.layer_.getOpacity(),
                style: mapfishStyleObject,
                type: 'geojson',
                name: this.layer_.get('name')
            };
        }
        else {
            return null;
        }
    }
    getDeepStyleUid(style) {
        const todo = [style];
        let key = '';
        while (todo.length) {
            const obj = todo.pop();
            key += '_k' + getUid(obj);
            for (const k in obj) {
                if (obj.hasOwnProperty(k)) {
                    const value = obj[k];
                    if (value !== null && value !== undefined) {
                        if (['number', 'string', 'boolean'].includes(typeof value)) {
                            key += `_${k}:${value}`;
                        }
                        else {
                            todo.push(value);
                        }
                    }
                }
            }
        }
        let uid = this.deepIds_[key];
        if (!uid) {
            uid = this.deepIds_[key] = ++this.lastDeepId_;
        }
        return uid.toString();
    }
    addVectorStyle(mapfishStyleObject, geojsonFeature, geometryType, style) {
        const styleId = this.getDeepStyleUid(style);
        const key = styleKey(styleId);
        let hasSymbolizer;
        if (key in mapfishStyleObject) {
            hasSymbolizer = true;
        }
        else {
            const styleObject = this.encodeVectorStyle(geometryType, style);
            hasSymbolizer = (styleObject && styleObject.symbolizers.length !== 0);
            if (hasSymbolizer) {
                mapfishStyleObject[key] = styleObject;
            }
        }
        if (hasSymbolizer) {
            if (!geojsonFeature.properties) {
                geojsonFeature.properties = {};
            }
            this.customizer_.feature(this.layer_, geojsonFeature);
            const existingStylesIds = geojsonFeature.properties[FEATURE_STYLE_PROP];
            if (existingStylesIds) {
                const styleIds = [...existingStylesIds.split(','), styleId];
                mapfishStyleObject[styleKey(styleIds)] = {
                    symbolizers: [
                        ...mapfishStyleObject[styleKey(existingStylesIds)].symbolizers,
                        ...mapfishStyleObject[key].symbolizers,
                    ]
                };
                geojsonFeature.properties[FEATURE_STYLE_PROP] = styleIds.join(',');
            }
            else {
                geojsonFeature.properties[FEATURE_STYLE_PROP] = styleId;
            }
        }
    }
    encodeVectorStyle(geometryType, style) {
        if (!(geometryType in PrintStyleTypes_)) {
            return null;
        }
        const styleType = PrintStyleTypes_[geometryType];
        const styleObject = {
            symbolizers: []
        };
        const fillStyle = style.getFill();
        const imageStyle = style.getImage();
        const strokeStyle = style.getStroke();
        const textStyle = style.getText();
        if (styleType === PrintStyleType.POLYGON) {
            if (fillStyle !== null) {
                this.encodeVectorStylePolygon(styleObject.symbolizers, fillStyle, strokeStyle);
            }
        }
        else if (styleType === PrintStyleType.LINE_STRING) {
            if (strokeStyle !== null) {
                this.encodeVectorStyleLine(styleObject.symbolizers, strokeStyle);
            }
        }
        else if (styleType === PrintStyleType.POINT) {
            if (imageStyle !== null) {
                this.encodeVectorStylePoint(styleObject.symbolizers, imageStyle);
            }
            if (textStyle !== null) {
                this.encodeVectorStyleText(styleObject.symbolizers, textStyle);
            }
        }
        return styleObject;
    }
    encodeVectorStyleFill(symbolizer, fillStyle) {
        let fillColor = fillStyle.getColor();
        if (fillColor !== null) {
            console.assert(typeof fillColor === 'string' || Array.isArray(fillColor));
            fillColor = asArray(fillColor);
            console.assert(Array.isArray(fillColor), 'only supporting fill colors');
            symbolizer.fillColor = rgbArrayToHex(fillColor);
            symbolizer.fillOpacity = fillColor[3];
        }
    }
    encodeVectorStyleLine(symbolizers, strokeStyle) {
        const symbolizer = {
            type: 'line'
        };
        this.encodeVectorStyleStroke(symbolizer, strokeStyle);
        this.customizer_.line(this.layer_, symbolizer, strokeStyle);
        symbolizers.push(symbolizer);
    }
    encodeVectorStylePoint(symbolizers, imageStyle) {
        let symbolizer;
        if (imageStyle instanceof olStyleCircle) {
            symbolizer = {
                type: 'point'
            };
            symbolizer.pointRadius = imageStyle.getRadius();
            const scale = imageStyle.getScale();
            if (scale) {
                if (Array.isArray(scale)) {
                    symbolizer.pointRadius *= (scale[0] + scale[1]) / 2;
                }
                else {
                    symbolizer.pointRadius *= scale;
                }
            }
            const fillStyle = imageStyle.getFill();
            if (fillStyle !== null) {
                this.encodeVectorStyleFill(symbolizer, fillStyle);
            }
            const strokeStyle = imageStyle.getStroke();
            if (strokeStyle !== null) {
                this.encodeVectorStyleStroke(symbolizer, strokeStyle);
            }
        }
        else if (imageStyle instanceof olStyleIcon) {
            const src = imageStyle.getSrc();
            if (src !== undefined) {
                symbolizer = {
                    type: 'point',
                    externalGraphic: src
                };
                const opacity = imageStyle.getOpacity();
                if (opacity !== null) {
                    symbolizer.graphicOpacity = opacity;
                }
                const size = imageStyle.getSize();
                if (size !== null) {
                    let scale = imageStyle.getScale();
                    if (Array.isArray(scale)) {
                        scale = (scale[0] + scale[1]) / 2;
                    }
                    if (isNaN(scale)) {
                        scale = 1;
                    }
                    const width = size[0] * scale;
                    const height = size[1] * scale;
                    symbolizer.graphicWidth = height;
                    this.addGraphicOffset_(symbolizer, imageStyle, width, height);
                }
                let rotation = imageStyle.getRotation();
                if (isNaN(rotation)) {
                    rotation = 0;
                }
                symbolizer.rotation = toDegrees(rotation);
            }
        }
        if (symbolizer !== undefined) {
            this.customizer_.point(this.layer_, symbolizer, imageStyle);
            symbolizers.push(symbolizer);
        }
    }
    addGraphicOffset_(symbolizer, icon, width, height) {
        if (!this.hasDefaultAnchor_(icon)) {
            const topLeftOffset = icon.getAnchor();
            const centerXOffset = width / 2 - topLeftOffset[0];
            const centerYOffset = height / 2 - topLeftOffset[1];
            symbolizer.graphicXOffset = centerXOffset;
            symbolizer.graphicYOffset = centerYOffset;
        }
    }
    hasDefaultAnchor_(icon) {
        const hasDefaultCoordinates = (icon.anchor_[0] === 0.5 && icon.anchor_[1] === 0.5);
        const hasDefaultOrigin = (icon.anchorOrigin_ === olStyleIconOrigin.TOP_LEFT);
        const hasDefaultXUnits = (icon.anchorXUnits_ === olStyleIconAnchorUnits.FRACTION);
        const hasDefaultYUnits = (icon.anchorYUnits_ === olStyleIconAnchorUnits.FRACTION);
        return hasDefaultCoordinates && hasDefaultOrigin && hasDefaultXUnits && hasDefaultYUnits;
    }
    encodeVectorStylePolygon(symbolizers, fillStyle, strokeStyle) {
        const symbolizer = {
            type: 'polygon'
        };
        this.encodeVectorStyleFill(symbolizer, fillStyle);
        if (strokeStyle !== null) {
            this.encodeVectorStyleStroke(symbolizer, strokeStyle);
        }
        symbolizers.push(symbolizer);
    }
    encodeVectorStyleStroke(symbolizer, strokeStyle) {
        const strokeColor = strokeStyle.getColor();
        if (strokeColor !== null) {
            console.assert(typeof strokeColor === 'string' || Array.isArray(strokeColor));
            const strokeColorRgba = asArray(strokeColor);
            console.assert(Array.isArray(strokeColorRgba), 'only supporting stroke colors');
            symbolizer.strokeColor = rgbArrayToHex(strokeColorRgba);
            symbolizer.strokeOpacity = strokeColorRgba[3];
        }
        const strokeDashstyle = strokeStyle.getLineDash();
        if (strokeDashstyle !== null) {
            symbolizer.strokeDashstyle = strokeDashstyle.join(' ');
        }
        const strokeWidth = strokeStyle.getWidth();
        if (strokeWidth !== undefined) {
            symbolizer.strokeWidth = strokeWidth;
        }
        const strokeLineCap = strokeStyle.getLineCap();
        if (strokeLineCap) {
            symbolizer.strokeLinecap = strokeLineCap;
        }
        const strokeLineJoin = strokeStyle.getLineJoin();
        if (strokeLineJoin) {
            symbolizer.strokeLinejoin = strokeLineJoin;
        }
    }
    encodeVectorStyleText(symbolizers, textStyle) {
        const label = textStyle.getText();
        if (label) {
            const symbolizer = {
                type: 'text',
                label: textStyle.getText(),
                fontFamily: textStyle.getFont() ? textStyle.getFont() : 'sans-serif',
                labelXOffset: textStyle.getOffsetX(),
                labelYOffset: textStyle.getOffsetY(),
                labelAlign: 'cm',
            };
            const fillStyle = textStyle.getFill();
            if (fillStyle !== null) {
                this.encodeVectorStyleFill(symbolizer, fillStyle);
                symbolizer.fontColor = symbolizer.fillColor;
            }
            const strokeStyle = textStyle.getStroke();
            if (strokeStyle !== null) {
                const strokeColor = strokeStyle.getColor();
                if (strokeColor) {
                    console.assert(typeof strokeColor === 'string' || Array.isArray(strokeColor));
                    const strokeColorRgba = asArray(strokeColor);
                    console.assert(Array.isArray(strokeColorRgba), 'only supporting stroke colors');
                    symbolizer.haloColor = rgbArrayToHex(strokeColorRgba);
                    symbolizer.haloOpacity = strokeColorRgba[3];
                }
                const strokeWidth = strokeStyle.getWidth();
                if (strokeWidth !== undefined) {
                    symbolizer.haloRadius = strokeWidth;
                }
            }
            symbolizers.push(symbolizer);
        }
    }
}
//# sourceMappingURL=VectorEncoder.js.map