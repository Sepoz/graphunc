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
  background: '#0f1115',
  grid: '#1c222e',
  axis: '#5c6b80',
  label: '#8a97a8',
};

// Palette cycled through as the user adds functions.
const PLOT_COLORS = ['#4dd0e1', '#f06292', '#aed581', '#ffb74d', '#ba68c8'];

const view = {
  centerX: 0,
  centerY: 0,
  pixelsPerUnit: 60,
};

// Active plots: { expr, color, fn, error }. `fn` is null when `expr` is invalid.
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

function render() {
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, width, height);

  const step = niceStep(70);
  drawGrid(step);
  drawAxes();
  drawLabels(step);

  for (const plot of plots) {
    if (plot.fn) plotFunction(plot.fn, plot.color);
  }

  if (cursor.active) drawCursorMarkers();
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
    ctx.strokeStyle = COLORS.background;
    ctx.stroke();
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

  render();
}

// --- Pan & zoom ------------------------------------------------------------

let isPanning = false;
let lastPointerX = 0;
let lastPointerY = 0;

canvas.addEventListener('mousedown', (event) => {
  isPanning = true;
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

  view.centerX -= dx / view.pixelsPerUnit;
  view.centerY += dy / view.pixelsPerUnit; // screen-y is inverted

  cursor.x = event.clientX;
  cursor.y = event.clientY;
  cursor.active = true;
  render();
  updateReadout(event.clientX, event.clientY);
});

window.addEventListener('mouseup', () => {
  isPanning = false;
  canvas.classList.remove('is-panning');
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
    updateReadout(event.clientX, event.clientY);
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
  updateReadout(screenX, screenY);
}

canvas.addEventListener('mousemove', (event) => {
  // While panning, the window listener already re-renders; avoid a double draw.
  if (isPanning) return;
  onCursorMove(event.clientX, event.clientY);
});

canvas.addEventListener('mouseleave', () => {
  cursor.active = false;
  readoutEl.hidden = true;
  render();
});

// --- Function panel UI -----------------------------------------------------

const functionsEl = document.getElementById('functions');
const addButton = document.getElementById('add-function');

function recompile(plot, input) {
  const { fn, error } = compileExpression(plot.expr);
  plot.fn = fn;
  plot.error = error;
  input.classList.toggle('has-error', Boolean(error));
  input.title = error ?? '';
  render();
}

function addPlot(initialExpr) {
  const color = PLOT_COLORS[plots.length % PLOT_COLORS.length];
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
  input.addEventListener('input', () => {
    plot.expr = input.value.trim();
    recompile(plot, input);
  });

  const removeButton = document.createElement('button');
  removeButton.className = 'remove';
  removeButton.type = 'button';
  removeButton.textContent = '×';
  removeButton.addEventListener('click', () => {
    plots.splice(plots.indexOf(plot), 1);
    row.remove();
    render();
  });

  row.append(swatch, input, removeButton);
  functionsEl.append(row);

  if (plot.expr) recompile(plot, input);
}

addButton.addEventListener('click', () => addPlot(''));

// --- Boot ------------------------------------------------------------------

resize();
addPlot('sin(x)');
