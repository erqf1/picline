// Pinselstriche: Pinsel (rund, Marker, Kalligrafie, Spray, Bleistift), Pixelstift und Radierer.
// Ein Strich wird zuerst auf eine eigene Maske gemalt und erst mit seiner Deckkraft über die Ebene gelegt - so werden
// sich überlappende Tupfer nicht dunkler. Spiegelmalen setzt jeden Tupfer gespiegelt noch einmal.
import { makeCanvas, cloneCanvas, selectionPath } from './doc.js';

const SPACING = { round: 0.1, marker: 0.05, calli: 0.03, spray: 0.35, pencil: 0.12 };

/** Pinselspitze (weiche oder harte Kante) in Hauptfarbe, ohne Deckkraft */
function makeStamp(style, size, hardness, color) {
  const d = Math.max(1, Math.ceil(size));
  const pad = 2;
  const c = makeCanvas(d + pad * 2, d + pad * 2);
  const g = c.getContext('2d');
  const r = size / 2;
  const cx = c.width / 2;
  const rgb = `rgb(${color.r},${color.g},${color.b})`;
  if (style === 'marker' || style === 'calli') {
    g.translate(cx, cx);
    if (style === 'calli') g.rotate(-Math.PI / 4);
    g.fillStyle = rgb;
    g.beginPath();
    const rx = style === 'calli' ? Math.max(0.6, r * 0.14) : Math.max(0.8, r * 0.36);
    g.ellipse(0, 0, rx, r, 0, 0, Math.PI * 2);
    g.fill();
    return c;
  }
  const hard = style === 'pencil' ? 1 : hardness;
  if (hard >= 0.99 || r < 1.5) {
    g.fillStyle = rgb;
    g.beginPath();
    g.arc(cx, cx, r, 0, Math.PI * 2);
    g.fill();
    return c;
  }
  const grad = g.createRadialGradient(cx, cx, 0, cx, cx, r);
  grad.addColorStop(0, rgb);
  grad.addColorStop(Math.max(0.01, hard), rgb);
  grad.addColorStop(1, `rgba(${color.r},${color.g},${color.b},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

/** Pixelstift: scharfe Spitze aus ganzen Pixeln (eckig oder rund) */
function pixelStamp(size, round, color) {
  const s = Math.max(1, Math.round(size));
  const c = makeCanvas(s, s);
  const g = c.getContext('2d');
  const img = g.createImageData(s, s);
  const r = s / 2;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const dx = x + 0.5 - r;
      const dy = y + 0.5 - r;
      if (round && s > 2 && dx * dx + dy * dy > r * r + 0.2) continue;
      const i = (y * s + x) * 4;
      img.data[i] = color.r;
      img.data[i + 1] = color.g;
      img.data[i + 2] = color.b;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

export class Stroke {
  /**
   * o: { kind: 'brush'|'pixel'|'erase', style, size, opacity (0..1), hardness (0..1), color {r,g,b,a},
   *      pressure, mirror: 'none'|'x'|'y'|'xy', pixelErase, round (Pixelstift rund), perfect (Pixel-perfekt) }
   */
  constructor(doc, o) {
    this.doc = doc;
    this.layer = doc.layer;
    this.o = o;
    this.erase = o.kind === 'erase';
    this.pixel = o.kind === 'pixel' || (this.erase && o.pixelErase);
    this.style = this.pixel ? 'pixel' : this.erase ? 'round' : o.style || 'round';
    this.alpha = Math.max(0, Math.min(1, o.opacity * (this.erase ? 1 : o.color.a / 255)));
    this.token = doc.beginPixels(this.layer);
    this.mask = makeCanvas(doc.w, doc.h);
    this.mg = this.mask.getContext('2d');
    this.preview = cloneCanvas(this.token.before);
    this.pg = this.preview.getContext('2d');
    this.layer.preview = this.preview;
    this.dirty = null;
    this.last = null;
    this.rest = 0;
    this.placed = []; // Pixel-perfekt: zuletzt gesetzte Pixel
    const color = this.erase ? { r: 0, g: 0, b: 0, a: 255 } : o.color;
    if (this.pixel) {
      this.psize = Math.max(1, Math.round(o.size));
      this.stamp = pixelStamp(this.psize, o.round, color);
    } else {
      this.stamp = makeStamp(this.style, o.size, o.hardness ?? 1, color);
      this.color = color;
    }
  }

  // ---------------------------------------------------------------- Tupfer setzen
  mirrors(x, y, w = 0) {
    const out = [[x, y]];
    const m = this.o.mirror || 'none';
    const W = this.doc.w;
    const H = this.doc.h;
    // w = Breite der Pixel-Spitze: dann wird die linke obere Ecke gespiegelt
    if (m === 'x' || m === 'xy') out.push([W - x - w, y]);
    if (m === 'y' || m === 'xy') out.push([x, H - y - w]);
    if (m === 'xy') out.push([W - x - w, H - y - w]);
    return out;
  }
  grow(x, y, w, h) {
    const r = { x: Math.floor(x) - 1, y: Math.floor(y) - 1, w: Math.ceil(w) + 3, h: Math.ceil(h) + 3 };
    this.seg = this.seg ? union(this.seg, r) : r;
  }
  dab(x, y, pressure) {
    const g = this.mg;
    let size = this.o.size;
    if (this.o.pressure && pressure != null) size *= Math.max(0.15, pressure);
    if (this.style === 'spray') {
      const r = size / 2;
      const n = Math.max(3, Math.round(size * 0.5));
      const dot = Math.max(0.6, size / 45);
      g.fillStyle = `rgb(${this.color.r},${this.color.g},${this.color.b})`;
      for (const [mx, my] of this.mirrors(x, y)) {
        g.beginPath();
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2;
          const d = Math.sqrt(Math.random()) * r;
          g.moveTo(mx + Math.cos(a) * d + dot, my + Math.sin(a) * d);
          g.arc(mx + Math.cos(a) * d, my + Math.sin(a) * d, dot, 0, Math.PI * 2);
        }
        g.fill();
        this.grow(mx - r - dot, my - r - dot, size + dot * 2, size + dot * 2);
      }
      return;
    }
    const s = this.stamp;
    const k = size / this.o.size;
    const sw = s.width * k;
    if (this.style === 'pencil') g.globalAlpha = 0.55 + Math.random() * 0.45;
    for (const [mx, my] of this.mirrors(x, y)) {
      g.drawImage(s, mx - sw / 2, my - sw / 2, sw, sw);
      this.grow(mx - sw / 2, my - sw / 2, sw, sw);
    }
    g.globalAlpha = 1;
  }
  pixelDab(px, py) {
    const s = this.psize;
    const o = Math.floor((s - 1) / 2);
    const sx = px - o;
    const sy = py - o;
    for (const [mx, my] of this.mirrors(sx, sy, s)) {
      this.mg.drawImage(this.stamp, mx, my);
      this.grow(mx, my, s, s);
    }
    // Pixel-perfekt (nur 1 px): Treppenecken in Linien weglassen
    if (this.o.perfect && s === 1 && this.o.kind === 'pixel') {
      const pts = this.placed;
      if (pts.length && pts[pts.length - 1][0] === px && pts[pts.length - 1][1] === py) return;
      pts.push([px, py]);
      if (pts.length >= 3) {
        const [a, b, c] = pts.slice(-3);
        const diag = Math.abs(a[0] - c[0]) === 1 && Math.abs(a[1] - c[1]) === 1;
        const corner = (b[0] === a[0] && b[1] === c[1]) || (b[1] === a[1] && b[0] === c[0]);
        if (diag && corner) {
          for (const [mx, my] of this.mirrors(b[0], b[1], 1)) this.mg.clearRect(mx, my, 1, 1);
          pts.splice(pts.length - 2, 1);
        }
      }
    }
  }

  // ---------------------------------------------------------------- Strich
  start(p) {
    this.seg = null;
    if (this.pixel) {
      const px = Math.floor(p.x);
      const py = Math.floor(p.y);
      this.pixelDab(px, py);
      this.last = { x: px, y: py };
    } else {
      this.dab(p.x, p.y, p.pressure);
      this.last = { x: p.x, y: p.y };
    }
    this.flush();
  }
  to(p) {
    if (!this.last) return this.start(p);
    this.seg = null;
    if (this.pixel) {
      // Bresenham: jede Zwischenzelle genau einmal
      let x0 = this.last.x;
      let y0 = this.last.y;
      const x1 = Math.floor(p.x);
      const y1 = Math.floor(p.y);
      const dx = Math.abs(x1 - x0);
      const dy = -Math.abs(y1 - y0);
      const sx = x0 < x1 ? 1 : -1;
      const sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      while (x0 !== x1 || y0 !== y1) {
        const e2 = 2 * err;
        if (e2 >= dy) {
          err += dy;
          x0 += sx;
        }
        if (e2 <= dx) {
          err += dx;
          y0 += sy;
        }
        this.pixelDab(x0, y0);
      }
      this.last = { x: x1, y: y1 };
    } else {
      const step = Math.max(0.5, this.o.size * (SPACING[this.style] || 0.1));
      const dx = p.x - this.last.x;
      const dy = p.y - this.last.y;
      const dist = Math.hypot(dx, dy);
      let t = step - this.rest;
      while (t <= dist) {
        this.dab(this.last.x + (dx * t) / dist, this.last.y + (dy * t) / dist, p.pressure);
        t += step;
      }
      this.rest = dist - (t - step);
      this.last = { x: p.x, y: p.y };
    }
    this.flush();
  }
  /** neu bemalten Bereich in die Vorschau der Ebene übernehmen */
  flush() {
    const r = this.seg;
    if (!r) return;
    const x = Math.max(0, r.x);
    const y = Math.max(0, r.y);
    const w = Math.min(this.doc.w, r.x + r.w) - x;
    const h = Math.min(this.doc.h, r.y + r.h) - y;
    if (w <= 0 || h <= 0) return;
    const g = this.pg;
    g.save();
    g.clearRect(x, y, w, h);
    g.drawImage(this.token.before, x, y, w, h, x, y, w, h);
    g.beginPath();
    g.rect(x, y, w, h);
    g.clip();
    if (this.doc.selection) {
      selectionPath(g, this.doc.selection);
      g.clip();
    }
    g.globalAlpha = this.alpha;
    g.globalCompositeOperation = this.erase ? 'destination-out' : 'source-over';
    g.drawImage(this.mask, x, y, w, h, x, y, w, h);
    g.restore();
    this.dirty = union(this.dirty, { x, y, w, h });
    this.doc.compDirty = true;
  }
  end(label) {
    const layer = this.layer;
    if (this.dirty) {
      const { x, y, w, h } = this.dirty;
      layer.ctx.clearRect(x, y, w, h);
      layer.ctx.drawImage(this.preview, x, y, w, h, x, y, w, h);
    }
    layer.preview = null;
    this.doc.commitPixels(this.token, this.dirty, label);
    this.doc.compDirty = true;
  }
  cancel() {
    this.layer.preview = null;
    this.doc.compDirty = true;
  }
}

function union(a, b) {
  if (!a) return b;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

/**
 * Füllen (Farbeimer): Fläche gleicher Farbe (mit Toleranz) ersetzen. sample = Canvas, aus dem die Farben gelesen
 * werden (Ebene oder ganzes Bild). Liefert das Rechteck der Änderung oder null.
 */
export function floodFill(doc, layer, sample, x, y, color, { tolerance = 0, contiguous = true } = {}) {
  const W = doc.w;
  const H = doc.h;
  x = Math.floor(x);
  y = Math.floor(y);
  if (x < 0 || y < 0 || x >= W || y >= H) return null;
  const src = new Uint32Array(sample.getContext('2d').getImageData(0, 0, W, H).data.buffer);
  const start = src[y * W + x];
  const tol = Math.round(tolerance * 2.55);
  const sr = start & 255;
  const sg = (start >>> 8) & 255;
  const sb = (start >>> 16) & 255;
  const sa = start >>> 24;
  const match = (v) => {
    if (v === start) return true;
    if (!tol) return false;
    const a = v >>> 24;
    // ganz durchsichtige Pixel: nur die Deckkraft zählt
    if (!a && !sa) return true;
    return Math.abs((v & 255) - sr) <= tol && Math.abs(((v >>> 8) & 255) - sg) <= tol && Math.abs(((v >>> 16) & 255) - sb) <= tol && Math.abs(a - sa) <= tol;
  };
  const mask = new Uint8Array(W * H);
  const sel = doc.selection;
  const inSel = sel ? selectionMask(sel, W, H) : null;
  if (inSel && !inSel[y * W + x]) return null;
  let x0 = x, y0 = y, x1 = x, y1 = y;
  if (contiguous) {
    const stack = [x, y];
    while (stack.length) {
      const py = stack.pop();
      let px = stack.pop();
      let i = py * W + px;
      while (px >= 0 && !mask[i] && match(src[i]) && (!inSel || inSel[i])) {
        px--;
        i--;
      }
      px++;
      i++;
      let up = false;
      let down = false;
      while (px < W && !mask[i] && match(src[i]) && (!inSel || inSel[i])) {
        mask[i] = 1;
        if (px < x0) x0 = px;
        if (px > x1) x1 = px;
        if (py < y0) y0 = py;
        if (py > y1) y1 = py;
        if (py > 0) {
          const j = i - W;
          const ok = !mask[j] && match(src[j]) && (!inSel || inSel[j]);
          if (ok && !up) {
            stack.push(px, py - 1);
            up = true;
          } else if (!ok) up = false;
        }
        if (py < H - 1) {
          const j = i + W;
          const ok = !mask[j] && match(src[j]) && (!inSel || inSel[j]);
          if (ok && !down) {
            stack.push(px, py + 1);
            down = true;
          } else if (!ok) down = false;
        }
        px++;
        i++;
      }
    }
  } else {
    x0 = W;
    y0 = H;
    x1 = -1;
    y1 = -1;
    for (let i = 0; i < W * H; i++) {
      if ((!inSel || inSel[i]) && match(src[i])) {
        mask[i] = 1;
        const px = i % W;
        const py = (i / W) | 0;
        if (px < x0) x0 = px;
        if (px > x1) x1 = px;
        if (py < y0) y0 = py;
        if (py > y1) y1 = py;
      }
    }
    if (x1 < 0) return null;
  }
  const rw = x1 - x0 + 1;
  const rh = y1 - y0 + 1;
  const img = layer.ctx.getImageData(x0, y0, rw, rh);
  const out = new Uint32Array(img.data.buffer);
  const val = (color.a << 24) | (color.b << 16) | (color.g << 8) | color.r;
  for (let yy = 0; yy < rh; yy++) {
    const row = (y0 + yy) * W + x0;
    for (let xx = 0; xx < rw; xx++) if (mask[row + xx]) out[yy * rw + xx] = val >>> 0;
  }
  layer.ctx.putImageData(img, x0, y0);
  return { x: x0, y: y0, w: rw, h: rh };
}

/** Auswahl als Pixel-Maske (1 = drin) */
export function selectionMask(sel, W, H) {
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  selectionPath(g, sel);
  g.fill();
  const d = g.getImageData(0, 0, W, H).data;
  const m = new Uint8Array(W * H);
  for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3] >= 128 ? 1 : 0;
  return m;
}
