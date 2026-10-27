// "Schwebendes" Bild: eingefügtes Bild, verschobene Auswahl oder ganze Ebene. Lässt sich verschieben, an den
// Griffen vergrößern/verkleinern (Shift = Seitenverhältnis frei) und am runden Griff drehen (Shift = 15°-Schritte).
// Erst mit apply() landet es in der Ebene.
import { makeCanvas } from './doc.js';

const HANDLE = 5; // halbe Griffgröße in Bildschirm-Pixeln

export class Floating {
  /** canvas: Inhalt; x/y: Lage im Bild; layer: Ziel; token: Verlauf (Pixel vor dem Herausheben); newLayer: als neue Ebene */
  constructor({ canvas, x, y, layer, token = null, newLayer = false, label }) {
    this.canvas = canvas;
    this.x = x;
    this.y = y;
    this.w = canvas.width;
    this.h = canvas.height;
    this.angle = 0;
    this.layer = layer;
    this.token = token;
    this.newLayer = newLayer;
    this.label = label;
    this.smooth = true; // beim Skalieren glätten (aus = scharfe Pixel)
    this.drag = null;
  }
  get cx() {
    return this.x + this.w / 2;
  }
  get cy() {
    return this.y + this.h / 2;
  }
  /** Bildpunkt in das (ungedrehte) Koordinatensystem des Objekts */
  local(p) {
    const c = Math.cos(-this.angle);
    const s = Math.sin(-this.angle);
    const dx = p.x - this.cx;
    const dy = p.y - this.cy;
    return { x: this.cx + dx * c - dy * s, y: this.cy + dx * s + dy * c };
  }
  corners() {
    const c = Math.cos(this.angle);
    const s = Math.sin(this.angle);
    const pts = [[this.x, this.y], [this.x + this.w, this.y], [this.x + this.w, this.y + this.h], [this.x, this.y + this.h]];
    return pts.map(([px, py]) => {
      const dx = px - this.cx;
      const dy = py - this.cy;
      return { x: this.cx + dx * c - dy * s, y: this.cy + dx * s + dy * c };
    });
  }
  handles(view) {
    // 8 Griffe am Rand (in lokalen Koordinaten) + Drehgriff über der Mitte oben
    const list = [];
    const xs = [this.x, this.x + this.w / 2, this.x + this.w];
    const ys = [this.y, this.y + this.h / 2, this.y + this.h];
    const names = [['nw', 'n', 'ne'], ['w', null, 'e'], ['sw', 's', 'se']];
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) if (names[j][i]) list.push({ id: names[j][i], x: xs[i], y: ys[j] });
    list.push({ id: 'rot', x: this.cx, y: this.y - 26 / view.zoom });
    const c = Math.cos(this.angle);
    const s = Math.sin(this.angle);
    return list.map((hd) => {
      const dx = hd.x - this.cx;
      const dy = hd.y - this.cy;
      return { ...hd, x: this.cx + dx * c - dy * s, y: this.cy + dx * s + dy * c };
    });
  }
  /** Was liegt unter dem Punkt: Griff-Name, 'move' oder null */
  hit(p, view) {
    const r = (HANDLE + 3) / view.zoom;
    for (const hd of this.handles(view)) if (Math.abs(p.x - hd.x) <= r && Math.abs(p.y - hd.y) <= r) return hd.id;
    const l = this.local(p);
    return l.x >= this.x && l.y >= this.y && l.x <= this.x + this.w && l.y <= this.y + this.h ? 'move' : null;
  }
  cursorFor(id) {
    if (id === 'move') return 'move';
    if (id === 'rot') return 'grab';
    const dirs = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
    const base = dirs.indexOf(id);
    const step = Math.round((this.angle / (Math.PI * 2)) * 8);
    const d = dirs[(((base + step) % 8) + 8) % 8];
    return { n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize' }[d];
  }
  begin(id, p) {
    this.drag = { id, p0: p, x: this.x, y: this.y, w: this.w, h: this.h, angle: this.angle };
  }
  move(p, shift, pixel) {
    const d = this.drag;
    if (!d) return;
    if (d.id === 'move') {
      this.x = d.x + (p.x - d.p0.x);
      this.y = d.y + (p.y - d.p0.y);
      if (pixel) {
        this.x = Math.round(this.x);
        this.y = Math.round(this.y);
      }
      return;
    }
    if (d.id === 'rot') {
      const a0 = Math.atan2(d.p0.y - this.cy, d.p0.x - this.cx);
      const a1 = Math.atan2(p.y - this.cy, p.x - this.cx);
      let a = d.angle + a1 - a0;
      const step = shift ? Math.PI / 12 : Math.PI / 180;
      a = Math.round(a / step) * step;
      this.angle = a;
      return;
    }
    // Größe: in lokalen Koordinaten des Objekts rechnen, gegenüberliegende Seite bleibt stehen
    const c = Math.cos(-d.angle);
    const s = Math.sin(-d.angle);
    const vx = p.x - d.p0.x;
    const vy = p.y - d.p0.y;
    const lx = vx * c - vy * s;
    const ly = vx * s + vy * c;
    let x0 = d.x;
    let y0 = d.y;
    let x1 = d.x + d.w;
    let y1 = d.y + d.h;
    if (d.id.includes('w')) x0 += lx;
    if (d.id.includes('e')) x1 += lx;
    if (d.id.includes('n')) y0 += ly;
    if (d.id.includes('s')) y1 += ly;
    let w = Math.max(1, x1 - x0);
    let h = Math.max(1, y1 - y0);
    // Ecken: Seitenverhältnis halten (Shift = frei)
    if (d.id.length === 2 && !shift) {
      const k = Math.max(w / d.w, h / d.h);
      w = d.w * k;
      h = d.h * k;
    }
    if (pixel) {
      w = Math.max(1, Math.round(w));
      h = Math.max(1, Math.round(h));
    }
    const nx = d.id.includes('w') ? d.x + d.w - w : d.x;
    const ny = d.id.includes('n') ? d.y + d.h - h : d.y;
    // Mittelpunkt mit der Drehung mitführen, damit die feste Seite wirklich stehen bleibt
    const ocx = d.x + d.w / 2;
    const ocy = d.y + d.h / 2;
    const ncx = nx + w / 2;
    const ncy = ny + h / 2;
    const cc = Math.cos(d.angle);
    const ss = Math.sin(d.angle);
    const ddx = ncx - ocx;
    const ddy = ncy - ocy;
    const rcx = ocx + ddx * cc - ddy * ss;
    const rcy = ocy + ddx * ss + ddy * cc;
    this.w = w;
    this.h = h;
    this.x = rcx - w / 2;
    this.y = rcy - h / 2;
  }
  end() {
    this.drag = null;
  }
  /** in einen Kontext zeichnen (Bild-Koordinaten) */
  paint(g) {
    g.save();
    g.imageSmoothingEnabled = this.smooth && (this.w !== this.canvas.width || this.h !== this.canvas.height || this.angle !== 0);
    g.imageSmoothingQuality = 'high';
    g.translate(this.cx, this.cy);
    g.rotate(this.angle);
    g.drawImage(this.canvas, -this.w / 2, -this.h / 2, this.w, this.h);
    g.restore();
  }
  /** Rechteck (achsenparallel) um das gedrehte Objekt */
  bbox() {
    const pts = this.corners();
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const x = Math.floor(Math.min(...xs)) - 1;
    const y = Math.floor(Math.min(...ys)) - 1;
    return { x, y, w: Math.ceil(Math.max(...xs)) - x + 2, h: Math.ceil(Math.max(...ys)) - y + 2 };
  }
  /** Vorschau + Rahmen mit Griffen zeichnen (View-Overlay) */
  drawOverlay(g, view) {
    view.docTransform(g);
    this.paint(g);
    view.screenTransform(g);
    const pts = this.corners().map((p) => view.toScreen(p.x, p.y));
    g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
    g.closePath();
    g.lineWidth = 1;
    g.strokeStyle = '#fff';
    g.stroke();
    g.setLineDash([4, 4]);
    g.strokeStyle = '#2563eb';
    g.stroke();
    g.setLineDash([]);
    const hs = this.handles(view).map((hd) => ({ ...hd, ...view.toScreen(hd.x, hd.y) }));
    const top = hs.find((hd) => hd.id === 'n');
    const rot = hs.find((hd) => hd.id === 'rot');
    g.beginPath();
    g.moveTo(top.x, top.y);
    g.lineTo(rot.x, rot.y);
    g.strokeStyle = '#2563eb';
    g.stroke();
    for (const hd of hs) {
      g.beginPath();
      if (hd.id === 'rot') g.arc(hd.x, hd.y, HANDLE + 1, 0, Math.PI * 2);
      else g.rect(hd.x - HANDLE, hd.y - HANDLE, HANDLE * 2, HANDLE * 2);
      g.fillStyle = '#fff';
      g.fill();
      g.strokeStyle = '#2563eb';
      g.stroke();
    }
  }
}

/** Ausschnitt einer Ebene (Auswahl) herausheben: liefert { canvas, x, y } und löscht ihn aus der Ebene */
export function liftSelection(layer, sel, clear = true) {
  const b = { x: Math.floor(sel.x), y: Math.floor(sel.y), w: Math.max(1, Math.round(sel.w)), h: Math.max(1, Math.round(sel.h)) };
  const c = makeCanvas(b.w, b.h);
  const g = c.getContext('2d');
  if (sel.type === 'ellipse') {
    g.beginPath();
    g.ellipse(b.w / 2, b.h / 2, b.w / 2, b.h / 2, 0, 0, Math.PI * 2);
    g.clip();
  }
  g.drawImage(layer.canvas, -b.x, -b.y);
  if (clear) {
    const lg = layer.ctx;
    lg.save();
    lg.beginPath();
    if (sel.type === 'ellipse') lg.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0, 0, Math.PI * 2);
    else lg.rect(b.x, b.y, b.w, b.h);
    lg.clip();
    lg.clearRect(b.x, b.y, b.w, b.h);
    lg.restore();
  }
  return { canvas: c, x: b.x, y: b.y };
}
