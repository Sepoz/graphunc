'use strict';

/**
 * A tiny, safe math-expression parser/compiler.
 *
 * `compileExpression('sin(x) * x', scope)` returns `{ fn, error }`:
 *   - on success, `fn` is a `(x: number) => number` and `error` is null;
 *   - on failure, `fn` is null and `error` is a human-readable string.
 *
 * `scope` is a live object of named parameters, e.g. `{ a: 1, b: 2 }`.
 * The compiled closure reads `scope[name]` at CALL time, so mutating a value
 * (e.g. via a slider) takes effect on the next render without recompiling.
 * Adding / renaming / removing a parameter does require recompiling.
 *
 * It is a recursive-descent parser — NOT `eval()` — so user input can never
 * execute arbitrary JavaScript. Only the whitelisted functions and constants
 * below are reachable.
 *
 * Supported syntax:
 *   - operators: + - * / ^   (^ is right-associative, e.g. 2^3^2 = 512)
 *   - unary minus: -x, 2^-3
 *   - implicit multiplication (conservative): 3x, 2sin(x), 2(x+1),
 *     (x+1)(x-2), 2pi. Rejected as ambiguous: `x x`, `2 3`, `x(x+1)`.
 *     NOTE: `1/2x` parses left-to-right as `(1/2)*x`; write `1/(2x)` to
 *     divide by a product.
 *   - grouping: ( )
 *   - comparisons: < <= > >= == !=   (return 1 or 0, C-style)
 *   - ternary: cond ? a : b          (enables piecewise functions)
 *   - variable: x
 *   - parameters: any name present in `scope`
 *   - constants: pi, e, tau
 *   - functions (1-arg): sin cos tan asin acos atan sinh cosh tanh
 *       sqrt cbrt abs exp ln log log2 floor ceil round sign
 *   - functions (multi-arg): atan2(y,x) mod(a,b) min(a,b) max(a,b)
 *       hypot(x,y) nthroot(x,n) log(base,x)
 */

const FUNCTIONS = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,
  abs: Math.abs,
  exp: Math.exp,
  ln: Math.log,
  log: (a, b) => (b === undefined ? Math.log10(a) : Math.log(b) / Math.log(a)),
  log2: Math.log2,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  sign: Math.sign,
  atan2: Math.atan2,
  mod: (a, b) => a % b,
  min: Math.min,
  max: Math.max,
  hypot: Math.hypot,
  nthroot: (x, n) => Math.pow(x, 1 / n),
};

const CONSTANTS = {
  pi: Math.PI,
  e: Math.E,
  tau: 2 * Math.PI,
};

// Comparison operators → boolean-as-number (1/0) so they compose with arithmetic.
const COMPARATORS = {
  '<': (a, b) => (a < b ? 1 : 0),
  '<=': (a, b) => (a <= b ? 1 : 0),
  '>': (a, b) => (a > b ? 1 : 0),
  '>=': (a, b) => (a >= b ? 1 : 0),
  '==': (a, b) => (a === b ? 1 : 0),
  '!=': (a, b) => (a !== b ? 1 : 0),
};

/** Split the raw string into tokens: numbers, identifiers, operators, parens. */
function tokenize(raw) {
  const input = raw
    .replace(/\u02C6/g, '^')   // modifier letter circumflex -> ^
    .replace(/\u02C7/g, '^')   // caron -> ^
    .replace(/\u02D8/g, '^')   // breve -> ^
    .replace(/\u02DC/g, '^')   // small tilde -> ~
    .replace(/\u00D7/g, '*')   // multiplication sign -> *
    .replace(/\u00F7/g, '/')   // division sign -> /
    .replace(/\u2212/g, '-')   // minus sign -> -
    .replace(/\u2260/g, '!=')  // not equal
    .replace(/\u2264/g, '<=')  // less than or equal
    .replace(/\u2265/g, '>='); // greater than or equal
  const tokens = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    if (ch === ' ' || ch === '\t') {
      i += 1;
      continue;
    }

    if ((ch >= '0' && ch <= '9') || ch === '.') {
      let num = '';
      while (i < input.length && /[0-9.]/.test(input[i])) {
        num += input[i];
        i += 1;
      }
      if (Number.isNaN(Number(num))) {
        throw new Error(`Invalid number "${num}"`);
      }
      tokens.push({ type: 'number', value: Number(num) });
      continue;
    }

    if (/[a-zA-Z_]/.test(ch)) {
      let name = '';
      while (i < input.length && /[a-zA-Z0-9_]/.test(input[i])) {
        name += input[i];
        i += 1;
      }
      tokens.push({ type: 'identifier', value: name });
      continue;
    }

    // Two-character comparison operators (check before single-char ones).
    const two = input.slice(i, i + 2);
    if (two === '<=' || two === '>=' || two === '==' || two === '!=') {
      tokens.push({ type: 'operator', value: two });
      i += 2;
      continue;
    }

    if ('+-*/^()<>,:?'.includes(ch)) {
      tokens.push({ type: 'operator', value: ch });
      i += 1;
      continue;
    }

    throw new Error(`Unexpected character "${ch}"`);
  }

  return tokens;
}

/**
 * Parse tokens into a compiled `(x) => number` closure.
 *
 * Grammar (lowest to highest precedence):
 *   ternary     := comparison ('?' ternary ':' ternary)?
 *   comparison  := expression (('<'|'<='|'>'|'>='|'=='|'!=') expression)*
 *   expression  := term (('+' | '-') term)*
 *   term        := unary (('*' | '/' | implicit) unary)*
 *   unary       := ('+' | '-') unary | power
 *   power       := primary ('^' unary)?        // right-associative
 *   primary     := number | 'x' | param | constant
 *                | func '(' expr (',' expr)* ')' | '(' expression ')'
 *
 * `parseTerm` and below return `{ fn, cat }` where `cat` is the "primary
 * category" of the result ('number' | 'identifier' | 'paren-close') used to
 * decide whether implicit multiplication is allowed. Layers above `parseTerm`
 * deal only in `fn`.
 */
function parse(tokens, scope) {
  let pos = 0;

  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  const isOp = (value) => {
    const token = peek();
    return token && token.type === 'operator' && token.value === value;
  };
  const isOpAny = (values) => {
    const token = peek();
    return token && token.type === 'operator' && values.includes(token.value);
  };

  function parseTernary() {
    const cond = parseComparison();
    if (isOp('?')) {
      next();
      const thenFn = parseTernary();
      if (!isOp(':')) throw new Error('Expected ":" in ternary expression');
      next();
      const elseFn = parseTernary();
      return (x) => (cond(x) ? thenFn(x) : elseFn(x));
    }
    return cond;
  }

  function parseComparison() {
    let left = parseExpression();
    while (isOpAny(['<', '<=', '>', '>=', '==', '!='])) {
      const op = next().value;
      const right = parseExpression();
      const cmp = COMPARATORS[op];
      const a = left;
      left = (x) => cmp(a(x), right(x));
    }
    return left;
  }

  function parseExpression() {
    let left = parseTerm().fn;
    while (isOp('+') || isOp('-')) {
      const op = next().value;
      const right = parseTerm().fn;
      const a = left;
      left = op === '+' ? (x) => a(x) + right(x) : (x) => a(x) - right(x);
    }
    return left;
  }

  function parseTerm() {
    let leftNode = parseUnary();
    let left = leftNode.fn;
    let cat = leftNode.cat;

    for (;;) {
      if (isOp('*') || isOp('/')) {
        const op = next().value;
        const rightNode = parseUnary();
        const a = left;
        left =
          op === '*'
            ? (x) => a(x) * rightNode.fn(x)
            : (x) => a(x) / rightNode.fn(x);
        cat = rightNode.cat;
        continue;
      }
      // Implicit multiplication: the next token must be able to start a
      // primary, and the (prevCat → nextCat) transition must be allowed.
      const nextCat = primaryStartCategory(peek());
      if (nextCat && implicitAllowed(cat, nextCat)) {
        const rightNode = parseUnary();
        const a = left;
        left = (x) => a(x) * rightNode.fn(x);
        cat = rightNode.cat;
        continue;
      }
      break;
    }
    return { fn: left, cat };
  }

  /** What category of primary would start at this token, if any? */
  function primaryStartCategory(token) {
    if (!token) return null;
    if (token.type === 'number') return 'number';
    if (token.type === 'identifier') return 'identifier';
    if (token.type === 'operator' && token.value === '(') return 'paren-open';
    return null;
  }

  // Conservative implicit-multiplication rules:
  //   number       → identifier  ✓  (3x, 2pi, 2sin(x))
  //   number       → paren-open  ✓  (2(x+1))
  //   paren-close  → *            ✓  ((x+1)x, (x+1)2, (x+1)(x-2))
  //   identifier   → *            ✗  (x x, x 2, x(...) all rejected)
  function implicitAllowed(prevCat, nextCat) {
    if (prevCat === 'number') {
      return nextCat === 'identifier' || nextCat === 'paren-open';
    }
    if (prevCat === 'paren-close') return true;
    return false;
  }

  function parseUnary() {
    if (isOp('-')) {
      next();
      const node = parseUnary();
      return { fn: (x) => -node.fn(x), cat: node.cat };
    }
    if (isOp('+')) {
      next();
      return parseUnary();
    }
    return parsePower();
  }

  function parsePower() {
    const base = parsePrimary();
    if (isOp('^')) {
      next();
      const exponent = parseUnary(); // right-associative; allows 2^-3
      const b = base.fn;
      return {
        fn: (x) => Math.pow(b(x), exponent.fn(x)),
        cat: base.cat,
      };
    }
    return base;
  }

  function parsePrimary() {
    const token = next();
    if (!token) {
      throw new Error('Unexpected end of expression');
    }

    if (token.type === 'number') {
      const value = token.value;
      return { fn: () => value, cat: 'number' };
    }

    if (token.type === 'operator' && token.value === '(') {
      const inner = parseTernary();
      if (!isOp(')')) {
        throw new Error('Missing closing parenthesis');
      }
      next();
      return { fn: inner, cat: 'paren-close' };
    }

    if (token.type === 'identifier') {
      const name = token.value;

      // Function call — only when the name is a known function AND it is
      // immediately followed by '('.
      if (name in FUNCTIONS && isOp('(')) {
        next(); // consume '('
        const args = [parseTernary()];
        while (isOp(',')) {
          next();
          args.push(parseTernary());
        }
        if (!isOp(')')) {
          throw new Error(`Missing closing parenthesis after "${name}("`);
        }
        next();
        const fn = FUNCTIONS[name];
        return {
          fn: (x) => fn(...args.map((a) => a(x))),
          cat: 'identifier',
        };
      }

      if (name === 'x') {
        return { fn: (x) => x, cat: 'identifier' };
      }

      // Live parameter read — evaluated at call time so slider changes need
      // no recompile.
      if (name in scope) {
        return { fn: () => scope[name], cat: 'identifier' };
      }

      if (name in CONSTANTS) {
        const value = CONSTANTS[name];
        return { fn: () => value, cat: 'identifier' };
      }

      throw new Error(`Unknown name "${name}"`);
    }

    throw new Error(`Unexpected token "${token.value}"`);
  }

  const fn = parseTernary();
  if (pos < tokens.length) {
    throw new Error(`Unexpected token "${peek().value}"`);
  }
  return fn;
}

/** Public entry point. Never throws — returns `{ fn, error }`. */
function compileExpression(expression, scope = {}) {
  try {
    const tokens = tokenize(expression);
    if (tokens.length === 0) {
      return { fn: null, error: 'Empty expression' };
    }
    const fn = parse(tokens, scope);
    return { fn, error: null };
  } catch (error) {
    return { fn: null, error: error.message };
  }
}
