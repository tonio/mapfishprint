export default class {
    constructor(printExtent) {
        this.printExtent = printExtent;
    }
    layerFilter(layer) {
        return true;
    }
    geometryFilter(geometry) {
        return true;
    }
    feature(layer, feature) { }
    line(layer, symbolizer, stroke) { }
    point(layer, symbolizer, image) { }
    wmtsLayer(layer, wmtsLayer, source) { }
}
//# sourceMappingURL=BaseCustomizer.js.map