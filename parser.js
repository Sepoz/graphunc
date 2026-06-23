'use strict';

/**
 * A tiny, safe math-expression parser/compiler.
 *
 * `compileExpression('sin(x) * x')` returns `{ fn, error }`:
 *   - on success, `fn` is a `(x: number) => number` and `error` is null;
 *   - on failure, `fn` is null and `error` is a human-readable string.
 *
 * It is a recursive-descent parser — NOT `eval()` — so user input can never
 * execute arbitrary JavaScript. Only the whitelisted functions and constants
 * below are reachable.
 *
 * Supported syntax:
 *   - operators: + - * / ^   (^ is right-associative, e.g. 2^3^2 = 512)
 *   - unary minus: -x, 2^-3
 *   - grouping: ( )
 *   - variable: x
 *   - constants: pi, e, tau
 *   - functions: sin cos tan asin acos atan sinh cosh tanh
 *                sqrt cbrt abs exp ln log log2 floor ceil round sign
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
  log: (v) => Math.log10(v),
  log2: Math.log2,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  sign: Math.sign,
};

const CONSTANTS = {
  pi: Math.PI,
  e: Math.E,
  tau: 2 * Math.PI,
};

/** Split the raw string into tokens: numbers, identifiers, operators, parens. */
function tokenize(input) {
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

    if (/[a-zA-Z]/.test(ch)) {
      let name = '';
      while (i < input.length && /[a-zA-Z0-9]/.test(input[i])) {
        name += input[i];
        i += 1;
      }
      tokens.push({ type: 'identifier', value: name });
      continue;
    }

    if ('+-*/^()'.includes(ch)) {
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
 * Grammar (lowest to highest precedence):
 *   expression := term (('+' | '-') term)*
 *   term       := unary (('*' | '/') unary)*
 *   unary      := ('+' | '-') unary | power
 *   power      := primary ('^' unary)?        // right-associative
 *   primary    := number | constant | 'x' | func '(' expression ')' | '(' expression ')'
 */
function parse(tokens) {
  let pos = 0;

  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  const isOp = (value) => {
    const token = peek();
    return token && token.type === 'operator' && token.value === value;
  };

  function parseExpression() {
    let left = parseTerm();
    while (isOp('+') || isOp('-')) {
      const op = next().value;
      const right = parseTerm();
      const a = left;
      left = op === '+' ? (x) => a(x) + right(x) : (x) => a(x) - right(x);
    }
    return left;
  }

  function parseTerm() {
    let left = parseUnary();
    while (isOp('*') || isOp('/')) {
      const op = next().value;
      const right = parseUnary();
      const a = left;
      left = op === '*' ? (x) => a(x) * right(x) : (x) => a(x) / right(x);
    }
    return left;
  }

  function parseUnary() {
    if (isOp('-')) {
      next();
      const operand = parseUnary();
      return (x) => -operand(x);
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
      return (x) => Math.pow(base(x), exponent(x));
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
      return () => value;
    }

    if (token.type === 'operator' && token.value === '(') {
      const inner = parseExpression();
      if (!isOp(')')) {
        throw new Error('Missing closing parenthesis');
      }
      next();
      return inner;
    }

    if (token.type === 'identifier') {
      const name = token.value;

      // Function call, e.g. sin(...)
      if (isOp('(')) {
        const fn = FUNCTIONS[name];
        if (!fn) {
          throw new Error(`Unknown function "${name}"`);
        }
        next(); // consume '('
        const arg = parseExpression();
        if (!isOp(')')) {
          throw new Error(`Missing closing parenthesis after "${name}("`);
        }
        next();
        return (x) => fn(arg(x));
      }

      if (name === 'x') {
        return (x) => x;
      }

      if (name in CONSTANTS) {
        const value = CONSTANTS[name];
        return () => value;
      }

      throw new Error(`Unknown name "${name}"`);
    }

    throw new Error(`Unexpected token "${token.value}"`);
  }

  const fn = parseExpression();
  if (pos < tokens.length) {
    throw new Error(`Unexpected token "${peek().value}"`);
  }
  return fn;
}

/** Public entry point. Never throws — returns `{ fn, error }`. */
function compileExpression(expression) {
  try {
    const tokens = tokenize(expression);
    if (tokens.length === 0) {
      return { fn: null, error: 'Empty expression' };
    }
    const fn = parse(tokens);
    return { fn, error: null };
  } catch (error) {
    return { fn: null, error: error.message };
  }
}
