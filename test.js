import test from 'node:test';
import assert from 'node:assert';

import Map from 'ol/Map.js';
import {MFPEncoder, BaseCustomizer} from './lib/index.js';
import TileLayer from 'ol/layer/Tile.js';
import OSM from 'ol/source/OSM.js';
import {View} from 'ol';
import {fromLonLat} from 'ol/proj.js';

test('Empty map', async (t) => {
  const encoder = new MFPEncoder('./mfp_server_url');
  const customizer = new BaseCustomizer([0, 0, 1000, 1000]);
  const map = new Map({
    view: new View({
      center: fromLonLat([7.1560911, 46.3521411]),
      zoom: 12,
    }),
  });
  map.getView();
  const result = await encoder.createSpec({
    map,
    scale: 1,
    printResolution: 96,
    dpi: 300,
    layout: 'landscape_a4',
    format: 'pdf',
    customAttributes: {},
    customizer: customizer,
  });
  assert.deepEqual(result, {
    attributes: {
      map: {
        center: [796612.417322277, 5836960.776101627],
        dpi: 300,
        layers: [],
        projection: 'EPSG:3857',
        rotation: 0,
        scale: 1,
      },
    },
    format: 'pdf',
    layout: 'landscape_a4',
  });
});

test('OSM map', async (t) => {
  const MFP_URL = 'https://geomapfish-demo-2-5.camptocamp.com/printproxy';
  const layout = '1 A4 portrait'; // better take from MFP
  const map = new Map({
    target: 'map',
    layers: [
      new TileLayer({
        source: new OSM(),
      }),
    ],
    view: new View({
      center: fromLonLat([7.1560911, 46.3521411]),
      zoom: 12,
    }),
  });
  class MyMfpBaseEncoder extends MFPEncoder {}

  const encoder = new MyMfpBaseEncoder(MFP_URL);
  const customizer = new BaseCustomizer([0, 0, 10000, 10000]);
  const spec = await encoder.createSpec({
    map,
    scale: 1,
    printResolution: 96,
    dpi: 254,
    layout: layout,
    format: 'pdf',
    customAttributes: {},
    customizer: customizer,
  });

  assert.deepEqual(spec, {
    attributes: {
      map: {
        center: [796612.417322277, 5836960.776101627],
        dpi: 254,
        layers: [
          {
            baseURL: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            name: undefined,
            opacity: 1,
            type: 'osm',
          },
        ],
        projection: 'EPSG:3857',
        rotation: 0,
        scale: 1,
      },
    },
    format: 'pdf',
    layout: layout,
  });
});
