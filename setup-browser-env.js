// Define some browser stubs (we run tests in nodeJS)

/* global global */

global.document = {
  createTextNode() {},
  createElement() {
    return {
      style: {},
      classList: {
        add() {},
      },
      addEventListener() {},
      appendChild() {
        // pass
      },
      setAttribute() {
        // pass
      },
    };
  },
};

global.window = {};

global.ResizeObserver = class ResizeObserver {};

global.getComputedStyle = () => {
  return {
    height: 42,
    width: 42,
  };
};
