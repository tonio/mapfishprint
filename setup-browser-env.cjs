// Define some browser stubs (we run tests in nodeJS)

/* global global */

global.document = {
  getElementById() {
    return this.createElement();
  },
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
      insertBefore() {},
      setAttribute() {
        // pass
      },
      getRootNode() {
        return this;
      },
    };
  },
};

global.window = {};

global.ResizeObserver = class ResizeObserver {
  observe() {}
};

global.ShadowRoot = class ShadowRoot {};

global.getComputedStyle = () => {
  return {
    height: 42,
    width: 42,
  };
};

global.requestAnimationFrame = () => {};
