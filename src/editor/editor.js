import { initI18n, applyI18n, t } from '../lib/i18n.js';
import { drawShape, boxOf, measureText, textFont, norm, REGION_TOOLS, VECTOR_TOOLS } from './shapes.js';
import { captureFilename } from '../lib/naming.js';

const board = document.getElementById('board');
const bctx = board.getContext('2d', { willReadFrequently: true });
const stage = document.getElementById('stage');
const wrap = document.getElementById('wrap');
const toast = document.getElementById('toast');
const dialog = document.getElementById('blurWarning');
const textInput = document.getElementById('textInput');

const MIN_SIZE = 6;    // image px below which a drawn region is discarded
const HANDLE_PX = 9;   // screen px
const HISTORY_LIMIT = 100;

// Cada cor carrega o nome da sua chave de tradução: um botão de cor sem nome
// acessível é anunciado como "botão" e nada mais, oito vezes seguidas.
const PALETTE = [
  ['#e11d48', 'color_red'], ['#f59e0b', 'color_orange'],
  ['#facc15', 'color_yellow'], ['#22c55e', 'color_green'],
  ['#2563eb', 'color_blue'], ['#a855f7', 'color_purple'],
  ['#111827', 'color_black'], ['#ffffff', 'color_white']
];

const state = {
  tool: 'blur',
  shapes: [],
  selected: null,
  // Rectangle of the original capture currently on screen. Cropping only moves
  // this window: the untouched capture is kept, so a crop can be undone and the
  // pixels come back.
  crop: null,
  zoom: 1,
  fitted: true,
  defaults: {
    mode: 'blur', strength: 24,
    color: '#e11d48', highlightColor: '#ffe14d', stroke: 4, fill: false,
    size: 26, bold: false, italic: false, outline: true
  }
};

let originalBase = null;  // the full capture, never modified
let base = null;          // the visible bitmap: originalBase windowed by state.crop
let drag = null;
let editing = null;       // the text shape currently open in the textarea
let cropDraft = null;     // pending crop rectangle, not part of the document
let history = [];
let historyIndex = -1;

const selectedShape = () => state.shapes.find((s) => s.id === state.selected) || null;
const isRegionTool = (tool) => REGION_TOOLS.includes(tool);

/* ---------------- geometry ---------------- */

function screenScale() {
  const rect = board.getBoundingClientRect();
  return rect.width / board.width || 1;
}

function toImage(event) {
  const rect = board.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) / rect.width * board.width,
    y: (event.clientY - rect.top) / rect.height * board.height
  };
}

function handlePoints(box) {
  const { x, y, w, h } = box;
  return [
    ['nw', x, y], ['n', x + w / 2, y], ['ne', x + w, y],
    ['e', x + w, y + h / 2], ['se', x + w, y + h], ['s', x + w / 2, y + h],
    ['sw', x, y + h], ['w', x, y + h / 2]
  ];
}

const CURSORS = {
  nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize',
  n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize'
};

/* ---------------- crop window ---------------- */

/** Rebuilds the visible bitmap from the untouched capture and resizes the canvas. */
function setCrop(rect) {
  state.crop = rect;
  const cut = document.createElement('canvas');
  cut.width = Math.max(1, Math.round(rect.w));
  cut.height = Math.max(1, Math.round(rect.h));
  cut.getContext('2d').drawImage(
    originalBase, rect.x, rect.y, rect.w, rect.h, 0, 0, cut.width, cut.height
  );
  base = cut;
  board.width = cut.width;
  board.height = cut.height;
}

function applyCrop() {
  if (!cropDraft) return;
  const rect = norm(cropDraft);
  if (rect.w < MIN_SIZE || rect.h < MIN_SIZE) { cancelCrop(); return; }

  // Shapes live in canvas coordinates, so they shift with the new origin. The
  // crop rectangle itself is translated into the original capture's space.
  for (const shape of state.shapes) {
    shape.x -= rect.x;
    shape.y -= rect.y;
  }
  setCrop({
    x: state.crop.x + rect.x,
    y: state.crop.y + rect.y,
    w: rect.w,
    h: rect.h
  });

  cropDraft = null;
  state.selected = null;
  pushHistory();
  setZoom(state.fitted ? fitZoom() : state.zoom, state.fitted);
}

function cancelCrop() {
  cropDraft = null;
  syncToolbar();
  render();
}

/* ---------------- rendering ---------------- */

function strokeBox(ctx, box, px) {
  ctx.save();
  ctx.lineWidth = px;
  ctx.setLineDash([5 * px, 4 * px]);
  ctx.strokeStyle = 'rgba(0,0,0,.75)';
  ctx.strokeRect(box.x, box.y, box.w, box.h);
  ctx.strokeStyle = 'rgba(255,255,255,.95)';
  ctx.lineDashOffset = 5 * px;
  ctx.strokeRect(box.x, box.y, box.w, box.h);
  ctx.restore();
}

function drawHandles(ctx, box, px) {
  const size = HANDLE_PX * px;
  strokeBox(ctx, box, px);
  ctx.save();
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#2563eb';
  ctx.lineWidth = 1.5 * px;
  for (const [, hx, hy] of handlePoints(box)) {
    ctx.beginPath();
    ctx.rect(hx - size / 2, hy - size / 2, size, size);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/** `withChrome` is false for export: handles and the draft outline never bake in. */
function paint(ctx, canvas, withChrome) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(base, 0, 0);
  for (const shape of state.shapes) {
    if (shape === editing) continue;   // being typed: the textarea shows it
    drawShape(ctx, canvas, shape);
  }

  if (!withChrome) return;
  const px = 1 / screenScale();
  if (drag?.shape && drag.mode === 'draw') {
    drawShape(ctx, canvas, drag.shape);
    if (isRegionTool(drag.shape.type)) strokeBox(ctx, norm(drag.shape), px);
  }
  if (cropDraft) {
    const rect = norm(cropDraft);
    ctx.save();
    ctx.fillStyle = 'rgba(12, 16, 22, .55)';
    // Even-odd turns the two rectangles into "everything except the selection",
    // which dims the discarded area in a single fill.
    ctx.beginPath();
    ctx.rect(0, 0, canvas.width, canvas.height);
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.fill('evenodd');
    ctx.restore();
    drawHandles(ctx, rect, px);
    return;
  }

  const selected = selectedShape();
  if (selected && !drag && selected !== editing) {
    const box = boxOf(ctx, selected);
    if (selected.type === 'text') strokeBox(ctx, box, px);
    else drawHandles(ctx, box, px);
  }
}

function render() {
  paint(bctx, board, true);
}

/* ---------------- history ---------------- */

/**
 * A history entry carries the crop window too, so undoing a crop restores the
 * discarded pixels instead of only the annotations.
 *
 * Entries are whole snapshots, and a pencil stroke holds hundreds of points, so
 * the stack is capped: without it a long session grows without bound. A
 * hundred steps is far past what anyone undoes by hand.
 */
function pushHistory() {
  history = history.slice(0, historyIndex + 1);
  history.push(JSON.stringify({ shapes: state.shapes, crop: state.crop }));
  if (history.length > HISTORY_LIMIT) history = history.slice(-HISTORY_LIMIT);
  historyIndex = history.length - 1;
  syncToolbar();
}

function restore(index) {
  commitText();
  cropDraft = null;
  historyIndex = index;
  const entry = JSON.parse(history[index]);
  state.shapes = entry.shapes;
  if (!selectedShape()) state.selected = null;

  const sameCrop = state.crop && entry.crop.x === state.crop.x && entry.crop.y === state.crop.y
    && entry.crop.w === state.crop.w && entry.crop.h === state.crop.h;
  if (!sameCrop) {
    setCrop(entry.crop);
    setZoom(state.fitted ? fitZoom() : state.zoom, state.fitted);
    return;
  }
  syncToolbar();
  render();
}

const canUndo = () => historyIndex > 0;
const canRedo = () => historyIndex < history.length - 1;

/* ---------------- toolbar ---------------- */

const el = (id) => document.getElementById(id);

function syncToolbar() {
  document.querySelectorAll('.tool[data-tool]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.tool === state.tool));
  });

  // The property groups follow the selection when there is one, and the active
  // tool otherwise, so the controls on screen always affect something visible.
  const subject = selectedShape()?.type ?? state.tool;
  const DRAWN = ['rect', 'ellipse', 'line', 'arrow', 'pen', 'highlight', 'text'];
  el('propsObscure').hidden = !['blur', 'redact'].includes(subject);
  el('propsDraw').hidden = !DRAWN.includes(subject);
  el('propsText').hidden = subject !== 'text';
  el('fillWrap').hidden = !['rect', 'ellipse'].includes(subject);
  el('propsCrop').hidden = !cropDraft;
  if (cropDraft) {
    const rect = norm(cropDraft);
    el('cropSize').textContent = t('overlay_dimensions', Math.round(rect.w), Math.round(rect.h));
  }

  const style = selectedShape() ?? state.defaults;
  el('color').value = selectedShape()
    ? style.color
    : (subject === 'highlight' ? state.defaults.highlightColor : state.defaults.color);
  el('stroke').value = style.stroke ?? state.defaults.stroke;
  el('fill').checked = Boolean(style.fill);
  el('fontSize').value = style.size ?? state.defaults.size;
  el('blurMode').value = style.mode ?? state.defaults.mode;
  el('blurStrength').value = style.strength ?? state.defaults.strength;
  for (const key of ['bold', 'italic', 'outline']) {
    el(key).setAttribute('aria-pressed', String(Boolean(style[key])));
  }
  document.querySelectorAll('#swatches button').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.color === el('color').value));
  });

  el('undo').disabled = !canUndo();
  el('redo').disabled = !canRedo();
  el('remove').disabled = !state.selected;
  el('zoomFit').textContent = `${Math.round(state.zoom * 100)}%`;
  stage.dataset.tool = state.tool;
}

function selectTool(tool) {
  commitText();
  if (tool !== 'crop') cropDraft = null;
  state.tool = tool;
  if (tool !== 'move') state.selected = null;
  syncToolbar();
  render();
}

/**
 * Writes a property to the selected shape *and* remembers it as the default for
 * the next one. Drawing leaves the new shape selected, so treating an edit as
 * applying only to the selection would silently throw the choice away the
 * moment the user drew again.
 */
function setProp(patch, commit = true) {
  const selected = selectedShape();
  const subject = selected?.type ?? state.tool;

  const defaults = { ...patch };
  // The highlighter keeps its own ink colour: picking a red for an arrow should
  // not turn the marker red as well, since both share one swatch row.
  if (subject === 'highlight' && 'color' in defaults) {
    defaults.highlightColor = defaults.color;
    delete defaults.color;
  }
  Object.assign(state.defaults, defaults);

  if (selected) {
    Object.assign(selected, patch);
    if (commit) pushHistory();
  }
  syncToolbar();
  render();
}

/* ---------------- zoom ---------------- */

function applyZoom() {
  board.style.width = `${board.width * state.zoom}px`;
  board.style.height = `${board.height * state.zoom}px`;
  board.classList.toggle('crisp', state.zoom >= 1);
  syncToolbar();
  render();
  if (editing) placeTextInput();
}

function fitZoom() {
  return Math.min(1,
    (stage.clientWidth - 48) / board.width,
    (stage.clientHeight - 48) / board.height);
}

function setZoom(value, fitted = false) {
  state.zoom = Math.min(4, Math.max(0.1, value));
  state.fitted = fitted;
  applyZoom();
}

/* ---------------- text editing ---------------- */

function placeTextInput() {
  const scale = screenScale();
  textInput.style.left = `${editing.x * scale}px`;
  textInput.style.top = `${editing.y * scale}px`;
  textInput.style.font = textFont({ ...editing, size: editing.size * scale });
  textInput.style.lineHeight = 1.25;
  textInput.style.color = editing.color;
  autoGrow();
}

function autoGrow() {
  const scale = screenScale();
  const lines = textInput.value.split('\n');
  bctx.save();
  bctx.font = textFont(editing);
  const width = Math.max(40, ...lines.map((l) => bctx.measureText(l).width)) * scale;
  bctx.restore();
  textInput.style.width = `${width + 12 * scale}px`;
  textInput.style.height = `${lines.length * editing.size * 1.25 * scale + 4}px`;
}

function startText(point) {
  const shape = {
    id: crypto.randomUUID(),
    type: 'text',
    x: point.x, y: point.y, w: 0, h: 0,
    text: '',
    color: state.defaults.color,
    size: state.defaults.size,
    bold: state.defaults.bold,
    italic: state.defaults.italic,
    outline: state.defaults.outline
  };
  state.shapes.push(shape);
  openText(shape);
}

function openText(shape) {
  editing = shape;
  state.selected = shape.id;
  textInput.value = shape.text;
  textInput.hidden = false;
  placeTextInput();
  render();
  syncToolbar();
  // Focus after the click finishes settling, so nothing can steal it back.
  requestAnimationFrame(() => {
    if (editing !== shape) return;
    textInput.focus();
    textInput.setSelectionRange(textInput.value.length, textInput.value.length);
  });
}

/** Closes the inline editor. An empty label is dropped rather than left as an
 *  invisible shape the user would have to hunt for. */
function commitText() {
  if (!editing) return;
  const shape = editing;
  editing = null;
  textInput.hidden = true;

  shape.text = textInput.value;
  if (!shape.text.trim()) {
    state.shapes = state.shapes.filter((s) => s !== shape);
    if (state.selected === shape.id) state.selected = null;
  } else {
    const box = measureText(bctx, shape);
    shape.w = box.w;
    shape.h = box.h;
  }
  pushHistory();
  render();
}

textInput.addEventListener('input', autoGrow);
textInput.addEventListener('blur', commitText);
textInput.addEventListener('keydown', (event) => {
  event.stopPropagation();
  if (event.key === 'Escape' || (event.key === 'Enter' && (event.ctrlKey || event.metaKey))) {
    event.preventDefault();
    board.focus();
    commitText();
  }
});

/* ---------------- pointer interaction ---------------- */

function handleAt(box, point) {
  const tolerance = (HANDLE_PX / screenScale()) * 0.8;
  for (const [id, hx, hy] of handlePoints(box)) {
    if (Math.abs(point.x - hx) <= tolerance && Math.abs(point.y - hy) <= tolerance) return id;
  }
  return null;
}

function hitHandle(point) {
  const selected = selectedShape();
  // Text is sized by its font, not by a box, so it gets no resize handles:
  // the size slider is the honest control for it.
  if (!selected || selected.type === 'text') return null;
  return handleAt(boxOf(bctx, selected), point);
}

const inside = (box, point) =>
  point.x >= box.x && point.x <= box.x + box.w &&
  point.y >= box.y && point.y <= box.y + box.h;

function hitShape(point) {
  for (let i = state.shapes.length - 1; i >= 0; i--) {
    const box = boxOf(bctx, state.shapes[i]);
    const pad = state.shapes[i].type === 'line' || state.shapes[i].type === 'arrow'
      ? state.shapes[i].stroke : 0;
    if (point.x >= box.x - pad && point.x <= box.x + box.w + pad
     && point.y >= box.y - pad && point.y <= box.y + box.h + pad) return state.shapes[i];
  }
  return null;
}

function newShape(point) {
  const d = state.defaults;
  const shape = {
    id: crypto.randomUUID(),
    type: state.tool,
    x: point.x, y: point.y, w: 0, h: 0
  };
  if (state.tool === 'blur') Object.assign(shape, { mode: d.mode, strength: d.strength });
  if (state.tool === 'highlight') shape.color = d.highlightColor;
  if (['rect', 'ellipse', 'line', 'arrow', 'pen'].includes(state.tool)) {
    Object.assign(shape, { color: d.color, stroke: d.stroke });
  }
  if (['rect', 'ellipse'].includes(state.tool)) shape.fill = d.fill;
  if (VECTOR_TOOLS.includes(state.tool)) Object.assign(shape, { a: [0, 0], b: [1, 1] });
  if (state.tool === 'pen') shape.raw = [[point.x, point.y]];
  return shape;
}

board.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  commitText();
  const point = toImage(event);

  if (state.tool === 'text') {
    // Without this, the default mousedown behaviour moves focus to the canvas
    // right after we focus the textarea, the blur handler fires, and the empty
    // label is committed and discarded before a single character is typed.
    event.preventDefault();
    const existing = hitShape(point);
    if (existing?.type === 'text') openText(existing);
    else startText(point);
    return;
  }

  board.setPointerCapture(event.pointerId);

  if (state.tool === 'crop') {
    if (cropDraft) {
      const rect = norm(cropDraft);
      const handle = handleAt(rect, point);
      if (handle) { drag = { mode: 'cropresize', handle, origin: rect }; return; }
      if (inside(rect, point)) {
        drag = { mode: 'cropmove', dx: point.x - rect.x, dy: point.y - rect.y };
        return;
      }
    }
    // Dragging outside the pending rectangle starts a fresh one.
    cropDraft = { x: point.x, y: point.y, w: 0, h: 0 };
    drag = { mode: 'cropdraw' };
    return;
  }

  if (state.tool === 'move') {
    const handle = hitHandle(point);
    if (handle) {
      const shape = selectedShape();
      drag = {
        mode: 'resize', handle, shape, origin: boxOf(bctx, shape),
        // Geometry stored as fractions reads against the *normalised* box, so
        // dragging a handle past the opposite edge flips the box under it. Keep
        // the starting fractions to mirror them when that happens.
        a: shape.a && [...shape.a],
        b: shape.b && [...shape.b],
        pts: shape.pts && shape.pts.map((p) => [...p])
      };
      return;
    }
    const shape = hitShape(point);
    state.selected = shape ? shape.id : null;
    if (shape) {
      const box = boxOf(bctx, shape);
      drag = { mode: 'move', shape, dx: point.x - box.x, dy: point.y - box.y };
    } else {
      drag = null;
    }
    syncToolbar();
    render();
    return;
  }

  drag = { mode: 'draw', shape: newShape(point) };
});

board.addEventListener('pointermove', (event) => {
  const point = toImage(event);

  if (!drag) {
    if (state.tool === 'move') {
      const handle = hitHandle(point);
      board.style.cursor = handle ? CURSORS[handle] : (hitShape(point) ? 'move' : 'default');
    } else if (state.tool === 'crop' && cropDraft) {
      const rect = norm(cropDraft);
      const handle = handleAt(rect, point);
      board.style.cursor = handle ? CURSORS[handle] : (inside(rect, point) ? 'move' : '');
    } else {
      board.style.cursor = '';
    }
    return;
  }

  if (drag.mode.startsWith('crop')) {
    const rect = norm(cropDraft);
    if (drag.mode === 'cropdraw') {
      cropDraft.w = point.x - cropDraft.x;
      cropDraft.h = point.y - cropDraft.y;
    } else if (drag.mode === 'cropmove') {
      Object.assign(cropDraft, {
        x: Math.min(Math.max(0, point.x - drag.dx), board.width - rect.w),
        y: Math.min(Math.max(0, point.y - drag.dy), board.height - rect.h),
        w: rect.w, h: rect.h
      });
    } else {
      const o = drag.origin;
      let { x, y, w, h } = o;
      if (drag.handle.includes('w')) { w = o.x + o.w - point.x; x = point.x; }
      if (drag.handle.includes('e')) { w = point.x - o.x; }
      if (drag.handle.includes('n')) { h = o.y + o.h - point.y; y = point.y; }
      if (drag.handle.includes('s')) { h = point.y - o.y; }
      Object.assign(cropDraft, { x, y, w, h });
    }
    syncToolbar();
    render();
    return;
  }

  if (drag.mode === 'draw') {
    const shape = drag.shape;
    if (shape.type === 'pen') {
      shape.raw.push([point.x, point.y]);
      rebuildPen(shape);
    } else {
      shape.w = point.x - shape.x;
      shape.h = point.y - shape.y;
      if (VECTOR_TOOLS.includes(shape.type)) {
        // Fractions are relative to the normalised box, so a stroke dragged
        // up-left keeps pointing the right way once the box is flipped.
        shape.a = [shape.w < 0 ? 1 : 0, shape.h < 0 ? 1 : 0];
        shape.b = [shape.w < 0 ? 0 : 1, shape.h < 0 ? 0 : 1];
      }
    }
  } else if (drag.mode === 'move') {
    const box = boxOf(bctx, drag.shape);
    const nx = Math.min(Math.max(0, point.x - drag.dx), board.width - box.w);
    const ny = Math.min(Math.max(0, point.y - drag.dy), board.height - box.h);
    Object.assign(drag.shape, { x: nx, y: ny, w: box.w, h: box.h });
  } else {
    const o = drag.origin;
    let { x, y, w, h } = o;
    if (drag.handle.includes('w')) { w = o.x + o.w - point.x; x = point.x; }
    if (drag.handle.includes('e')) { w = point.x - o.x; }
    if (drag.handle.includes('n')) { h = o.y + o.h - point.y; y = point.y; }
    if (drag.handle.includes('s')) { h = point.y - o.y; }
    Object.assign(drag.shape, { x, y, w, h });
    mirrorGeometry(drag, w < 0, h < 0);
  }
  render();
});

/**
 * Mirrors fraction-based geometry when a resize turns the box inside out.
 *
 * Fractions are read against the normalised box, so once the box flips, what
 * used to be its left edge is now its right. Without this an arrow dragged past
 * its own tail would swap ends, and a scribble would come out reflected.
 */
function mirrorGeometry(drag, flipX, flipY) {
  const at = (p) => [flipX ? 1 - p[0] : p[0], flipY ? 1 - p[1] : p[1]];
  if (drag.a) drag.shape.a = at(drag.a);
  if (drag.b) drag.shape.b = at(drag.b);
  if (drag.pts) drag.shape.pts = drag.pts.map(at);
}

/** Freehand points are stored as fractions of the stroke's own bounding box
 *  so that moving and resizing the scribble needs no special case. */
function rebuildPen(shape) {
  const xs = shape.raw.map((p) => p[0]);
  const ys = shape.raw.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const w = Math.max(1, Math.max(...xs) - x);
  const h = Math.max(1, Math.max(...ys) - y);
  Object.assign(shape, { x, y, w, h });
  shape.pts = shape.raw.map(([px, py]) => [(px - x) / w, (py - y) / h]);
}

function endDrag() {
  if (!drag) return;
  const finished = drag;
  drag = null;

  // A pending crop is not part of the document, so it never touches history.
  if (finished.mode.startsWith('crop')) {
    if (cropDraft) {
      const r = norm(cropDraft);
      const x = Math.max(0, r.x);
      const y = Math.max(0, r.y);
      const w = Math.min(board.width, r.x + r.w) - x;
      const h = Math.min(board.height, r.y + r.h) - y;
      cropDraft = (w < MIN_SIZE || h < MIN_SIZE) ? null : { x, y, w, h };
    }
    syncToolbar();
    render();
    return;
  }

  if (finished.mode === 'draw') {
    const shape = finished.shape;
    if (shape.type === 'pen') {
      delete shape.raw;
      if (!shape.pts || shape.pts.length < 2) { render(); return; }
    } else {
      const box = norm(shape);
      const tiny = box.w < MIN_SIZE && box.h < MIN_SIZE;
      if (tiny) { render(); return; }
      Object.assign(shape, box);
    }
    state.shapes.push(shape);
    state.selected = shape.id;
  } else {
    Object.assign(finished.shape, boxOf(bctx, finished.shape));
  }

  pushHistory();
  render();

  if (finished.mode === 'draw' && finished.shape.type === 'blur') maybeWarnBlur(finished.shape);
}

board.addEventListener('pointerup', endDrag);
board.addEventListener('pointercancel', endDrag);

/* ---------------- toolbar wiring ---------------- */

document.querySelectorAll('.tool[data-tool]').forEach((btn) => {
  btn.addEventListener('click', () => selectTool(btn.dataset.tool));
});

el('undo').addEventListener('click', () => canUndo() && restore(historyIndex - 1));
el('redo').addEventListener('click', () => canRedo() && restore(historyIndex + 1));

el('remove').addEventListener('click', () => {
  if (!state.selected) return;
  state.shapes = state.shapes.filter((s) => s.id !== state.selected);
  state.selected = null;
  pushHistory();
  render();
});

const swatches = el('swatches');
for (const [color, nameKey] of PALETTE) {
  const button = document.createElement('button');
  button.className = 'swatch';
  button.dataset.color = color;
  button.style.background = color;
  // Por atributo, não por t() aqui: os swatches são criados no topo do módulo,
  // antes de initI18n() rodar no boot, e nesse instante t() devolveria a chave.
  // applyI18n() preenche os dois depois, como faz com o resto da interface.
  button.dataset.i18nAria = nameKey;
  button.dataset.i18nTitle = nameKey;
  button.addEventListener('click', () => setProp({ color }));
  swatches.append(button);
}

el('color').addEventListener('input', (e) => setProp({ color: e.target.value }, false));
el('color').addEventListener('change', (e) => setProp({ color: e.target.value }));
el('stroke').addEventListener('input', (e) => setProp({ stroke: Number(e.target.value) }, false));
el('stroke').addEventListener('change', () => selectedShape() && pushHistory());
el('fill').addEventListener('change', (e) => setProp({ fill: e.target.checked }));
el('fontSize').addEventListener('input', (e) => setProp({ size: Number(e.target.value) }, false));
el('fontSize').addEventListener('change', () => selectedShape() && pushHistory());
el('blurMode').addEventListener('change', (e) => setProp({ mode: e.target.value }));
el('blurStrength').addEventListener('input', (e) => setProp({ strength: Number(e.target.value) }, false));
el('blurStrength').addEventListener('change', () => selectedShape() && pushHistory());

for (const key of ['bold', 'italic', 'outline']) {
  el(key).addEventListener('click', () => {
    const current = selectedShape()?.[key] ?? state.defaults[key];
    setProp({ [key]: !current });
  });
}

el('cropApply').addEventListener('click', applyCrop);
el('cropCancel').addEventListener('click', cancelCrop);

el('zoomIn').addEventListener('click', () => setZoom(state.zoom * 1.25));
el('zoomOut').addEventListener('click', () => setZoom(state.zoom / 1.25));
el('zoomFit').addEventListener('click', () => setZoom(state.fitted ? 1 : fitZoom(), !state.fitted));

/* ---------------- blur warning ---------------- */

let pendingBlurShape = null;

/**
 * Raised once, the first time a blurred region is actually committed, rather
 * than when the tool is picked: at that moment the warning is about something
 * concrete on screen, and "switch to redact" can convert that very region.
 */
async function maybeWarnBlur(shape) {
  const { blurWarningDismissed = false } = await chrome.storage.local.get('blurWarningDismissed');
  if (blurWarningDismissed) return;

  // Once per browser session, not once per region: blurring six fields in one
  // screenshot is the normal case, and six modals would make the tool useless.
  // The checkbox in the dialog is the permanent opt-out.
  const { blurWarningShown = false } = await chrome.storage.session.get('blurWarningShown');
  if (blurWarningShown) return;
  await chrome.storage.session.set({ blurWarningShown: true });

  pendingBlurShape = shape;
  dialog.showModal();
}

async function closeWarning(convert) {
  if (el('blurWarningDismiss').checked) {
    await chrome.storage.local.set({ blurWarningDismissed: true });
  }
  dialog.close();
  if (convert && pendingBlurShape) {
    pendingBlurShape.type = 'redact';
    state.tool = 'redact';
    pushHistory();
  }
  pendingBlurShape = null;
  syncToolbar();
  render();
}

el('keepBlur').addEventListener('click', () => closeWarning(false));
el('switchRedact').addEventListener('click', () => closeWarning(true));
dialog.addEventListener('cancel', (event) => { event.preventDefault(); closeWarning(false); });

/* ---------------- export ---------------- */

function flatten() {
  commitText();
  const out = document.createElement('canvas');
  out.width = board.width;
  out.height = board.height;
  paint(out.getContext('2d'), out, false);
  return out;
}

const exportBlob = () => new Promise((resolve) => flatten().toBlob(resolve, 'image/png'));

function flash(message, isError = false) {
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2400);
}

async function copyImage() {
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': await exportBlob() })]);
    flash(t('toast_copied'));
  } catch {
    flash(t('err_clipboard'), true);
  }
}

el('copy').addEventListener('click', copyImage);

// Ctrl+C copies the finished image, as Lightshot did. The keydown handler
// below is the main path; this `copy` listener catches the other ways a system
// can ask for a copy (Ctrl+Insert, a mouse button that sends the copy command
// rather than the keystroke). When keydown handles Ctrl+C it cancels the
// default, so the browser never fires this too and the image is copied once.
document.addEventListener('copy', (event) => {
  if (!wantsImageCopy()) return;
  event.preventDefault();
  copyImage();
});

// Copying text stays copying text: inside the text tool's box, or when the user
// has actually selected some text on the page.
function wantsImageCopy() {
  return !dialog.open && !editing && !String(getSelection());
}

// Ctrl+C by character, or by physical key when the layout isn't Latin: on a
// Russian keyboard the same keystroke reports a Cyrillic letter.
function isCopyKey(event) {
  const key = event.key.toLowerCase();
  return key === 'c' || (event.code === 'KeyC' && !/^[a-z]$/.test(key));
}

el('save').addEventListener('click', async () => {
  const name = captureFilename();
  let url;
  try {
    const { askSaveLocation = false } = await chrome.storage.local.get('askSaveLocation');
    url = URL.createObjectURL(await exportBlob());
    await chrome.downloads.download({ url, filename: name, saveAs: askSaveLocation });
    flash(t('toast_saved', name));
  } catch {
    flash(t('err_save_failed'), true);
  } finally {
    // The download reads the blob asynchronously, so the URL has to outlive
    // this handler by a moment.
    if (url) setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
});

/* ---------------- keyboard ---------------- */

const TOOL_KEYS = { v: 'move', b: 'blur', r: 'redact', u: 'rect', o: 'ellipse',
                    a: 'arrow', l: 'line', p: 'pen', h: 'highlight', t: 'text', c: 'crop' };

document.addEventListener('keydown', (event) => {
  if (dialog.open || editing) return;

  if (cropDraft) {
    if (event.key === 'Enter') { event.preventDefault(); applyCrop(); return; }
    if (event.key === 'Escape') { event.preventDefault(); cancelCrop(); return; }
  }
  // A slider or colour input has focus after every property tweak; single-key
  // tool shortcuts must not fire while the user is driving one.
  const inField = event.target.closest?.('input, select, textarea');
  const ctrl = event.ctrlKey || event.metaKey;

  if (ctrl && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    if (event.shiftKey) canRedo() && restore(historyIndex + 1);
    else canUndo() && restore(historyIndex - 1);
  } else if (ctrl && event.key.toLowerCase() === 'y') {
    event.preventDefault();
    canRedo() && restore(historyIndex + 1);
  } else if (ctrl && !event.shiftKey && !event.altKey && isCopyKey(event)) {
    if (wantsImageCopy()) {
      event.preventDefault();
      copyImage();
    }
  } else if ((event.key === 'Delete' || event.key === 'Backspace') && state.selected) {
    event.preventDefault();
    el('remove').click();
  } else if (event.key === 'Escape') {
    state.selected = null;
    syncToolbar();
    render();
  } else if (!ctrl && !event.altKey && !inField && TOOL_KEYS[event.key.toLowerCase()]) {
    selectTool(TOOL_KEYS[event.key.toLowerCase()]);
  }
});

/* ---------------- boot ---------------- */

async function applyTheme() {
  const { theme = 'auto' } = await chrome.storage.local.get('theme');
  if (theme !== 'auto') document.documentElement.dataset.theme = theme;
}

await initI18n();
applyI18n();
await applyTheme();
document.title = t('appName');
// The shortcut only helps if people know it exists.
el('copy').title = `${t('action_copy')} (${/Mac/.test(navigator.platform) ? '⌘C' : 'Ctrl+C'})`;

const { lastCapture } = await chrome.storage.session.get('lastCapture');
if (!lastCapture) {
  flash(t('err_generic'), true);
} else {
  originalBase = new Image();
  await new Promise((resolve, reject) => {
    originalBase.onload = resolve;
    originalBase.onerror = reject;
    originalBase.src = lastCapture.dataUrl;
  });

  setCrop({ x: 0, y: 0, w: originalBase.naturalWidth, h: originalBase.naturalHeight });
  document.title = lastCapture.title || t('editor_untitled');

  pushHistory();
  setZoom(fitZoom(), true);
}

window.addEventListener('resize', () => {
  if (state.fitted) setZoom(fitZoom(), true);
});
