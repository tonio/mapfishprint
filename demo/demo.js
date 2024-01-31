import Map from 'ol/Map.js';
import {MapfishPrintBaseEncoder} from '@geoblocks/mapfishprint';

const map = new Map();

class MyMfpBaseEncoder extends MapfishPrintBaseEncoder {}

const encoder = new MyMfpBaseEncoder('./mfp_server_url');
const result = await encoder.createSpec({
  map,
  scale: 1,
  printResolution: 96,
  dpi: 300,
  layout: 'landscape_a4',
  format: 'pdf',
  customAttributes: {},
  customizer: null,
});

console.log(result);
