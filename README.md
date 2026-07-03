# Graphunc

A full-screen, dependency-free math function grapher built with plain HTML, CSS and JavaScript.

<p align="center">
  <img src="favicon.svg" width="120" alt="Graphunc favicon" />
</p>

## Setup

No build step. Open `index.html` directly, or serve the folder over HTTP:

```bash
python3 -m http.server
# then open http://localhost:8000
```

## Features

- Full-screen cartesian grid with adaptive tick spacing (1/2/5 × 10ⁿ)
- Pan (drag) and zoom (scroll, anchored under the cursor)
- Plot multiple functions at once in a flat list
- Live cursor readout: world coordinates plus each function's value, with a marker dot on every curve
- **Trace mode** — click a curve to select it, then walk along it with the
  arrow keys (←/→ step, ↑/↓ jump to local extrema); Esc exits
- **Share** — "Copy link" encodes the full view and functions into the URL
  hash; "PNG" exports the canvas at full Retina resolution
- "Reset" view button
- Safe expression parser — recursive descent, **no `eval`** — so user input never executes arbitrary code
- HiDPI/Retina-crisp rendering, with render coalescing via `requestAnimationFrame`
- State persists to `localStorage` between sessions

## Expression syntax

- Operators: `+ - * / ^` (`^` is right-associative) and unary minus
- Implicit multiplication (conservative): `3x`, `2sin(x)`, `2(x+1)`,
  `(x+1)(x-2)`, `2pi`. Rejected as ambiguous: `x x`, `2 3`, `x(x+1)`.
  Note: `1/2x` parses left-to-right as `(1/2)*x`; write `1/(2x)` otherwise.
- Comparisons: `< <= > >= == !=` (return `1`/`0`)
- Ternary: `cond ? a : b` (enables piecewise functions)
- Variable: `x`
- Constants: `pi`, `e`, `tau`
- Functions (1-arg): `sin cos tan asin acos atan sinh cosh tanh sqrt cbrt abs exp ln log log2 floor ceil round sign`
- Functions (multi-arg): `atan2(y,x) mod(a,b) min(a,b) max(a,b) hypot(x,y) nthroot(x,n) log(base,x)`

Examples: `sin(x) * x`, `x^2`, `1/x`,
`x < 0 ? -x : x`, `log(2, 8)`

## Project structure

```
index.html    # Markup: canvas, readout, panel (functions, toolbar)
styles.css    # Layout and panel styling
parser.js     # Safe expression compiler (compileExpression)
main.js       # Coordinate transforms, rendering, pan/zoom, trace, UI
```
