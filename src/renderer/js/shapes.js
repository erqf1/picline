// Formen (Linie, Pfeil, Rechteck, Ellipse, Stern ...) und Text als Bild. "Pixel-genau" zeichnet ohne Kantenglättung:
// erst normal, dann jede Kante hart auf voll/leer gesetzt - so bleiben Pixel-Grafiken sauber.
import { makeCanvas } from './doc.js';
import { rgba } from './color.js';

export const SHAPES = ['line', 'arrow', 'rect', 'roundrect', 'ellipse', 'triangle', 'star', 'hexagon', 'heart', 'bubble'];

/** a, b = Startpunkt und aktueller Punkt (Bild-Pixel). shift = Quadrat/Kreis bzw. Linie in 45°-Schritten. */
export function shapeBox(type, a, b, shift) {
  let { x: x0, y: y0 } = a;
  let { x: x1, y: y1 } = b;
  if (shift) {
    if (type === 'line' || type === 'arrow') {
      const ang = Math.round(Math.atan2(y1 - y0, x1 - x0) / (Math.PI / 4)) * (Math.PI / 4);
      const len = Math.hypot(x1 - x0, y1 - y0);
      x1 = x0 + Math.cos(ang) * len;
      y1 = y0 + Math.sin(ang) * len;
    } else {
      const s = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      x1 = x0 + Math.sign(x1 - x0 || 1) * s;
      y1 = y0 + Math.sign(y1 - y0 || 1) * s;
    }
  }
  return { x0, y0, x1, y1 };
}

function path(g, type, box, o) {
  const { x0, y0, x1, y1 } = box;
  const x = Math.min(x0, x1);
  const y = Math.min(y0, y1);
  const w = Math.abs(x1 - x0);
  const h = Math.abs(y1 - y0);
  const cx = x + w / 2;
  const cy = y + h / 2;
  g.beginPath();
  switch (type) {
    case 'line':
    case 'arrow':
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      break;
    case 'rect':
      g.rect(x, y, w, h);
      break;
    case 'roundrect': {
      const r = Math.min(o.radius ?? Math.min(w, h) * 0.2, w / 2, h / 2);
      g.roundRect(x, y, w, h, r);
      break;
    }
    case 'ellipse':
      g.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
      break;
    case 'triangle':
      g.moveTo(cx, y);
      g.lineTo(x + w, y + h);
      g.lineTo(x, y + h);
      g.closePath();
      break;
    case 'star': {
      const n = Math.max(3, o.points || 5);
      const inner = o.inner ?? 0.45;
      for (let i = 0; i < n * 2; i++) {
        const ang = -Math.PI / 2 + (i * Math.PI) / n;
        const k = i % 2 ? inner : 1;
        const px = cx + Math.cos(ang) * (w / 2) * k;
        const py = cy + Math.sin(ang) * (h / 2) * k;
        if (i) g.lineTo(px, py);
        else g.moveTo(px, py);
      }
      g.closePath();
      break;
    }
    case 'hexagon':
      for (let i = 0; i < 6; i++) {
        const ang = -Math.PI / 2 + (i * Math.PI) / 3;
        const px = cx + Math.cos(ang) * (w / 2);
        const py = cy + Math.sin(ang) * (h / 2);
        if (i) g.lineTo(px, py);
        else g.moveTo(px, py);
      }
      g.closePath();
      break;
    case 'heart': {
      const u = (px, py) => [x + px * w, y + py * h];
      g.moveTo(...u(0.5, 0.25));
      g.bezierCurveTo(...u(0.5, 0.05), ...u(0.0, 0.0), ...u(0.0, 0.32));
      g.bezierCurveTo(...u(0.0, 0.6), ...u(0.35, 0.78), ...u(0.5, 1));
      g.bezierCurveTo(...u(0.65, 0.78), ...u(1, 0.6), ...u(1, 0.32));
      g.bezierCurveTo(...u(1, 0.0), ...u(0.5, 0.05), ...u(0.5, 0.25));
      g.closePath();
      break;
    }
    case 'bubble': {
      const bh = h * 0.78;
      const r = Math.min(w, bh) * 0.18;
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + bh, r);
      g.arcTo(x + w, y + bh, x, y + bh, r);
      g.lineTo(x + w * 0.36, y + bh);
      g.lineTo(x + w * 0.18, y + h);
      g.lineTo(x + w * 0.22, y + bh);
      g.arcTo(x, y + bh, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
      break;
    }
  }
}

/** Kanten hart machen: Deckkraft >= Schwelle -> voll, sonst leer */
export function binarize(canvas, alpha = 255) {
  const g = canvas.getContext('2d');
  const img = g.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] >= 128 ? alpha : 0;
  g.putImageData(img, 0, 0);
  return canvas;
}

/**
 * Form auf ein eigenes Canvas zeichnen (so groß wie nötig). Liefert { canvas, x, y } (Lage im Bild) oder null.
 * o: { width, stroke (bool), fill: 'none'|'primary'|'secondary', primary, secondary, pixel, radius, points }
 */
export function renderShape(type, box, o) {
  const lw = o.stroke || type === 'line' || type === 'arrow' ? Math.max(1, o.width) : 0;
  const head = type === 'arrow' ? Math.max(8, lw * 3.2) : 0;
  const m = Math.ceil(lw + head + 4);
  const bx = Math.floor(Math.min(box.x0, box.x1)) - m;
  const by = Math.floor(Math.min(box.y0, box.y1)) - m;
  const bw = Math.ceil(Math.abs(box.x1 - box.x0)) + m * 2 + 1;
  const bh = Math.ceil(Math.abs(box.y1 - box.y0)) + m * 2 + 1;
  if (bw > 30000 || bh > 30000) return null;
  const c = makeCanvas(bw, bh);
  const g = c.getContext('2d');
  g.translate(-bx, -by);
  let b = box;
  if (o.pixel) {
    // auf Pixelmitten legen, damit 1-px-Linien genau eine Pixelreihe treffen
    const s = (v) => Math.floor(v) + (lw % 2 ? 0.5 : 0);
    b = { x0: s(box.x0), y0: s(box.y0), x1: s(box.x1), y1: s(box.y1) };
  }
  const isLine = type === 'line' || type === 'arrow';
  g.lineJoin = type === 'rect' && o.pixel ? 'miter' : 'round';
  g.lineCap = 'round';
  if (!isLine && o.fill && o.fill !== 'none') {
    path(g, type, b, o);
    g.fillStyle = rgba(o.fill === 'primary' ? o.primary : o.secondary);
    g.fill();
  }
  if (lw) {
    let end = { x: b.x1, y: b.y1 };
    if (type === 'arrow') {
      // Linie etwas vor der Spitze enden lassen, damit die Spitze sauber bleibt
      const ang = Math.atan2(b.y1 - b.y0, b.x1 - b.x0);
      end = { x: b.x1 - Math.cos(ang) * head * 0.6, y: b.y1 - Math.sin(ang) * head * 0.6 };
      path(g, 'line', { ...b, x1: end.x, y1: end.y }, o);
    } else path(g, type, b, o);
    g.lineWidth = lw;
    g.strokeStyle = rgba(o.primary);
    g.stroke();
    if (type === 'arrow') {
      const ang = Math.atan2(b.y1 - b.y0, b.x1 - b.x0);
      g.beginPath();
      g.moveTo(b.x1, b.y1);
      g.lineTo(b.x1 - Math.cos(ang - 0.45) * head, b.y1 - Math.sin(ang - 0.45) * head);
      g.lineTo(b.x1 - Math.cos(ang + 0.45) * head, b.y1 - Math.sin(ang + 0.45) * head);
      g.closePath();
      g.fillStyle = rgba(o.primary);
      g.fill();
    }
  }
  if (o.pixel) binarize(c, Math.max(o.primary.a, o.fill === 'secondary' ? o.secondary.a : 0) || 255);
  return { canvas: c, x: bx, y: by };
}

/**
 * Text als Bild: o = { text, font, size, bold, italic, underline, align, color, bg (Farbe oder null), pixel }
 * Liefert { canvas, w, h } - Lage bestimmt der Aufrufer.
 */
export function renderText(o) {
  const lines = String(o.text).split('\n');
  const font = `${o.italic ? 'italic ' : ''}${o.bold ? 'bold ' : ''}${o.size}px ${fontFamily(o.font)}`;
  const mg = makeCanvas(1, 1).getContext('2d');
  mg.font = font;
  const lh = Math.round(o.size * 1.25);
  const widths = lines.map((l) => mg.measureText(l).width);
  const pad = Math.ceil(o.size * 0.15);
  const w = Math.max(1, Math.ceil(Math.max(...widths, o.size * 0.5)) + pad * 2);
  const h = Math.max(1, lh * lines.length + pad);
  const c = makeCanvas(w, h);
  const g = c.getContext('2d');
  if (o.bg) {
    g.fillStyle = rgba(o.bg);
    g.fillRect(0, 0, w, h);
  }
  g.font = font;
  g.textBaseline = 'top';
  g.fillStyle = rgba(o.color);
  lines.forEach((line, i) => {
    const lw = widths[i];
    const x = o.align === 'center' ? (w - lw) / 2 : o.align === 'right' ? w - pad - lw : pad;
    const y = i * lh + Math.round((lh - o.size) / 2);
    g.fillText(line, x, y);
    if (o.underline && line) g.fillRect(x, y + o.size * 1.02, lw, Math.max(1, Math.round(o.size / 14)));
  });
  if (o.pixel) {
    // nur den Text hart machen, nicht den Hintergrund
    if (o.bg) {
      const t = makeCanvas(w, h);
      const tg = t.getContext('2d');
      tg.font = font;
      tg.textBaseline = 'top';
      tg.fillStyle = rgba(o.color);
      lines.forEach((line, i) => {
        const lw = widths[i];
        const x = o.align === 'center' ? (w - lw) / 2 : o.align === 'right' ? w - pad - lw : pad;
        tg.fillText(line, x, i * lh + Math.round((lh - o.size) / 2));
      });
      binarize(t, o.color.a);
      g.clearRect(0, 0, w, h);
      g.fillStyle = rgba(o.bg);
      g.fillRect(0, 0, w, h);
      g.drawImage(t, 0, 0);
    } else binarize(c, o.color.a);
  }
  return { canvas: c, w, h, pad };
}

export const FONTS = ['Segoe UI', 'Arial', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Georgia', 'Times New Roman', 'Garamond', 'Courier New', 'Consolas', 'Comic Sans MS', 'Impact', 'Brush Script MT', 'system-ui', 'serif', 'monospace'];
export function fontFamily(f) {
  return ['system-ui', 'serif', 'sans-serif', 'monospace', 'cursive'].includes(f) ? f : `"${f}", sans-serif`;
}
