import { getWmtsMatrices } from './mapfishprintUtils';
import olLayerGroup from 'ol/layer/Group';
import olLayerTile from 'ol/layer/Tile';
import olSourceWMTS from 'ol/source/WMTS';
import { create as createTransform, compose as composeTransform } from 'ol/transform';
import { getCenter as getExtentCenter } from 'ol/extent';
import { transform2D } from 'ol/geom/flat/transform';
const getAbsoluteUrl_ = (url) => {
    const a = document.createElement('a');
    a.href = encodeURI(url);
    return decodeURI(a.href);
};
const scratchOpacityCanvas = document.createElement('canvas');
export function asOpacity(canvas, opacity) {
    const ctx = scratchOpacityCanvas.getContext('2d');
    scratchOpacityCanvas.width = canvas.width;
    scratchOpacityCanvas.height = canvas.height;
    ctx.globalAlpha = opacity;
    ctx.drawImage(canvas, 0, 0);
    return scratchOpacityCanvas;
}
const getWmtsUrl_ = (source) => {
    const urls = source.getUrls();
    console.assert(urls.length > 0);
    return getAbsoluteUrl_(urls[0]);
};
export default class MapfishPrintBaseEncoder {
    constructor(printUrl) {
        this.scratchCanvas_ = document.createElement('canvas');
        this.url_ = printUrl;
    }
    async createSpec(map, scale, printResolution, dpi, layout, format, customAttributes, customizer) {
        const mapSpec = await this.encodeMap(map, scale, printResolution, dpi, customizer);
        const attributes = {
            map: mapSpec
        };
        Object.assign(attributes, customAttributes);
        return {
            attributes,
            format,
            layout
        };
    }
    async mapToLayers(map, printResolution, customizer) {
        const mapLayerGroup = map.getLayerGroup();
        console.assert(!!mapLayerGroup);
        const flatLayers = this.getFlatLayers_(mapLayerGroup)
            .filter(customizer.layerFilter)
            .sort((layer, nextLayer) => nextLayer.getZIndex() - layer.getZIndex());
        const layers = [];
        for (const layer of flatLayers) {
            console.assert(printResolution !== undefined);
            const spec = await this.encodeLayer(layer, printResolution, customizer);
            if (spec) {
                if (Array.isArray(spec)) {
                    layers.push(...spec);
                }
                else {
                    layers.push(spec);
                }
            }
        }
        return layers;
    }
    getFlatLayers_(layer) {
        if (layer instanceof olLayerGroup) {
            let flatLayers = [];
            layer.getLayers().forEach((sublayer) => {
                const flatSublayers = this.getFlatLayers_(sublayer);
                flatLayers = flatLayers.concat(flatSublayers);
            });
            return flatLayers;
        }
        else {
            return [layer];
        }
    }
    encodeTileLayer(layer, customizer) {
        console.assert(layer instanceof olLayerTile);
        const source = layer.getSource();
        if (source instanceof olSourceWMTS) {
            return this.encodeTileWmtsLayer(layer, customizer);
        }
        else {
            return null;
        }
    }
    encodeTileWmtsLayer(layer, customizer) {
        console.assert(layer instanceof olLayerTile);
        const source = layer.getSource();
        console.assert(source instanceof olSourceWMTS);
        const dimensionParams = source.getDimensions();
        const dimensions = Object.keys(dimensionParams);
        const wmtsLayer = {
            type: 'wmts',
            baseURL: getWmtsUrl_(source),
            dimensions,
            dimensionParams,
            imageFormat: source.getFormat(),
            name: layer.get('name'),
            layer: source.getLayer(),
            matrices: getWmtsMatrices(source),
            matrixSet: source.getMatrixSet(),
            opacity: layer.getOpacity(),
            requestEncoding: source.getRequestEncoding(),
            style: source.getStyle(),
            version: source.getVersion()
        };
        customizer.wmtsLayer(layer, wmtsLayer, source);
        return wmtsLayer;
    }
    drawFeaturesToContext(features, styleFunction, resolution, coordinateToPixelTransform, vectorContext, additionalDraw) {
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
                }
                else {
                    vectorContext.setStyle(styles);
                    vectorContext.drawGeometry(geometry);
                }
                additionalDraw(geometry);
            }
        });
    }
    createCoordinateToPixelTransform(printExtent, resolution, size) {
        const coordinateToPixelTransform = createTransform();
        const center = getExtentCenter(printExtent);
        composeTransform(coordinateToPixelTransform, size[0] / 2, size[1] / 2, 1 / resolution, -1 / resolution, 0, -center[0], -center[1]);
        return coordinateToPixelTransform;
    }
}
//# sourceMappingURL=MapfishPrintBaseEncoder.js.map