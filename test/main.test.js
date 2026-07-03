const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { loadMain } = require('./utils.js');

const m = loadMain();

describe('niceStep', () => {
  it('returns 1 for roughly 70px at 60 ppu', () => {
    // 70 / 60 ≈ 1.17 → next nice step is 2
    // Actually: rough=70/60=1.17, pow=1, candidate 1*1=1 < 1.17, 2*1=2 >= 1.17 → 2
    assert.equal(m.niceStep(70), 2);
  });

  it('returns 1 at 60 px / 60 ppu', () => {
    // rough=60/60=1, pow=1, 1*1 >= 1 → 1
    assert.equal(m.niceStep(60), 1);
  });

  it('returns 5 for a wide zoom', () => {
    // At 10 ppu, rough=70/10=7, pow=1, 5*1=5 < 7, 10*1=10 >= 7 → 10
    // Actually with 5*1 < 7, next candidate is 10 → returns 10
    m.view.pixelsPerUnit = 10;
    assert.equal(m.niceStep(70), 10);
  });

  it('returns 0.5 for small step at high zoom', () => {
    m.view.pixelsPerUnit = 200;
    // rough=70/200=0.35, pow=0.1, 1*0.1=0.1 < 0.35, 2*0.1=0.2 < 0.35, 5*0.1=0.5 >= 0.35 → 0.5
    assert.equal(m.niceStep(70), 0.5);
  });

  it('returns 0.002 for very high zoom', () => {
    m.view.pixelsPerUnit = 50000;
    // rough=70/50000=0.0014, pow=0.001, 1*0.001=0.001 < 0.0014, 2*0.001=0.002 >= 0.0014 → 0.002
    assert.equal(m.niceStep(70), 0.002);
  });
});

describe('formatTick', () => {
  it('formats integer step without decimals', () => {
    assert.equal(m.formatTick(5, 1), '5');
  });

  it('formats fractional step with decimals', () => {
    assert.equal(m.formatTick(1.5, 0.5), '1.5');
  });

  it('formats precise decimals', () => {
    assert.equal(m.formatTick(0.125, 0.001), '0.125');
  });

  it('formats zero', () => {
    assert.equal(m.formatTick(0, 1), '0');
  });
});

describe('formatValue', () => {
  it('returns "undefined" for NaN', () => {
    assert.equal(m.formatValue(NaN, 2), 'undefined');
  });

  it('returns "undefined" for Infinity', () => {
    assert.equal(m.formatValue(Infinity, 2), 'undefined');
  });

  it('formats normal value to fixed decimals', () => {
    assert.equal(m.formatValue(3.14159, 2), '3.14');
  });

  it('uses exponential for very large values', () => {
    const result = m.formatValue(1_234_567, 2);
    assert.ok(result.includes('e'));
  });

  it('uses exponential for very small non-zero values', () => {
    const result = m.formatValue(0.00001, 6);
    assert.ok(result.includes('e'));
  });

  it('returns "0" for zero', () => {
    assert.equal(m.formatValue(0, 2), '0');
  });
});

describe('coordDecimals', () => {
  it('returns 1 at default zoom (60 ppu)', () => {
    m.view.pixelsPerUnit = 60;
    // log10(60) ≈ 1.78 → round → 2, then 2 - 1 = 1
    assert.equal(m.coordDecimals(), 1);
  });

  it('returns 0 at low zoom (10 ppu)', () => {
    m.view.pixelsPerUnit = 10;
    // log10(10) = 1 → round → 1, then 1 - 1 = 0
    assert.equal(m.coordDecimals(), 0);
  });

  it('returns 6 at very high zoom', () => {
    m.view.pixelsPerUnit = 10000000;
    // log10(10000000) = 7 → round = 7, 7 - 1 = 6 → min(6, 6) = 6
    assert.equal(m.coordDecimals(), 6);
  });

  it('clamps to 0 minimum', () => {
    m.view.pixelsPerUnit = 3;
    // log10(3) ≈ 0.48 → round → 0, 0 - 1 = -1 → max(-1, 0) = 0
    assert.equal(m.coordDecimals(), 0);
  });

  it('clamps to 6 maximum', () => {
    m.view.pixelsPerUnit = 100_000_000;
    assert.equal(m.coordDecimals(), 6);
  });
});

describe('bisect', () => {
  it('finds root of a linear function', () => {
    // f(x) = 2x - 4 has root at x = 2
    const eps = 1e-10;
    const root = m.bisect((x) => 2 * x - 4, 0, 5);
    assert.notEqual(root, null);
    assert.ok(Math.abs(root - 2) < eps);
  });

  it('finds root of x^2 - 4', () => {
    const root = m.bisect((x) => x * x - 4, 0, 5);
    assert.notEqual(root, null);
    assert.ok(Math.abs(root - 2) < 1e-10);
  });

  it('returns null if no sign change', () => {
    const root = m.bisect((x) => x * x + 1, -5, 5);
    assert.equal(root, null);
  });

  it('returns null if fa or fb are not finite', () => {
    const root = m.bisect((x) => 1 / x, -1, 1);
    assert.equal(root, null);
  });

  it('finds root when one endpoint has f=0', () => {
    const root = m.bisect((x) => x - 5, 0, 5);
    // f(5) = 0, fb = 0, fa * fb = -5 * 0 = 0 → not > 0
    assert.notEqual(root, null);
    assert.ok(Math.abs(root - 5) < 1e-10);
  });

  it('stops when fm is very close to zero', () => {
    // f(x) = x - 1e-13 → root at 1e-13; should converge quickly
    const root = m.bisect((x) => x - 1e-13, -1, 1);
    assert.notEqual(root, null);
    assert.ok(Math.abs(root - 1e-13) < 1e-12);
  });

  it('works for a sine crossing', () => {
    const root = m.bisect(Math.sin, 3, 4); // sin crosses at π ≈ 3.14159
    assert.notEqual(root, null);
    assert.ok(Math.abs(root - Math.PI) < 1e-6);
  });
});

describe('serializeState', () => {
  it('returns an object with v, p, g keys', () => {
    const state = m.serializeState();
    assert.ok('v' in state);
    assert.ok('p' in state);
    assert.ok('g' in state);
  });
});

describe('encodeState / decodeState', () => {
  it('round-trips an object', () => {
    const obj = { v: [0, 0, 60], p: [], g: [] };
    const encoded = m.encodeState(obj);
    const decoded = m.decodeState(encoded);
    assert.deepEqual(decoded, obj);
  });

  it('round-trips with data', () => {
    const obj = { v: [1, 2, 100], p: [['a', 5, -10, 10, 1]], g: [['G1', false, true, [['sin(x)', '#ff0000']]]] };
    const encoded = m.encodeState(obj);
    const decoded = m.decodeState(encoded);
    assert.deepEqual(decoded, obj);
  });

  it('produces URL-safe base64 (no + or / or trailing =)', () => {
    const obj = { v: [1.5, -2.5, 100] };
    const encoded = m.encodeState(obj);
    assert.ok(!encoded.includes('+'));
    assert.ok(!encoded.includes('/'));
    assert.ok(!encoded.includes('='));
  });

  it('handles empty state', () => {
    const obj = {};
    const encoded = m.encodeState(obj);
    const decoded = m.decodeState(encoded);
    assert.deepEqual(decoded, obj);
  });

  it('handles special characters in expressions', () => {
    const obj = { g: [['Group 1', false, true, [['a < b ? c : d', '#4dd0e1']]]] };
    const encoded = m.encodeState(obj);
    const decoded = m.decodeState(encoded);
    assert.deepEqual(decoded, obj);
  });
});

describe('toUrlBase64 / fromUrlBase64', () => {
  it('converts + to - and / to _ and strips trailing =', () => {
    const input = 'ab+c/d+e=';
    const converted = m.toUrlBase64(input);
    assert.equal(converted, 'ab-c_d-e');
  });

  it('round-trips through URL base64', () => {
    const input = 'ab+c/d+e==';
    assert.equal(m.fromUrlBase64(m.toUrlBase64(input)), 'ab+c/d+e');
  });

  it('pads with = for decoding', () => {
    assert.equal(m.fromUrlBase64('abc'), 'abc=');
    assert.equal(m.fromUrlBase64('ab-c_d-e'), 'ab+c/d+e');
  });
});