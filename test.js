import test from 'ava';

import {MapfishPrintBaseEncoder} from './lib/index.js';
import BaseCustomizer from './lib/BaseCustomizer.js';
import {View, Map} from 'ol';

test('Empty map', async (t) => {
  const encoder = new MapfishPrintBaseEncoder('./mfp_server_url');
  const customizer = new BaseCustomizer([0, 0, 1000, 1000]);
  const map = new Map({
    view: new View({
      center: [18, 45],
    }),
  });
  const result = await encoder.createSpec(
    map,
    1,
    96,
    300,
    'landscape_a4',
    'pdf',
    {},
    customizer,
  );
  t.deepEqual(result, {
    attributes: {
      map: {
        center: [18, 45],
        dpi: 300,
        layers: [],
        pdfA: false,
        projection: 'EPSG:3857',
        rotation: 0,
        scale: 1,
      },
    },
    format: 'pdf',
    layout: 'landscape_a4',
  });
});
