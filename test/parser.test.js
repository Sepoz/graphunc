const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { loadParser } = require('./utils.js');

describe('compileExpression', () => {
  // -- Basic arithmetic -------------------------------------------------------
  it('compiles and evaluates a simple number', () => {
    const { fn, error } = loadParser()('42');
    assert.equal(error, null);
    assert.equal(fn(0), 42);
  });

  it('compiles and evaluates addition', () => {
    const { fn } = loadParser()('1 + 2');
    assert.equal(fn(0), 3);
  });

  it('compiles and evaluates subtraction', () => {
    const { fn } = loadParser()('5 - 3');
    assert.equal(fn(0), 2);
  });

  it('compiles and evaluates multiplication', () => {
    const { fn } = loadParser()('3 * 4');
    assert.equal(fn(0), 12);
  });

  it('compiles and evaluates division', () => {
    const { fn } = loadParser()('10 / 2');
    assert.equal(fn(0), 5);
  });

  it('compiles and evaluates power', () => {
    const { fn } = loadParser()('2 ^ 3');
    assert.equal(fn(0), 8);
  });

  it('handles operator precedence: * before +', () => {
    const { fn } = loadParser()('2 + 3 * 4');
    assert.equal(fn(0), 14);
  });

  it('handles operator precedence: ^ before *', () => {
    const { fn } = loadParser()('2 * 3 ^ 2');
    assert.equal(fn(0), 18);
  });

  it('uses parentheses to override precedence', () => {
    const { fn } = loadParser()('(2 + 3) * 4');
    assert.equal(fn(0), 20);
  });

  it('evaluates right-associative power (2^3^2 = 512)', () => {
    const { fn } = loadParser()('2 ^ 3 ^ 2');
    assert.equal(fn(0), 512);
  });

  it('handles unary minus on a number', () => {
    const { fn } = loadParser()('-5');
    assert.equal(fn(0), -5);
  });

  it('handles unary minus in an expression', () => {
    const { fn } = loadParser()('3 + -2');
    assert.equal(fn(0), 1);
  });

  it('handles unary minus with power (2^-3)', () => {
    const { fn } = loadParser()('2 ^ -3');
    assert.equal(fn(0), 0.125);
  });

  it('handles unary plus', () => {
    const { fn } = loadParser()('+5');
    assert.equal(fn(0), 5);
  });

  // -- Variable x ------------------------------------------------------------
  it('uses the x variable', () => {
    const { fn } = loadParser()('x + 1');
    assert.equal(fn(3), 4);
  });

  it('evaluates x^2', () => {
    const { fn } = loadParser()('x ^ 2');
    assert.equal(fn(5), 25);
  });

  // -- Constants -------------------------------------------------------------
  it('recognises pi', () => {
    const { fn } = loadParser()('pi');
    assert.equal(fn(0), Math.PI);
  });

  it('recognises e', () => {
    const { fn } = loadParser()('e');
    assert.equal(fn(0), Math.E);
  });

  it('recognises tau', () => {
    const { fn } = loadParser()('tau');
    assert.equal(fn(0), 2 * Math.PI);
  });

  // -- Parameters (live scope) -----------------------------------------------
  it('reads parameter from scope', () => {
    const scope = { a: 5 };
    const { fn } = loadParser()('a + 1', scope);
    assert.equal(fn(0), 6);
  });

  it('reads live parameter values at call time', () => {
    const scope = { a: 2 };
    const { fn } = loadParser()('a * x', scope);
    assert.equal(fn(3), 6);
    scope.a = 10;
    assert.equal(fn(3), 30);
  });

  // -- Functions (1-arg) -----------------------------------------------------
  it('evaluates sin(x)', () => {
    const { fn } = loadParser()('sin(x)');
    assert.equal(fn(0), 0);
    assert.equal(fn(Math.PI / 2), 1);
  });

  it('evaluates cos(x)', () => {
    const { fn } = loadParser()('cos(0)');
    assert.equal(fn(0), 1);
  });

  it('evaluates sqrt(x)', () => {
    const { fn } = loadParser()('sqrt(9)');
    assert.equal(fn(0), 3);
  });

  it('evaluates abs(x)', () => {
    const { fn } = loadParser()('abs(-5)');
    assert.equal(fn(0), 5);
  });

  it('evaluates ln(x)', () => {
    const { fn } = loadParser()('ln(e)');
    assert.equal(fn(0), 1);
  });

  it('evaluates log(x) (log10)', () => {
    const { fn } = loadParser()('log(100)');
    assert.equal(fn(0), 2);
  });

  it('evaluates log2(x)', () => {
    const { fn } = loadParser()('log2(8)');
    assert.equal(fn(0), 3);
  });

  it('evaluates floor(x)', () => {
    const { fn } = loadParser()('floor(3.7)');
    assert.equal(fn(0), 3);
    assert.equal(fn(0), 3);
  });

  it('evaluates ceil(x)', () => {
    const { fn } = loadParser()('ceil(3.2)');
    assert.equal(fn(0), 4);
  });

  it('evaluates round(x)', () => {
    const { fn } = loadParser()('round(3.5)');
    assert.equal(fn(0), 4);
  });

  it('evaluates sign(x)', () => {
    const { fn } = loadParser()('sign(-5)');
    assert.equal(fn(0), -1);
  });

  // -- Functions (multi-arg) -------------------------------------------------
  it('evaluates atan2(y,x)', () => {
    const { fn } = loadParser()('atan2(1, 0)');
    assert.equal(fn(0), Math.atan2(1, 0));
  });

  it('evaluates mod(a,b)', () => {
    const { fn } = loadParser()('mod(10, 3)');
    assert.equal(fn(0), 1);
  });

  it('evaluates min(a,b)', () => {
    const { fn } = loadParser()('min(3, 7)');
    assert.equal(fn(0), 3);
  });

  it('evaluates max(a,b)', () => {
    const { fn } = loadParser()('max(3, 7)');
    assert.equal(fn(0), 7);
  });

  it('evaluates hypot(x,y)', () => {
    const { fn } = loadParser()('hypot(3, 4)');
    assert.equal(fn(0), 5);
  });

  it('evaluates nthroot(x,n)', () => {
    const { fn } = loadParser()('nthroot(8, 3)');
    assert.equal(fn(0), 2);
  });

  it('evaluates log(base, x)', () => {
    const { fn } = loadParser()('log(2, 8)');
    assert.equal(fn(0), 3);
  });

  // -- Comparisons -----------------------------------------------------------
  it('returns 1 for true comparison', () => {
    const { fn } = loadParser()('3 < 5');
    assert.equal(fn(0), 1);
  });

  it('returns 0 for false comparison', () => {
    const { fn } = loadParser()('5 < 3');
    assert.equal(fn(0), 0);
  });

  it('handles <=', () => {
    const { fn } = loadParser()('3 <= 3');
    assert.equal(fn(0), 1);
  });

  it('handles >=', () => {
    const { fn } = loadParser()('5 >= 3');
    assert.equal(fn(0), 1);
  });

  it('handles ==', () => {
    const { fn } = loadParser()('3 == 3');
    assert.equal(fn(0), 1);
  });

  it('handles !=', () => {
    const { fn } = loadParser()('3 != 4');
    assert.equal(fn(0), 1);
  });

  it('composes comparisons with arithmetic', () => {
    const { fn } = loadParser()('(x < 0) * 10');
    assert.equal(fn(-1), 10);
    assert.equal(fn(1), 0);
  });

  // -- Ternary ---------------------------------------------------------------
  it('evaluates ternary condition', () => {
    const { fn } = loadParser()('x < 0 ? -x : x');
    assert.equal(fn(-5), 5);
    assert.equal(fn(3), 3);
  });

  it('nests ternary expressions', () => {
    const { fn } = loadParser()('x > 0 ? 1 : x < 0 ? -1 : 0');
    assert.equal(fn(5), 1);
    assert.equal(fn(-5), -1);
    assert.equal(fn(0), 0);
  });

  // -- Implicit multiplication -----------------------------------------------
  it('multiplies number and identifier implicitly (3x)', () => {
    const { fn } = loadParser()('3x');
    assert.equal(fn(5), 15);
  });

  it('multiplies number and paren implicitly (2(x+1))', () => {
    const { fn } = loadParser()('2(x+1)');
    assert.equal(fn(3), 8);
  });

  it('multiplies paren and number implicitly ((x+1)2)', () => {
    const { fn } = loadParser()('(x+1)2');
    assert.equal(fn(3), 8);
  });

  it('multiplies paren and identifier implicitly ((x+1)x)', () => {
    const { fn } = loadParser()('(x+1)x');
    assert.equal(fn(3), 12);
  });

  it('multiplies number and constant implicitly (2pi)', () => {
    const { fn } = loadParser()('2pi');
    assert.equal(fn(0), 2 * Math.PI);
  });

  it('multiplies number and function implicitly (2sin(x))', () => {
    const { fn } = loadParser()('2sin(0)');
    assert.equal(fn(0), 0);
  });

  // -- Errors ----------------------------------------------------------------
  it('returns error for empty expression', () => {
    const { fn, error } = loadParser()('');
    assert.equal(fn, null);
    assert.ok(error.includes('Empty'));
  });

  it('returns error for unknown name', () => {
    const { fn, error } = loadParser()('unknownVar');
    assert.equal(fn, null);
    assert.ok(error.includes('Unknown'));
  });

  it('returns error for unexpected character', () => {
    const { fn, error } = loadParser()('3 @ 4');
    assert.equal(fn, null);
    assert.ok(error.includes('Unexpected character'));
  });

  it('returns error for mismatched parentheses', () => {
    const { fn, error } = loadParser()('(3 + 2');
    assert.equal(fn, null);
    assert.ok(error);
  });

  it('returns error for missing closing paren in function', () => {
    const { fn, error } = loadParser()('sin(3');
    assert.equal(fn, null);
    assert.ok(error);
  });

  it('returns error for trailing tokens', () => {
    const { fn, error } = loadParser()('3 + 4 5');
    assert.equal(fn, null);
    assert.ok(error);
  });

  // -- Edge cases ------------------------------------------------------------
  it('handles whitespace', () => {
    const { fn } = loadParser()('  3  +  4  ');
    assert.equal(fn(0), 7);
  });

  it('handles decimal numbers', () => {
    const { fn } = loadParser()('3.5 + 1.5');
    assert.equal(fn(0), 5);
  });

  it('handles negative numbers at the start', () => {
    const { fn } = loadParser()('-3 + 5');
    assert.equal(fn(0), 2);
  });

  it('handles nested parentheses', () => {
    const { fn } = loadParser()('((2 + 3) * (4 + 1))');
    assert.equal(fn(0), 25);
  });

  it('handles division by zero (returns Infinity)', () => {
    const { fn } = loadParser()('1 / 0');
    assert.equal(fn(0), Infinity);
  });

  it('handles sqrt of negative number (returns NaN)', () => {
    const { fn } = loadParser()('sqrt(-1)');
    assert.ok(Number.isNaN(fn(0)));
  });

  it('does not crash on very large expressions', () => {
    const expr = '1 + 2 * 3 - 4 / 5 + sin(6) * cos(7) - tan(8) + sqrt(9)';
    const { fn, error } = loadParser()(expr);
    assert.equal(error, null);
    assert.equal(typeof fn(0), 'number');
  });

  // -- Complex expressions ---------------------------------------------------
  it('evaluates sin(x)^2 + cos(x)^2 = 1', () => {
    const { fn } = loadParser()('sin(x)^2 + cos(x)^2');
    assert(Math.abs(fn(0) - 1) < 1e-10);
    assert(Math.abs(fn(1) - 1) < 1e-10);
    assert(Math.abs(fn(2) - 1) < 1e-10);
  });

  it('evaluates nested function calls', () => {
    const { fn } = loadParser()('sin(abs(x))');
    // for x = -1: abs(-1) = 1, sin(1) ≈ 0.841
    assert.ok(Math.abs(fn(-Math.PI / 2) - 1) < 1e-10);
  });

it('handles chained comparisons left-to-right: x > 0 == x < 10', () => {
    const { fn } = loadParser()('x > 0 == x < 10');
    // Comparisons have equal precedence and chain left-to-right:
    //   ((x > 0) == x) < 10
    // For x=5: (1 == 5) → 0, 0 < 10 → 1
    assert.equal(fn(5), 1);
    // For x=-1: (0 == -1) → 0, 0 < 10 → 1
    assert.equal(fn(-1), 1);
    // For x=0: (0 == 0) → 1, 1 < 10 → 1
    assert.equal(fn(0), 1);
    // For x=10: (1 == 10) → 0, 0 < 10 → 1
    assert.equal(fn(10), 1);
  });

  it('evaluates expression with multiple parameters', () => {
    const scope = { a: 2, b: 3 };
    const { fn } = loadParser()('a * x + b', scope);
    assert.equal(fn(4), 11);
  });

  it('handles deeply nested parentheses', () => {
    const { fn } = loadParser()('((((x))))');
    assert.equal(fn(7), 7);
  });

  it('handles logarithm change of base', () => {
    const { fn } = loadParser()('log(10, 100)');
    assert.equal(fn(0), 2);
  });

  it('returns error for invalid number token', () => {
    const { fn, error } = loadParser()('3.4.5');
    assert.equal(fn, null);
    assert.ok(error);
  });
});