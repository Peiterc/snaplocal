/**
 * Shape model and rendering.
 *
 * Every shape is a bounding box plus geometry expressed as fractions of that
 * box. Storing points as fractions rather than absolute coordinates is what
 * lets move and resize work identically for a rectangle, an arrow and a
 * freehand scribble, without a special case per tool.
 */

export const FONT_STACK = '"Segoe UI", system-ui, -apple-system, sans-serif';

/** Tools that are drawn by dragging out a region. */
export const REGION_TOOLS = ['blur', 'redact', 'rect', 'ellipse', 'highlight'];
/** Tools drawn as a stroke from one point to another. */
export const VECTOR_TOOLS = ['line', 'arrow'];

export const norm = (s) => ({
  x: Math.min(s.x, s.x + s.w),
  y: Math.min(s.y, s.y + s.h),
  w: Math.abs(s.w),
  h: Math.abs(s.h)
});

/* ---------------- obscuring tools ---------------- */

let scratchCanvas = document.createElement('canvas');

function scratch(w, h) {
  scratchCanvas.width = w;
  scratchCanvas.height = h;
  const ctx = scratchCanvas.getContext('2d');
  ctx.filter = 'none';
  ctx.imageSmoothingEnabled = true;
  return ctx;
}

/**
 * Both obscuring tools sample the canvas as composited so far, not the
 * untouched capture, so stacking two regions behaves the way the eye expects.
 */
function paintBlur(ctx, canvas, x, y, w, h, strength) {
  const radius = strength / 2;
  const pad = Math.ceil(radius * 3);
  const sx = Math.max(0, Math.floor(x - pad));
  const sy = Math.max(0, Math.floor(y - pad));
  const sw = Math.min(canvas.width, Math.ceil(x + w + pad)) - sx;
  const sh = Math.min(canvas.height, Math.ceil(y + h + pad)) - sy;
  if (sw <= 0 || sh <= 0) return;

  // Blurring a padded slab and drawing only its middle keeps the region edges
  // from bleeding towards transparent.
  const sctx = scratch(sw, sh);
  sctx.filter = `blur(${radius}px)`;
  sctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
  ctx.drawImage(scratchCanvas, x - sx, y - sy, w, h, x, y, w, h);
}

function paintPixelate(ctx, canvas, x, y, w, h, strength) {
  const block = Math.max(3, Math.round(strength / 2));
  const cw = Math.max(1, Math.round(w / block));
  const ch = Math.max(1, Math.round(h / block));

  scratch(cw, ch).drawImage(canvas, x, y, w, h, 0, 0, cw, ch);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(scratchCanvas, 0, 0, cw, ch, x, y, w, h);
  ctx.restore();
}

/* ---------------- annotation tools ---------------- */

function strokeStyle(ctx, shape) {
  ctx.strokeStyle = shape.color;
  ctx.fillStyle = shape.color;
  ctx.lineWidth = shape.stroke;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

function drawArrowHead(ctx, fromX, fromY, toX, toY, stroke) {
  const size = Math.max(9, stroke * 3.2);
  const angle = Math.atan2(toY - fromY, toX - fromX);
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - size * Math.cos(angle - Math.PI / 7), toY - size * Math.sin(angle - Math.PI / 7));
  ctx.lineTo(toX - size * Math.cos(angle + Math.PI / 7), toY - size * Math.sin(angle + Math.PI / 7));
  ctx.closePath();
  ctx.fill();
}

/** Freehand points are smoothed through the midpoints so the line reads as a
 *  curve instead of a chain of visible segments. */
function drawPen(ctx, box, points) {
  if (points.length < 2) return;
  const at = (p) => [box.x + p[0] * box.w, box.y + p[1] * box.h];
  ctx.beginPath();
  ctx.moveTo(...at(points[0]));
  for (let i = 1; i < points.length - 1; i++) {
    const [cx, cy] = at(points[i]);
    const [nx, ny] = at(points[i + 1]);
    ctx.quadraticCurveTo(cx, cy, (cx + nx) / 2, (cy + ny) / 2);
  }
  ctx.lineTo(...at(points[points.length - 1]));
  ctx.stroke();
}

export function textLines(shape) {
  return String(shape.text ?? '').split('\n');
}

export function textFont(shape) {
  return `${shape.italic ? 'italic ' : ''}${shape.bold ? '700 ' : '400 '}${shape.size}px ${FONT_STACK}`;
}

/** Text has no stored width: it is measured, so editing the string or the font
 *  size keeps the box correct without a reflow pass. */
export function measureText(ctx, shape) {
  ctx.save();
  ctx.font = textFont(shape);
  const lines = textLines(shape);
  const w = Math.max(1, ...lines.map((line) => ctx.measureText(line).width));
  ctx.restore();
  return { x: shape.x, y: shape.y, w, h: lines.length * shape.size * 1.25 };
}

function drawText(ctx, shape) {
  const lines = textLines(shape);
  ctx.save();
  ctx.font = textFont(shape);
  ctx.textBaseline = 'top';
  ctx.fillStyle = shape.color;
  lines.forEach((line, i) => {
    const y = shape.y + i * shape.size * 1.25;
    if (shape.outline) {
      // A contrasting halo keeps the label readable over both a white document
      // and a dark screenshot, which is the whole point of annotating.
      ctx.lineWidth = Math.max(2, shape.size / 7);
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(255,255,255,.92)';
      ctx.strokeText(line, shape.x, y);
    }
    ctx.fillText(line, shape.x, y);
  });
  ctx.restore();
}

/* ---------------- dispatch ---------------- */

export function drawShape(ctx, canvas, shape) {
  if (shape.type === 'text') {
    if (String(shape.text ?? '').trim()) drawText(ctx, shape);
    return;
  }

  const { x, y, w, h } = norm(shape);
  if (w < 1 && h < 1) return;

  switch (shape.type) {
    case 'redact':
      ctx.save();
      ctx.fillStyle = '#0f1115';
      ctx.fillRect(x, y, w, h);
      ctx.restore();
      return;

    case 'blur':
      if (shape.mode === 'pixelate') paintPixelate(ctx, canvas, x, y, w, h, shape.strength);
      else paintBlur(ctx, canvas, x, y, w, h, shape.strength);
      return;

    case 'highlight':
      ctx.save();
      // Multiply keeps the underlying text visible through the ink, the way a
      // real highlighter behaves; plain alpha would wash it out instead.
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = shape.color;
      ctx.fillRect(x, y, w, h);
      ctx.restore();
      return;
  }

  ctx.save();
  strokeStyle(ctx, shape);

  switch (shape.type) {
    case 'rect':
      if (shape.fill) ctx.fillRect(x, y, w, h);
      else ctx.strokeRect(x + shape.stroke / 2, y + shape.stroke / 2,
                          Math.max(0, w - shape.stroke), Math.max(0, h - shape.stroke));
      break;

    case 'ellipse':
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h / 2,
                  Math.max(0, w / 2 - shape.stroke / 2), Math.max(0, h / 2 - shape.stroke / 2),
                  0, 0, Math.PI * 2);
      if (shape.fill) ctx.fill(); else ctx.stroke();
      break;

    case 'line':
    case 'arrow': {
      const box = { x, y, w, h };
      const ax = box.x + shape.a[0] * box.w;
      const ay = box.y + shape.a[1] * box.h;
      const bx = box.x + shape.b[0] * box.w;
      const by = box.y + shape.b[1] * box.h;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      if (shape.type === 'arrow') drawArrowHead(ctx, ax, ay, bx, by, shape.stroke);
      break;
    }

    case 'pen':
      drawPen(ctx, { x, y, w, h }, shape.pts);
      break;
  }
  ctx.restore();
}

/** Bounding box used for selection, handles and hit testing. */
export function boxOf(ctx, shape) {
  return shape.type === 'text' ? measureText(ctx, shape) : norm(shape);
}
