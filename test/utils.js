const fs = require('fs');
const path = require('path');

function loadParser() {
  const code = fs.readFileSync(path.join(__dirname, '..', 'parser.js'), 'utf8');
  return (0, eval)('"use strict";\n' + code + '\n; compileExpression');
}

const _mainExports = (() => {
  try {
    const parserCode = fs.readFileSync(path.join(__dirname, '..', 'parser.js'), 'utf8');
    const mainCode = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
    const adapted = (parserCode + '\n' + mainCode)
      .replace(/\n(let|const) /g, '\nvar ')
      .replace(/^(let|const) /, 'var ');
    const combined = adapted;

    const stubs = {};
    const noop = () => {};
    const ctxStub = {
      setTransform: noop, fillStyle: null, strokeStyle: null, lineWidth: 1,
      font: '', textAlign: 'left', textBaseline: 'alphabetic',
      beginPath: noop, moveTo: noop, lineTo: noop, stroke: noop,
      fill: noop, arc: noop, fillRect: noop, fillText: noop,
      createLinearGradient: () => ({ addColorStop: noop }),
    };
    stubs.canvas = {
      getContext: () => ctxStub,
      toBlob: (cb) => cb(null),
      style: {},
      classList: { add: noop, remove: noop },
      addEventListener: noop,
    };
    stubs.readoutEl = {
      hidden: true,
      offsetWidth: 100,
      offsetHeight: 30,
      replaceChildren: noop,
      style: {},
      append: noop,
    };
    stubs.document = {
      getElementById(id) {
        if (id === 'graph') return stubs.canvas;
        if (id === 'readout') return stubs.readoutEl;
        if (id === 'functions' || id === 'add-function' || id === 'copy-link' ||
            id === 'export-png' || id === 'reset-view' || id === 'help-overlay' ||
            id === 'help-btn' || id === 'help-close') {
          return { addEventListener: noop, textContent: '', classList: { add: noop, remove: noop, toggle: noop }, setAttribute: noop, style: {}, append: noop, replaceChildren: noop, hidden: false, offsetWidth: 0, offsetHeight: 0, value: '', spellcheck: false, maxLength: 0, placeholder: '', type: '', title: '', focus: noop, select: noop, checked: false };
        }
        return null;
      },
      createElement(tag) {
        if (tag === 'div') return { className: '', replaceChildren: noop, append: noop, style: {}, textContent: '', hidden: false, offsetWidth: 0, offsetHeight: 0 };
        if (tag === 'input') return { value: '', className: '', type: '', checked: false, spellcheck: false, maxLength: 0, placeholder: '', title: '', focus: noop, select: noop, style: {}, addEventListener: noop, classList: { add: noop, remove: noop, toggle: noop } };
        if (tag === 'button') return { className: '', type: '', textContent: '', title: '', style: {}, addEventListener: noop, classList: { add: noop, remove: noop, toggle: noop }, setAttribute: noop };
        if (tag === 'span') return { className: '', textContent: '', style: {}, title: '', addEventListener: noop, classList: { add: noop, remove: noop } };
        if (tag === 'details') return { className: '', open: true, addEventListener: noop, append: noop, classList: { add: noop, remove: noop, toggle: noop } };
        if (tag === 'summary') return { append: noop };
        if (tag === 'label') return { textContent: '', append: noop };
        if (tag === 'p') return { textContent: '', className: '' };
        if (tag === 'textarea') return { value: '', style: {}, select: noop, remove: noop, append: noop };
        return { className: '', append: noop, style: {}, textContent: '', addEventListener: noop };
      },
    };
    stubs.window = {
      devicePixelRatio: 1,
      innerWidth: 800,
      innerHeight: 600,
      addEventListener: () => {},
      requestAnimationFrame: (cb) => cb(),
    };
    stubs.navigator = { clipboard: { writeText: async () => {} } };
    stubs.localStorage = {
      _data: {},
      getItem(k) { return this._data[k] ?? null; },
      setItem(k, v) { this._data[k] = v; },
    };
    stubs.location = { origin: 'http://localhost', pathname: '/', hash: '', replace() {}, href: '' };

    const preamble = [
      `var requestAnimationFrame = window.requestAnimationFrame;`,
      `var setTimeout = window.setTimeout;`,
      `var cancelAnimationFrame = window.cancelAnimationFrame;`,
    ].join('\n');
    const keys = ['document', 'window', 'navigator', 'localStorage', 'location', 'canvas'];
    const vals = keys.map((k) => stubs[k]);
    const fn = new Function(...keys, preamble + '\n' + combined + '\nreturn { compileExpression, niceStep, formatTick, formatValue, coordDecimals, serializeState, encodeState, decodeState, toUrlBase64, fromUrlBase64, plots, view };');
    return fn(...vals);
  } catch (e) {
    // Return a proxy that throws on any property access, so tests get a clear error.
    return new Proxy({}, { get() { throw e; } });
  }
})();

function loadMain() {
  return _mainExports;
}

module.exports = { loadParser, loadMain };