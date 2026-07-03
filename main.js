'use strict';

/**
 * Graphunc — full-screen cartesian grapher with pan, zoom and live plotting.
 *
 * Coordinate model (see parser.js for the expression engine):
 *   - WORLD space: math coordinates, origin centered, y growing UPWARD.
 *   - SCREEN space: pixels, origin top-left, y growing DOWNWARD.
 * `view` holds the world point at screen center plus the current zoom
 * (pixelsPerUnit). Drawing happens in world units; transforms convert.
 */

const canvas = document.getElementById('graph');
const ctx = canvas.getContext('2d');

const COLORS = {
  background: '#e8f4fb',
  gradientTop: '#cfe8f5',
  gradientBottom: '#f0faff',
  grid: '#c4e0f0',
  axis: '#5b9bd5',
  label: '#6b8fb5',
};

// Palette cycled through as the user adds functions.
const PLOT_COLORS = ['#1ba0e2', '#7cb342', '#ff9800', '#e91e63', '#8e24aa'];

const view = {
  centerX: 0,
  centerY: 0,
  pixelsPerUnit: 60,
};

// Plots live in a flat list. Each is independent and always visible.
//   plot: { expr, color, fn, error }  // `fn` is null when `expr` is invalid
const plots = [];

let width = 0;
let height = 0;

// Cursor position in screen pixels; `active` is false when off-canvas.
const cursor = { x: 0, y: 0, active: false };

// --- Coordinate transforms -------------------------------------------------

const toScreenX = (worldX) =>
  width / 2 + (worldX - view.centerX) * view.pixelsPerUnit;
const toScreenY = (worldY) =>
  height / 2 - (worldY - view.centerY) * view.pixelsPerUnit;
const toWorldX = (screenX) =>
  view.centerX + (screenX - width / 2) / view.pixelsPerUnit;
const toWorldY = (screenY) =>
  view.centerY - (screenY - height / 2) / view.pixelsPerUnit;

// --- Tick spacing ----------------------------------------------------------

/**
 * Pick a "nice" world-space step (1, 2 or 5 × 10ⁿ) so that grid lines stay
 * roughly `targetPx` pixels apart regardless of zoom level.
 */
function niceStep(targetPx) {
  const rough = targetPx / view.pixelsPerUnit;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  for (const candidate of [1, 2, 5]) {
    if (candidate * pow >= rough) return candidate * pow;
  }
  return 10 * pow;
}

function formatTick(value, step) {
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));
  return Number(value.toFixed(decimals)).toString();
}

// --- Rendering -------------------------------------------------------------

function drawGrid(step) {
  const leftX = toWorldX(0);
  const rightX = toWorldX(width);
  const bottomY = toWorldY(height);
  const topY = toWorldY(0);

  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();

  for (let x = Math.ceil(leftX / step) * step; x <= rightX; x += step) {
    const screenX = Math.round(toScreenX(x)) + 0.5;
    ctx.moveTo(screenX, 0);
    ctx.lineTo(screenX, height);
  }
  for (let y = Math.ceil(bottomY / step) * step; y <= topY; y += step) {
    const screenY = Math.round(toScreenY(y)) + 0.5;
    ctx.moveTo(0, screenY);
    ctx.lineTo(width, screenY);
  }

  ctx.stroke();
}

function drawAxes() {
  ctx.strokeStyle = COLORS.axis;
  ctx.lineWidth = 2;
  ctx.beginPath();

  const axisY = Math.round(toScreenY(0)) + 0.5;
  ctx.moveTo(0, axisY);
  ctx.lineTo(width, axisY);

  const axisX = Math.round(toScreenX(0)) + 0.5;
  ctx.moveTo(axisX, 0);
  ctx.lineTo(axisX, height);

  ctx.stroke();
}

function drawLabels(step) {
  const leftX = toWorldX(0);
  const rightX = toWorldX(width);
  const bottomY = toWorldY(height);
  const topY = toWorldY(0);

  ctx.fillStyle = COLORS.label;
  ctx.font = '12px system-ui, sans-serif';

  // Clamp the axis position so labels stay on-screen when the origin is
  // scrolled out of view.
  const axisX = Math.min(Math.max(toScreenX(0), 14), width - 4);
  const axisY = Math.min(Math.max(toScreenY(0), 4), height - 16);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let x = Math.ceil(leftX / step) * step; x <= rightX; x += step) {
    if (Math.abs(x) < step / 2) continue; // skip 0
    ctx.fillText(formatTick(x, step), toScreenX(x), axisY + 6);
  }

  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let y = Math.ceil(bottomY / step) * step; y <= topY; y += step) {
    if (Math.abs(y) < step / 2) continue;
    ctx.fillText(formatTick(y, step), axisX - 8, toScreenY(y));
  }
}

function plotFunction(fn, color) {
  const step = 1 / view.pixelsPerUnit; // one world-step per screen pixel
  const leftX = toWorldX(0);
  const rightX = toWorldX(width);

  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.beginPath();

  let penDown = false;
  let prevScreenY = 0;
  for (let x = leftX; x <= rightX; x += step) {
    const y = fn(x);
    const screenX = toScreenX(x);
    const screenY = toScreenY(y);

    // Break the path on undefined values (e.g. sqrt of a negative) and on
    // huge jumps near asymptotes (e.g. tan(x), 1/x) so they aren't joined.
    const isJump = penDown && Math.abs(screenY - prevScreenY) > height * 2;
    if (!Number.isFinite(y) || isJump) {
      penDown = false;
      prevScreenY = screenY;
      continue;
    }

    if (penDown) ctx.lineTo(screenX, screenY);
    else ctx.moveTo(screenX, screenY);
    penDown = true;
    prevScreenY = screenY;
  }

  ctx.stroke();
}

function doRender() {
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, COLORS.gradientTop);
  grad.addColorStop(1, COLORS.gradientBottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  const step = niceStep(70);
  drawGrid(step);
  drawAxes();
  drawLabels(step);

  for (const plot of plots) {
    if (plot.fn) plotFunction(plot.fn, plot.color);
  }

  // Drop a trace whose curve was removed.
  if (trace && (!trace.plot.fn || !plots.includes(trace.plot))) {
    trace = null;
    readoutEl.hidden = true;
  }
  if (trace) drawTrace();
  else if (cursor.active) drawCursorMarkers();
}

// Coalesce rapid render requests (mousemove, slider drag, wheel) into a
// single rAF so the canvas redraws at most once per frame.
let renderScheduled = false;
function render() {
  if (renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(() => {
    renderScheduled = false;
    doRender();
  });
}

/** Dot on each curve at the cursor's x, plus a faint vertical guide line. */
function drawCursorMarkers() {
  const worldX = toWorldX(cursor.x);

  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(Math.round(cursor.x) + 0.5, 0);
  ctx.lineTo(Math.round(cursor.x) + 0.5, height);
  ctx.stroke();

  for (const plot of plots) {
    if (!plot.fn) continue;
    const y = plot.fn(worldX);
    if (!Number.isFinite(y)) continue;

    ctx.beginPath();
    ctx.arc(cursor.x, toScreenY(y), 4, 0, Math.PI * 2);
    ctx.fillStyle = plot.color;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = COLORS.gradientBottom;
    ctx.stroke();
  }
}

// --- Trace mode ------------------------------------------------------------

// Clicking a curve selects it; arrow keys walk along x and jump to extrema.
let trace = null; // { plot, x } when active

function drawTrace() {
  const sx = toScreenX(trace.x);
  const y = trace.plot.fn(trace.x);

  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(Math.round(sx) + 0.5, 0);
  ctx.lineTo(Math.round(sx) + 0.5, height);
  ctx.stroke();

  if (Number.isFinite(y)) {
    const sy = toScreenY(y);
    ctx.beginPath();
    ctx.arc(sx, sy, 5, 0, Math.PI * 2);
    ctx.fillStyle = trace.plot.color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = COLORS.gradientBottom;
    ctx.stroke();

    // Readout pinned near the marker.
    const decimals = coordDecimals();
    readoutEl.replaceChildren();
    const line = document.createElement('div');
    line.style.color = trace.plot.color;
    line.textContent = `x: ${formatValue(trace.x, decimals)}   f(x) = ${formatValue(
      y,
      decimals
    )}`;
    readoutEl.append(line);
    readoutEl.hidden = false;
    const offset = 14;
    const flipX = sx + offset + readoutEl.offsetWidth > width;
    const flipY = sy + offset + readoutEl.offsetHeight > height;
    readoutEl.style.left = `${sx + (flipX ? -offset - readoutEl.offsetWidth : offset)}px`;
    readoutEl.style.top = `${sy + (flipY ? -offset - readoutEl.offsetHeight : offset)}px`;
  }
}

/** Jump to the next local extremum of the traced curve in `dir` (±1). */
function jumpExtremum(dir) {
  const fn = trace.plot.fn;
  const step = 1 / view.pixelsPerUnit;
  const leftX = toWorldX(0);
  const rightX = toWorldX(width);
  const startX = trace.x;
  const bound = rightX - leftX;
  let x = startX + dir * step;
  let prevD = null;
  while (Math.abs(x - startX) < bound) {
    const d = (fn(x + step) - fn(x - step)) / (2 * step);
    if (Number.isFinite(d) && prevD !== null && prevD * d < 0) {
      trace.x = x;
      render();
      return;
    }
    if (Number.isFinite(d)) prevD = d;
    x += dir * step;
  }
}

// --- Sizing ----------------------------------------------------------------

function resize() {
  const dpr = window.devicePixelRatio || 1;
  width = window.innerWidth;
  height = window.innerHeight;

  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  doRender();
}

// --- Pan & zoom ------------------------------------------------------------

let isPanning = false;
let lastPointerX = 0;
let lastPointerY = 0;
let pointerDown = false;
let downX = 0;
let downY = 0;
let didDrag = false;

canvas.addEventListener('mousedown', (event) => {
  isPanning = true;
  pointerDown = true;
  downX = event.clientX;
  downY = event.clientY;
  didDrag = false;
  lastPointerX = event.clientX;
  lastPointerY = event.clientY;
  canvas.classList.add('is-panning');
});

window.addEventListener('mousemove', (event) => {
  if (!isPanning) return;
  const dx = event.clientX - lastPointerX;
  const dy = event.clientY - lastPointerY;
  lastPointerX = event.clientX;
  lastPointerY = event.clientY;

  if (Math.abs(event.clientX - downX) > 4 || Math.abs(event.clientY - downY) > 4) {
    didDrag = true;
  }

  view.centerX -= dx / view.pixelsPerUnit;
  view.centerY += dy / view.pixelsPerUnit; // screen-y is inverted

  cursor.x = event.clientX;
  cursor.y = event.clientY;
  cursor.active = true;
  render();
  if (!trace) updateReadout(event.clientX, event.clientY);
});

window.addEventListener('mouseup', (event) => {
  const wasDown = pointerDown;
  isPanning = false;
  pointerDown = false;
  canvas.classList.remove('is-panning');
  // A click (press without significant drag) selects a curve to trace.
  if (wasDown && !didDrag) handleCanvasClick(event.clientX, event.clientY);
});

canvas.addEventListener(
  'wheel',
  (event) => {
    event.preventDefault();

    // World point under the cursor stays fixed while zooming.
    const worldX = toWorldX(event.clientX);
    const worldY = toWorldY(event.clientY);

    const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
    view.pixelsPerUnit = Math.min(
      Math.max(view.pixelsPerUnit * factor, 5),
      100000
    );

    view.centerX = worldX - (event.clientX - width / 2) / view.pixelsPerUnit;
    view.centerY = worldY + (event.clientY - height / 2) / view.pixelsPerUnit;

    cursor.x = event.clientX;
    cursor.y = event.clientY;
    cursor.active = true;
    render();
    if (!trace) updateReadout(event.clientX, event.clientY);
  },
  { passive: false }
);

window.addEventListener('resize', resize);

// --- Cursor coordinate readout ---------------------------------------------

const readoutEl = document.getElementById('readout');

function coordDecimals() {
  // More zoom → more meaningful decimals (≈ 1 decimal at the default zoom).
  return Math.min(Math.max(Math.round(Math.log10(view.pixelsPerUnit)) - 1, 0), 6);
}

function formatValue(value, decimals) {
  if (!Number.isFinite(value)) return 'undefined';
  if (Math.abs(value) >= 1e6 || (value !== 0 && Math.abs(value) < 1e-4)) {
    return value.toExponential(2);
  }
  return Number(value.toFixed(decimals)).toString();
}

function updateReadout(screenX, screenY) {
  const decimals = coordDecimals();
  const worldX = toWorldX(screenX);
  const worldY = toWorldY(screenY);

  // Build with the DOM API (not innerHTML) so user expressions can never be
  // injected as markup. The coordinate line first, then one line per plot.
  readoutEl.replaceChildren();
  const coordLine = document.createElement('div');
  coordLine.textContent = `x: ${formatValue(worldX, decimals)}   y: ${formatValue(worldY, decimals)}`;
  readoutEl.append(coordLine);

  for (const plot of plots) {
    if (!plot.fn) continue;
    const line = document.createElement('div');
    line.style.color = plot.color;
    line.textContent = `f(x) = ${formatValue(plot.fn(worldX), decimals)}`;
    readoutEl.append(line);
  }

  readoutEl.hidden = false;

  // Keep the label inside the viewport by flipping near the right/bottom edge.
  const offset = 14;
  const flipX = screenX + offset + readoutEl.offsetWidth > width;
  const flipY = screenY + offset + readoutEl.offsetHeight > height;
  readoutEl.style.left = `${screenX + (flipX ? -offset - readoutEl.offsetWidth : offset)}px`;
  readoutEl.style.top = `${screenY + (flipY ? -offset - readoutEl.offsetHeight : offset)}px`;
}

function onCursorMove(screenX, screenY) {
  cursor.x = screenX;
  cursor.y = screenY;
  cursor.active = true;
  render();
  if (!trace) updateReadout(screenX, screenY);
}

canvas.addEventListener('mousemove', (event) => {
  // While panning, the window listener already re-renders; avoid a double draw.
  if (isPanning) return;
  onCursorMove(event.clientX, event.clientY);
});

canvas.addEventListener('mouseleave', () => {
  cursor.active = false;
  if (!trace) readoutEl.hidden = true;
  render();
});

// --- Trace: click selection + keyboard navigation --------------------------

function handleCanvasClick(sx, sy) {
  const worldX = toWorldX(sx);
  const candidates = plots.filter((p) => p.fn);
  let best = null;
  let bestDist = 30; // px snap radius
  for (const plot of candidates) {
    const y = plot.fn(worldX);
    if (!Number.isFinite(y)) continue;
    const dist = Math.abs(toScreenY(y) - sy);
    if (dist < bestDist) {
      bestDist = dist;
      best = plot;
    }
  }
  trace = best ? { plot: best, x: worldX } : null;
  if (!trace) readoutEl.hidden = true;
  render();
}

window.addEventListener('keydown', (event) => {
  if (!trace) return;
  const tag = event.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return; // don't hijack typing
  const step = 1 / view.pixelsPerUnit;
  switch (event.key) {
    case 'ArrowLeft':
      trace.x -= step;
      break;
    case 'ArrowRight':
      trace.x += step;
      break;
    case 'ArrowUp':
      jumpExtremum(1);
      return;
    case 'ArrowDown':
      jumpExtremum(-1);
      return;
    case 'Escape':
      trace = null;
      readoutEl.hidden = true;
      break;
    default:
      return;
  }
  event.preventDefault();
  render();
});

// --- Function panel UI -----------------------------------------------------

const functionsEl = document.getElementById('functions');
const addFunctionButton = document.getElementById('add-function');

// Plot colors cycle globally so curves stay distinct.
let colorIndex = 0;
const nextColor = () => PLOT_COLORS[colorIndex++ % PLOT_COLORS.length];

function recompile(plot, input) {
  const { fn, error } = compileExpression(plot.expr);
  plot.fn = fn;
  plot.error = error;
  input.classList.toggle('has-error', Boolean(error));
  input.title = error ?? '';
  render();
}

function addPlot(initialExpr, presetColor) {
  const color = presetColor ?? nextColor();
  const plot = { expr: initialExpr ?? '', color, fn: null, error: null };
  plots.push(plot);

  const row = document.createElement('div');
  row.className = 'function-row';

  const swatch = document.createElement('span');
  swatch.className = 'swatch';
  swatch.style.background = color;

  const input = document.createElement('input');
  input.type = 'text';
  input.value = plot.expr;
  input.placeholder = 'f(x) = …';
  input.spellcheck = false;
  plot.inputEl = input;
  input.addEventListener('input', () => {
    plot.expr = input.value.trim();
    recompile(plot, input);
    save();
  });

  const removeButton = document.createElement('button');
  removeButton.className = 'remove';
  removeButton.type = 'button';
  removeButton.textContent = '×';
  removeButton.addEventListener('click', () => {
    plots.splice(plots.indexOf(plot), 1);
    row.remove();
    render();
    save();
  });

  row.append(swatch, input, removeButton);
  functionsEl.append(row);

  if (plot.expr) recompile(plot, input);
}

addFunctionButton.addEventListener('click', () => {
  addPlot('');
  save();
});

// --- Persistence -----------------------------------------------------------

const STORAGE_KEY = 'graphunc.plots';

/** Minimal serializable shape; functions are recompiled from `expr` on load. */
function serialize() {
  return plots.map((p) => ({ expr: p.expr, color: p.color }));
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serialize()));
  } catch {
    // Storage unavailable (private mode, quota) — persistence is best-effort.
  }
}

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// --- Toolbar: share / export / view ----------------------------------------

/** Compact serializable state for both localStorage and URL sharing. */
function serializeState() {
  return {
    v: [view.centerX, view.centerY, view.pixelsPerUnit],
    p: plots.map((p) => [p.expr, p.color]),
  };
}

// URL-safe base64 (no +/ =) so the hash stays clean and copy-pasteable.
function toUrlBase64(b64) {
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromUrlBase64(s) {
  let b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return b64;
}

function encodeState(obj) {
  const json = JSON.stringify(obj);
  return toUrlBase64(
    btoa(String.fromCharCode(...new TextEncoder().encode(json)))
  );
}

function decodeState(encoded) {
  const json = new TextDecoder().decode(
    Uint8Array.from(atob(fromUrlBase64(encoded)), (c) => c.charCodeAt(0))
  );
  return JSON.parse(json);
}

function buildShareUrl() {
  const encoded = encodeState(serializeState());
  return `${location.origin}${location.pathname}#${encoded}`;
}

function loadFromHash() {
  const hash = location.hash.slice(1);
  if (!hash) return null;
  try {
    return decodeState(hash);
  } catch {
    return null;
  }
}

function applyState(state) {
  for (const plot of state.p ?? []) {
    addPlot(plot[0], plot[1]);
  }
  if (Array.isArray(state.v)) {
    view.centerX = state.v[0];
    view.centerY = state.v[1];
    view.pixelsPerUnit = state.v[2];
  }
}

const copyLinkBtn = document.getElementById('copy-link');
copyLinkBtn.addEventListener('click', async () => {
  const url = buildShareUrl();
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    // Fallback for older browsers / non-secure contexts.
    const tmp = document.createElement('textarea');
    tmp.value = url;
    document.body.append(tmp);
    tmp.select();
    document.execCommand('copy');
    tmp.remove();
  }
  copyLinkBtn.textContent = 'Copied!';
  copyLinkBtn.classList.add('copied');
  setTimeout(() => {
    copyLinkBtn.textContent = 'Copy link';
    copyLinkBtn.classList.remove('copied');
  }, 1500);
});

document.getElementById('export-png').addEventListener('click', () => {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'graphunc.png';
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
});

document.getElementById('reset-view').addEventListener('click', () => {
  view.centerX = 0;
  view.centerY = 0;
  view.pixelsPerUnit = 60;
  render();
});

// --- Help overlay ----------------------------------------------------------

const helpOverlay = document.getElementById('help-overlay');
const helpBtn = document.getElementById('help-btn');
const helpClose = document.getElementById('help-close');

function openHelp() { helpOverlay.hidden = false; }
function closeHelp() { helpOverlay.hidden = true; }

helpBtn.addEventListener('click', openHelp);
helpClose.addEventListener('click', closeHelp);
helpOverlay.addEventListener('click', (event) => {
  if (event.target === helpOverlay) closeHelp();
});
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !helpOverlay.hidden) closeHelp();
});


resize();

// A URL hash (shared link) takes priority over localStorage; once restored
// the hash is cleared so the URL bar stays clean while working.
const hashState = loadFromHash();
const restored = hashState ?? loadState();
if (hashState) {
  applyState(restored);
  history.replaceState(null, '', location.pathname + location.search);
} else if (restored) {
  for (const p of restored) addPlot(p.expr, p.color);
} else {
  addPlot('sin(x)');
}

render();
