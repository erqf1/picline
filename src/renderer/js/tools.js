// Werkzeuge und Maus/Stift/Touch-Bedienung auf der Arbeitsfläche.
// Linke Taste malt mit der Hauptfarbe, rechte mit der Zweitfarbe. Alt+Klick = Pipette, Leertaste/Mitteltaste = Hand,
// Mausrad = Zoom (einstellbar), zwei Finger = Zoom und Verschieben.
import { Stroke, floodFill } from './brush.js';
import { Floating, liftSelection } from './floating.js';
import { renderShape, renderText, shapeBox, fontFamily } from './shapes.js';
import { makeCanvas, selectionPath, unionRect, clampRect } from './doc.js';

export const TOOLS = ['select', 'move', 'brush', 'pixel', 'eraser', 'fill', 'picker', 'shapes', 'text', 'crop', 'hand', 'zoom'];
export const TOOL_KEYS = { select: 'M', move: 'V', brush: 'B', pixel: 'P', eraser: 'E', fill: 'G', picker: 'I', shapes: 'U', text: 'T', crop: 'C', hand: 'H', zoom: 'Z' };
export const DEFAULT_OPTS = {
  brush: { style: 'round', size: 12, opacity: 100, hardness: 70, pressure: true },
  pixel: { size: 1, opacity: 100, round: false, perfect: true },
  eraser: { mode: 'soft', size: 24, opacity: 100, hardness: 60 },
  fill: { tolerance: 8, contiguous: true, sampleAll: false },
  picker: { sampleAll: true, back: true, avg: 1 },
  shapes: { type: 'rect', width: 4, stroke: true, fill: 'none', pixel: false },
  text: { font: 'Segoe UI', size: 40, bold: false, italic: false, underline: false, align: 'left', bg: false, pixel: false },
  select: { shape: 'rect' },
  move: { smooth: true },
  crop: { ratio: 'free' },
  mirror: 'none',
};
const PAINT = new Set(['brush', 'pixel', 'eraser']);

export class Tools {
  constructor(app) {
    this.app = app;
    this.view = app.view;
    this.id = 'brush';
    this.prev = 'brush';
    this.float = null;
    this.text = null;
    this.shape = null;
    this.cropRect = null;
    this.hover = null;
    this.drag = null;
    this.space = false;
    this.touches = new Map();
    this.lastPaint = null;
    const c = this.view.canvas;
    c.addEventListener('pointerdown', (e) => this.down(e));
    c.addEventListener('pointermove', (e) => this.move(e));
    c.addEventListener('pointerup', (e) => this.up(e));
    c.addEventListener('pointercancel', (e) => this.up(e, true));
    c.addEventListener('pointerleave', () => {
      this.hover = null;
      this.view.render();
      this.app.hoverChanged?.(null);
    });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
    c.addEventListener('dblclick', (e) => {
      if (this.id === 'hand') this.view.fit();
      void e;
    });
    this.view.overlays.add((g, v) => this.overlay(g, v));
  }
  get doc() {
    return this.app.doc;
  }
  get o() {
    return this.app.opts[this.id] || {};
  }
  t(k, v) {
    return this.app.t(k, v);
  }

  // ---------------------------------------------------------------- Werkzeug wechseln
  set(id) {
    if (!TOOLS.includes(id) || id === this.id) return;
    this.commit();
    if (id === 'crop') this.startCrop();
    else this.cropRect = null;
    if (this.id !== 'picker') this.prev = this.id;
    this.id = id;
    this.updateCursor();
    this.view.render();
    this.app.toolChanged();
  }
  /** alles Offene übernehmen (schwebendes Bild, Text). Vor Speichern, Rückgängig, Werkzeugwechsel ... */
  commit() {
    if (this.text) this.commitText();
    if (this.float) this.applyFloat();
  }
  /** Escape */
  cancel() {
    if (this.text) {
      this.removeText();
      return true;
    }
    if (this.float) {
      this.cancelFloat();
      return true;
    }
    if (this.id === 'crop' && this.cropRect) {
      this.startCrop();
      this.view.render();
      return true;
    }
    if (this.doc?.selection) {
      this.doc.selection = null;
      this.doc.changed('selection');
      return true;
    }
    return false;
  }
  docChanged() {
    // anderes Bild: Offenes verwerfen (wurde vorher übernommen)
    this.float = null;
    this.removeText();
    this.shape = null;
    this.drag = null;
    if (this.id === 'crop') this.startCrop();
    this.view.render();
  }

  // ---------------------------------------------------------------- Zeiger
  point(e) {
    const s = this.view.local(e);
    const p = this.view.toDoc(s.x, s.y);
    p.pressure = e.pointerType === 'pen' ? e.pressure : null;
    p.sx = s.x;
    p.sy = s.y;
    return p;
  }
  down(e) {
    const doc = this.doc;
    if (!doc) return;
    this.view.canvas.focus?.();
    if (e.pointerType === 'touch') {
      this.touches.set(e.pointerId, this.view.local(e));
      if (this.touches.size === 2) {
        // zweiter Finger: Strich abbrechen, Zoom/Verschieben mit zwei Fingern
        this.abortDrag();
        const [a, b] = [...this.touches.values()];
        this.drag = { type: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, zoom: this.view.zoom };
        return;
      }
      if (this.touches.size > 2) return;
    }
    this.view.canvas.setPointerCapture(e.pointerId);
    const p = this.point(e);
    const right = e.button === 2;
    if (e.button === 1 || this.space || this.id === 'hand') {
      this.drag = { type: 'pan', x: p.sx, y: p.sy };
      this.view.canvas.style.cursor = 'grabbing';
      return;
    }
    if (this.id === 'zoom') {
      this.drag = { type: 'zoom', a: p, b: p, out: right || e.altKey };
      return;
    }
    if (e.altKey && (PAINT.has(this.id) || this.id === 'fill' || this.id === 'shapes')) {
      this.pick(p, right);
      this.drag = { type: 'pick', right };
      return;
    }
    const fn = this[`down_${this.id}`];
    if (fn) fn.call(this, p, e, right);
  }
  move(e) {
    const doc = this.doc;
    if (!doc) return;
    if (e.pointerType === 'touch' && this.touches.has(e.pointerId)) {
      this.touches.set(e.pointerId, this.view.local(e));
      if (this.drag?.type === 'pinch' && this.touches.size >= 2) {
        const [a, b] = [...this.touches.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        this.view.panBy(mid.x - this.drag.mid.x, mid.y - this.drag.mid.y);
        this.view.setZoom(this.drag.zoom * (dist / this.drag.dist), mid.x, mid.y);
        this.drag.mid = mid;
        return;
      }
    }
    const p = this.point(e);
    this.hover = p;
    this.app.hoverChanged?.(p);
    const d = this.drag;
    if (!d) {
      this.updateCursor(p);
      if (PAINT.has(this.id) || this.id === 'fill' || this.id === 'picker' || this.id === 'shapes') this.view.render();
      return;
    }
    if (d.type === 'pan') {
      this.view.panBy(p.sx - d.x, p.sy - d.y);
      d.x = p.sx;
      d.y = p.sy;
      return;
    }
    if (d.type === 'zoom') {
      d.b = p;
      this.view.render();
      return;
    }
    if (d.type === 'pick') {
      this.pick(p, d.right);
      return;
    }
    const fn = this[`move_${this.id}`];
    if (fn) fn.call(this, p, e);
  }
  up(e, cancelled = false) {
    if (e.pointerType === 'touch') {
      this.touches.delete(e.pointerId);
      if (this.drag?.type === 'pinch') {
        if (!this.touches.size) this.drag = null;
        return;
      }
    }
    const d = this.drag;
    if (!d || !this.doc) return;
    const p = this.point(e);
    if (d.type === 'pan') {
      this.drag = null;
      this.updateCursor(p);
      return;
    }
    if (d.type === 'zoom') {
      this.drag = null;
      const v = this.view;
      const w = Math.abs(d.b.x - d.a.x) * v.zoom;
      const h = Math.abs(d.b.y - d.a.y) * v.zoom;
      if (w > 8 && h > 8 && !d.out) {
        const z = Math.min(v.cssW / Math.abs(d.b.x - d.a.x), v.cssH / Math.abs(d.b.y - d.a.y)) * 0.92;
        v.setZoom(z);
        const c = v.toScreen((d.a.x + d.b.x) / 2, (d.a.y + d.b.y) / 2);
        v.panBy(v.cssW / 2 - c.x, v.cssH / 2 - c.y);
      } else v.zoomStep(d.out ? -1 : 1, p.sx, p.sy);
      return;
    }
    if (d.type === 'pick') {
      this.drag = null;
      return;
    }
    const fn = this[`up_${this.id}`];
    if (fn) fn.call(this, p, e, cancelled);
    this.drag = null;
    this.updateCursor(p);
  }
  abortDrag() {
    const d = this.drag;
    if (d?.stroke) {
      d.stroke.cancel();
      this.view.render();
    }
    if (this.id === 'select' && d?.type === 'select') {
      this.doc.selection = d.before;
      this.doc.changed('selection');
    }
    if (d?.type === 'shape') this.shape = null;
    this.drag = null;
  }
  wheel(e) {
    if (!this.doc) return;
    e.preventDefault();
    const s = this.view.local(e);
    const zoomMode = this.app.settings.wheel !== 'scroll';
    // Touchpad mit zwei Fingern (Bruchteile oder seitlich) schiebt; Strg+Rad (und Touchpad-Zoom) zoomt immer;
    // Shift+Rad schiebt waagrecht
    const touchpad = !e.ctrlKey && e.deltaMode === 0 && (e.deltaX !== 0 || !Number.isInteger(e.deltaY));
    if (e.ctrlKey || (zoomMode && !e.shiftKey && !touchpad)) {
      if (Math.abs(e.deltaY) < 30 && e.ctrlKey && !Number.isInteger(e.deltaY)) {
        // Touchpad: stufenlos
        this.view.setZoom(this.view.zoom * Math.exp(-e.deltaY * 0.01), s.x, s.y);
      } else this.view.zoomStep(e.deltaY < 0 ? 1 : -1, s.x, s.y);
      return;
    }
    if (e.shiftKey) this.view.panBy(-(e.deltaY || e.deltaX), 0);
    else this.view.panBy(-e.deltaX, -e.deltaY);
  }
  setSpace(on) {
    this.space = on;
    this.updateCursor(this.hover);
  }
  updateCursor(p = this.hover) {
    const c = this.view.canvas;
    if (this.drag?.type === 'pan') return;
    if (this.space || this.id === 'hand') {
      c.style.cursor = 'grab';
      return;
    }
    let cur = 'default';
    if (PAINT.has(this.id)) cur = 'none';
    else if (this.id === 'fill' || this.id === 'picker' || this.id === 'shapes' || this.id === 'select') cur = 'crosshair';
    else if (this.id === 'text') cur = 'text';
    else if (this.id === 'move') cur = 'move';
    else if (this.id === 'zoom') cur = 'zoom-in';
    if (p && this.float) {
      const hit = this.float.hit(p, this.view);
      if (hit) cur = this.float.cursorFor(hit);
    }
    if (p && this.id === 'select' && !this.float && this.doc?.selection && insideRect(this.doc.selection, p)) cur = 'move';
    if (p && this.id === 'crop' && this.cropRect) cur = cropCursor(this.cropHit(p));
    c.style.cursor = cur;
  }

  // ---------------------------------------------------------------- Malen
  canPaint() {
    const l = this.doc.layer;
    if (!l.visible) {
      this.app.toast(this.t('layerHidden'));
      return false;
    }
    if (l.locked) {
      this.app.toast(this.t('layerLocked'));
      return false;
    }
    return true;
  }
  strokeOpts(right) {
    const app = this.app;
    const o = this.o;
    const color = right ? app.colors.secondary : app.colors.primary;
    const mirror = app.opts.mirror;
    if (this.id === 'pixel') return { kind: 'pixel', size: o.size, opacity: o.opacity / 100, color, round: o.round, perfect: o.perfect, mirror };
    if (this.id === 'eraser') return { kind: 'erase', size: o.size, opacity: o.opacity / 100, hardness: o.mode === 'hard' ? 1 : o.hardness / 100, pixelErase: o.mode === 'pixel', color, mirror };
    return { kind: 'brush', style: o.style, size: o.size, opacity: o.opacity / 100, hardness: o.hardness / 100, pressure: o.pressure, color, mirror };
  }
  paintDown(p, e, right) {
    this.commit();
    if (!this.canPaint()) return;
    const stroke = new Stroke(this.doc, this.strokeOpts(right));
    if (e.shiftKey && this.lastPaint) {
      stroke.start(this.lastPaint);
      stroke.to(p);
    } else stroke.start(p);
    this.drag = { type: 'stroke', stroke };
    this.view.render();
  }
  paintMove(p, e) {
    const st = this.drag?.stroke;
    if (!st) return;
    const evs = e.getCoalescedEvents?.() || [e];
    for (const ev of evs.length ? evs : [e]) st.to(this.point(ev));
    this.view.render();
  }
  paintUp(p, e, cancelled) {
    const st = this.drag?.stroke;
    if (!st) return;
    if (cancelled) st.cancel();
    else st.end(this.t(`tool_${this.id}`));
    this.lastPaint = { x: p.x, y: p.y };
    this.view.render();
    this.app.edited();
  }
  down_brush(p, e, right) {
    this.paintDown(p, e, right);
  }
  move_brush(p, e) {
    this.paintMove(p, e);
  }
  up_brush(p, e, c) {
    this.paintUp(p, e, c);
  }

  // ---------------------------------------------------------------- Füllen und Pipette
  down_fill(p, e, right) {
    this.commit();
    if (!this.canPaint()) return;
    const doc = this.doc;
    const o = this.o;
    const color = right ? this.app.colors.secondary : this.app.colors.primary;
    const token = doc.beginPixels();
    const r = floodFill(doc, doc.layer, o.sampleAll ? doc.composite() : doc.layer.canvas, p.x, p.y, color, { tolerance: o.tolerance, contiguous: o.contiguous });
    if (r) doc.commitPixels(token, r, this.t('tool_fill'));
    this.view.render();
    this.app.edited();
  }
  sample(p) {
    const doc = this.doc;
    const x = Math.floor(p.x);
    const y = Math.floor(p.y);
    if (x < 0 || y < 0 || x >= doc.w || y >= doc.h) return null;
    const src = this.app.opts.picker.sampleAll ? doc.composite() : doc.layer.canvas;
    const n = this.app.opts.picker.avg || 1;
    const r = clampRect({ x: x - Math.floor(n / 2), y: y - Math.floor(n / 2), w: n, h: n }, doc.w, doc.h);
    const d = src.getContext('2d').getImageData(r.x, r.y, r.w, r.h).data;
    let sr = 0, sg = 0, sb = 0, sa = 0;
    const cnt = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      sr += d[i];
      sg += d[i + 1];
      sb += d[i + 2];
      sa += d[i + 3];
    }
    return { r: Math.round(sr / cnt), g: Math.round(sg / cnt), b: Math.round(sb / cnt), a: Math.round(sa / cnt) };
  }
  pick(p, right) {
    const c = this.sample(p);
    if (c) this.app.setColor(right ? 'secondary' : 'primary', c);
  }
  down_picker(p, e, right) {
    this.pick(p, right);
    this.drag = { type: 'picker', right };
  }
  move_picker(p) {
    this.pick(p, this.drag.right);
  }
  up_picker() {
    if (this.app.opts.picker.back && this.prev && this.prev !== 'picker') this.set(this.prev);
  }

  // ---------------------------------------------------------------- Auswahl und Verschieben
  down_select(p, e) {
    const doc = this.doc;
    if (this.float) {
      const hit = this.float.hit(p, this.view);
      if (hit) {
        this.float.begin(hit, p);
        this.drag = { type: 'float' };
        return;
      }
      this.applyFloat();
    }
    if (doc.selection && insideRect(doc.selection, p) && !e.shiftKey) {
      // in die Auswahl geklickt: Inhalt herausheben und verschieben
      if (!this.liftSelection()) return;
      this.float.begin('move', p);
      this.drag = { type: 'float' };
      return;
    }
    const a = { x: clampInt(p.x, 0, doc.w), y: clampInt(p.y, 0, doc.h) };
    this.drag = { type: 'select', a, before: doc.selection, alt: e.altKey };
    doc.selection = null;
    doc.changed('selection');
  }
  move_select(p, e) {
    if (this.drag.type === 'float') return this.floatMove(p, e);
    const doc = this.doc;
    const { a } = this.drag;
    let bx = clampInt(p.x, 0, doc.w);
    let by = clampInt(p.y, 0, doc.h);
    let w = bx - a.x;
    let h = by - a.y;
    if (e.shiftKey) {
      const s = Math.max(Math.abs(w), Math.abs(h));
      w = Math.sign(w || 1) * s;
      h = Math.sign(h || 1) * s;
    }
    let x = a.x;
    let y = a.y;
    if (e.altKey) {
      x = a.x - Math.abs(w);
      y = a.y - Math.abs(h);
      w = Math.abs(w) * 2;
      h = Math.abs(h) * 2;
    }
    const r = clampRect({ x: Math.min(x, x + w), y: Math.min(y, y + h), w: Math.abs(w), h: Math.abs(h) }, doc.w, doc.h);
    doc.selection = r ? { type: this.app.opts.select.shape, ...r } : null;
    doc.changed('selection');
    void bx;
    void by;
  }
  up_select(p, e) {
    if (this.drag.type === 'float') return this.floatUp();
    this.doc.changed('selection');
    void p;
    void e;
  }
  liftSelection() {
    const doc = this.doc;
    if (!this.canPaint()) return false;
    const token = doc.beginPixels();
    const sel = doc.selection;
    const lifted = liftSelection(doc.layer, sel);
    this.float = new Floating({ ...lifted, layer: doc.layer, token, label: this.t('tool_move') });
    this.float.origRect = { x: lifted.x, y: lifted.y, w: lifted.canvas.width, h: lifted.canvas.height };
    this.float.smooth = this.app.opts.move.smooth;
    doc.selection = null;
    doc.touch(doc.layer);
    this.view.render();
    return true;
  }
  down_move(p) {
    const doc = this.doc;
    if (this.float) {
      const hit = this.float.hit(p, this.view) || 'move';
      this.float.begin(hit, p);
      this.drag = { type: 'float' };
      return;
    }
    if (!this.canPaint()) return;
    if (!doc.selection) {
      // ohne Auswahl: den ganzen Inhalt der Ebene verschieben
      const b = doc.constructor.bounds(doc.layer.canvas);
      if (!b) return;
      doc.selection = { type: 'rect', ...b };
    }
    if (!this.liftSelection()) return;
    this.float.begin('move', p);
    this.drag = { type: 'float' };
  }
  move_move(p, e) {
    this.floatMove(p, e);
  }
  up_move() {
    this.floatUp();
  }
  floatMove(p, e) {
    if (!this.float) return;
    this.float.move(p, e.shiftKey, !this.float.smooth);
    this.view.render();
    this.app.floatChanged?.(this.float);
  }
  floatUp() {
    this.float?.end();
    this.app.floatChanged?.(this.float);
  }
  /** eingefügtes Bild als schwebendes Objekt (über die ganze Ebene oder als neue Ebene) */
  paste(canvas, { newLayer = false, at = null } = {}) {
    this.commit();
    const doc = this.doc;
    if (this.id !== 'move' && this.id !== 'select') this.set('move');
    // in die Mitte des sichtbaren Bereichs, sonst links oben
    let x = 0;
    let y = 0;
    if (at) ({ x, y } = at);
    else {
      const c = this.view.toDoc(this.view.cssW / 2, this.view.cssH / 2);
      x = Math.round(Math.min(Math.max(0, c.x - canvas.width / 2), Math.max(0, doc.w - canvas.width)));
      y = Math.round(Math.min(Math.max(0, c.y - canvas.height / 2), Math.max(0, doc.h - canvas.height)));
    }
    this.float = new Floating({ canvas, x, y, layer: doc.layer, newLayer, label: this.t('paste') });
    this.float.smooth = this.app.opts.move.smooth;
    doc.selection = null;
    doc.changed('selection');
    this.view.render();
    this.app.floatChanged?.(this.float);
  }
  applyFloat() {
    const f = this.float;
    if (!f) return;
    this.float = null;
    const doc = this.doc;
    if (f.newLayer) {
      doc.structural(f.label, () => {
        const l = doc.newLayer(this.app.layerName());
        f.paint(l.ctx);
        doc.layers.splice(doc.active + 1, 0, l);
        doc.active++;
      });
    } else {
      const layer = doc.layers.includes(f.layer) ? f.layer : doc.layer;
      const token = f.token || doc.beginPixels(layer);
      f.paint(layer.ctx);
      const rect = unionRect(f.bbox(), f.origRect || null);
      doc.commitPixels(token, rect, f.label);
    }
    // Auswahl bleibt um den verschobenen Inhalt (wenn nicht gedreht)
    if (!f.angle) {
      const r = clampRect({ x: Math.round(f.x), y: Math.round(f.y), w: Math.round(f.w), h: Math.round(f.h) }, doc.w, doc.h);
      doc.selection = r && f.origRect ? { type: 'rect', ...r } : null;
    }
    doc.changed('selection');
    this.view.render();
    this.app.edited();
    this.app.floatChanged?.(null);
  }
  cancelFloat() {
    const f = this.float;
    if (!f) return;
    this.float = null;
    if (f.token) {
      // herausgehobene Pixel zurücklegen
      const g = f.layer.ctx;
      g.clearRect(0, 0, f.layer.canvas.width, f.layer.canvas.height);
      g.drawImage(f.token.before, 0, 0);
      this.doc.touch(f.layer);
      this.doc.selection = f.origRect ? { type: 'rect', ...f.origRect } : null;
    }
    this.doc.changed('selection');
    this.view.render();
    this.app.floatChanged?.(null);
  }
  /** Entf bei schwebendem Inhalt: weg damit (herausgehobene Stelle bleibt leer) */
  deleteFloat() {
    const f = this.float;
    if (!f) return false;
    this.float = null;
    if (f.token) this.doc.commitPixels(f.token, f.origRect, this.t('delete'));
    this.view.render();
    this.app.edited();
    this.app.floatChanged?.(null);
    return true;
  }
  nudge(dx, dy) {
    if (this.float) {
      this.float.x += dx;
      this.float.y += dy;
      this.view.render();
      return true;
    }
    const sel = this.doc?.selection;
    if (sel && this.id === 'select') {
      sel.x += dx;
      sel.y += dy;
      this.doc.changed('selection');
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- Formen
  shapeOpts() {
    const o = this.app.opts.shapes;
    return { width: o.width, stroke: o.stroke, fill: o.fill, pixel: o.pixel, primary: this.app.colors.primary, secondary: this.app.colors.secondary };
  }
  down_shapes(p, e) {
    if (this.float) {
      const hit = this.float.hit(p, this.view);
      if (hit) {
        this.float.begin(hit, p);
        this.drag = { type: 'float' };
        return;
      }
      this.applyFloat();
    }
    if (!this.canPaint()) return;
    this.drag = { type: 'shape', a: { x: p.x, y: p.y } };
    void e;
  }
  move_shapes(p, e) {
    if (this.drag.type === 'float') return this.floatMove(p, e);
    const o = this.app.opts.shapes;
    const box = shapeBox(o.type, this.drag.a, p, e.shiftKey);
    this.shape = renderShape(o.type, box, this.shapeOpts());
    this.drag.moved = true;
    this.view.render();
  }
  up_shapes() {
    if (this.drag.type === 'float') return this.floatUp();
    const s = this.shape;
    this.shape = null;
    if (!s || !this.drag.moved) {
      this.view.render();
      return;
    }
    // fertige Form bleibt noch verschieb-/drehbar, bis man daneben klickt
    const f = new Floating({ canvas: s.canvas, x: s.x, y: s.y, layer: this.doc.layer, label: this.t(`shape_${this.app.opts.shapes.type}`) });
    f.smooth = !this.app.opts.shapes.pixel;
    this.float = f;
    this.view.render();
    this.app.floatChanged?.(f);
  }

  // ---------------------------------------------------------------- Text
  down_text(p) {
    if (this.text) {
      const r = this.textRect();
      if (p.x >= r.x && p.y >= r.y && p.x <= r.x + r.w && p.y <= r.y + r.h) {
        // in den Text geklickt: Rand zum Verschieben
        this.drag = { type: 'textmove', p0: p, x: this.text.x, y: this.text.y };
        return;
      }
      this.commitText();
      return;
    }
    if (!this.canPaint()) return;
    this.startText(Math.round(p.x), Math.round(p.y));
  }
  move_text(p) {
    if (this.drag?.type !== 'textmove') return;
    this.text.x = Math.round(this.drag.x + p.x - this.drag.p0.x);
    this.text.y = Math.round(this.drag.y + p.y - this.drag.p0.y);
    this.placeText();
    this.view.render();
  }
  up_text() {
    this.text?.el.focus();
  }
  textOpts() {
    const o = this.app.opts.text;
    return { ...o, text: this.text?.el.value || '', color: this.app.colors.primary, bg: o.bg ? this.app.colors.secondary : null };
  }
  startText(x, y) {
    const el = document.createElement('textarea');
    el.className = 'text-input';
    el.spellcheck = false;
    el.setAttribute('autocomplete', 'off');
    this.view.host.append(el);
    this.text = { x, y, el };
    el.addEventListener('input', () => this.refreshText());
    el.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        this.commitText();
      }
    });
    this.refreshText();
    setTimeout(() => el.focus(), 0);
  }
  refreshText() {
    if (!this.text) return;
    this.text.img = renderText({ ...this.textOpts(), text: this.text.el.value || ' ' });
    this.placeText();
    this.view.render();
  }
  textRect() {
    const t = this.text;
    const img = t.img;
    return { x: t.x - img.pad, y: t.y - img.pad, w: img.w, h: img.h };
  }
  placeText() {
    const t = this.text;
    if (!t) return;
    const v = this.view;
    const o = this.app.opts.text;
    const r = this.textRect();
    const s = v.toScreen(r.x, r.y);
    const el = t.el;
    const z = v.zoom;
    el.style.left = `${s.x}px`;
    el.style.top = `${s.y}px`;
    el.style.width = `${Math.max(40, r.w * z + o.size * z)}px`;
    el.style.height = `${r.h * z + 4}px`;
    el.style.padding = `${t.img.pad * z}px`;
    el.style.font = `${o.italic ? 'italic ' : ''}${o.bold ? 'bold ' : ''}${o.size * z}px/${Math.round(o.size * 1.25) * z}px ${fontFamily(o.font)}`;
    el.style.textAlign = o.align;
    el.style.caretColor = `rgb(${this.app.colors.primary.r},${this.app.colors.primary.g},${this.app.colors.primary.b})`;
  }
  commitText() {
    const t = this.text;
    if (!t) return;
    const value = t.el.value;
    this.removeText();
    if (!value.trim()) return;
    const img = renderText({ ...this.textOpts(), text: value });
    const doc = this.doc;
    doc.editPixels(this.t('tool_text'), (g) => {
      g.save();
      if (doc.selection) {
        selectionPath(g, doc.selection);
        g.clip();
      }
      g.drawImage(img.canvas, t.x - img.pad, t.y - img.pad);
      g.restore();
      return { x: t.x - img.pad, y: t.y - img.pad, w: img.w, h: img.h };
    });
    this.view.render();
    this.app.edited();
  }
  removeText() {
    if (!this.text) return;
    this.text.el.remove();
    this.text = null;
    this.view.render();
  }

  // ---------------------------------------------------------------- Zuschneiden
  startCrop() {
    const d = this.doc;
    if (!d) {
      this.cropRect = null;
      return;
    }
    const s = d.selection;
    this.cropRect = s ? { x: s.x, y: s.y, w: s.w, h: s.h } : { x: 0, y: 0, w: d.w, h: d.h };
    this.app.cropChanged?.(this.cropRect);
  }
  cropHit(p) {
    const r = this.cropRect;
    if (!r) return null;
    const tol = 8 / this.view.zoom;
    const near = (a, b) => Math.abs(a - b) <= tol;
    const inY = p.y >= r.y - tol && p.y <= r.y + r.h + tol;
    const inX = p.x >= r.x - tol && p.x <= r.x + r.w + tol;
    let id = '';
    if (inX && near(p.y, r.y)) id += 'n';
    else if (inX && near(p.y, r.y + r.h)) id += 's';
    if (inY && near(p.x, r.x)) id += 'w';
    else if (inY && near(p.x, r.x + r.w)) id += 'e';
    if (id) return id;
    return p.x > r.x && p.y > r.y && p.x < r.x + r.w && p.y < r.y + r.h ? 'move' : null;
  }
  down_crop(p) {
    if (!this.cropRect) this.startCrop();
    const hit = this.cropHit(p) || 'new';
    this.drag = { type: 'crop', id: hit, p0: p, r: { ...this.cropRect } };
  }
  move_crop(p, e) {
    const d = this.drag;
    const r0 = d.r;
    let { x, y, w, h } = r0;
    const dx = Math.round(p.x - d.p0.x);
    const dy = Math.round(p.y - d.p0.y);
    if (d.id === 'move') {
      x += dx;
      y += dy;
    } else if (d.id === 'new') {
      x = Math.round(Math.min(d.p0.x, p.x));
      y = Math.round(Math.min(d.p0.y, p.y));
      w = Math.round(Math.abs(p.x - d.p0.x));
      h = Math.round(Math.abs(p.y - d.p0.y));
    } else {
      if (d.id.includes('w')) {
        x += dx;
        w -= dx;
      }
      if (d.id.includes('e')) w += dx;
      if (d.id.includes('n')) {
        y += dy;
        h -= dy;
      }
      if (d.id.includes('s')) h += dy;
    }
    const ratio = cropRatio(this.app.opts.crop.ratio, this.doc) || (e.shiftKey && d.id !== 'move' ? r0.w / r0.h : 0);
    if (ratio && d.id !== 'move') {
      if (d.id === 'n' || d.id === 's') w = Math.round(h * ratio);
      else h = Math.round(w / ratio);
      if (d.id.includes('n')) y = r0.y + r0.h - h;
    }
    if (w < 1 || h < 1) return;
    this.cropRect = { x, y, w, h };
    this.app.cropChanged?.(this.cropRect);
    this.view.render();
  }
  up_crop() {}
  applyCrop() {
    const r = this.cropRect;
    const doc = this.doc;
    if (!r || !doc) return;
    if (r.x === 0 && r.y === 0 && r.w === doc.w && r.h === doc.h) return;
    this.app.cropTo(r);
    this.startCrop();
  }

  // ---------------------------------------------------------------- Anzeige
  overlay(g, v) {
    const doc = this.doc;
    if (!doc) return;
    if (this.shape) {
      v.docTransform(g);
      g.imageSmoothingEnabled = v.zoom < 1;
      if (doc.selection) {
        selectionPath(g, doc.selection);
        g.clip();
      }
      g.drawImage(this.shape.canvas, this.shape.x, this.shape.y);
      g.setTransform(1, 0, 0, 1, 0, 0);
    }
    if (this.float) this.float.drawOverlay(g, v);
    if (this.text?.img) {
      const r = this.textRect();
      v.docTransform(g);
      g.imageSmoothingEnabled = v.zoom < 1;
      g.drawImage(this.text.img.canvas, r.x, r.y);
      v.screenTransform(g);
      const s = v.toScreen(r.x, r.y);
      g.setLineDash([4, 3]);
      g.strokeStyle = '#2563eb';
      g.lineWidth = 1;
      g.strokeRect(Math.round(s.x) - 0.5, Math.round(s.y) - 0.5, Math.round(r.w * v.zoom) + 1, Math.round(r.h * v.zoom) + 1);
      g.setLineDash([]);
    }
    if (this.id === 'crop' && this.cropRect) this.drawCrop(g, v);
    if (this.drag?.type === 'zoom') {
      v.screenTransform(g);
      const a = v.toScreen(this.drag.a.x, this.drag.a.y);
      const b = v.toScreen(this.drag.b.x, this.drag.b.y);
      g.strokeStyle = '#2563eb';
      g.setLineDash([4, 3]);
      g.strokeRect(Math.min(a.x, b.x) + 0.5, Math.min(a.y, b.y) + 0.5, Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      g.setLineDash([]);
    }
    if (this.hover && !this.space && !this.drag?.type?.startsWith('p') && (PAINT.has(this.id) || this.id === 'fill' || this.id === 'picker' || this.id === 'shapes')) this.drawCursor(g, v);
  }
  drawCursor(g, v) {
    const p = this.hover;
    v.screenTransform(g);
    const z = v.zoom;
    const ring = (fn) => {
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(0,0,0,0.55)';
      fn();
      g.stroke();
      g.lineWidth = 1;
      g.strokeStyle = '#fff';
      fn();
      g.stroke();
    };
    const pixel = this.id === 'pixel' || (this.id === 'eraser' && this.o.mode === 'pixel');
    if (pixel) {
      const s = Math.max(1, Math.round(this.o.size));
      const off = Math.floor((s - 1) / 2);
      const cells = [[Math.floor(p.x) - off, Math.floor(p.y) - off]];
      const m = this.app.opts.mirror;
      const W = this.doc.w;
      const H = this.doc.h;
      const [cx, cy] = cells[0];
      if (m === 'x' || m === 'xy') cells.push([W - cx - s, cy]);
      if (m === 'y' || m === 'xy') cells.push([cx, H - cy - s]);
      if (m === 'xy') cells.push([W - cx - s, H - cy - s]);
      cells.forEach(([x, y], i) => {
        const a = v.toScreen(x, y);
        g.globalAlpha = i ? 0.5 : 1;
        ring(() => {
          g.beginPath();
          g.rect(Math.round(a.x) + 0.5, Math.round(a.y) + 0.5, Math.max(2, Math.round(s * z) - 1), Math.max(2, Math.round(s * z) - 1));
        });
      });
      g.globalAlpha = 1;
      return;
    }
    const s = v.toScreen(p.x, p.y);
    if (PAINT.has(this.id)) {
      const r = (this.o.size / 2) * z;
      if (r >= 3) ring(() => {
        g.beginPath();
        g.arc(s.x, s.y, r, 0, Math.PI * 2);
      });
    }
    // Fadenkreuz in der Mitte
    ring(() => {
      g.beginPath();
      g.moveTo(s.x - 6, s.y);
      g.lineTo(s.x - 2, s.y);
      g.moveTo(s.x + 2, s.y);
      g.lineTo(s.x + 6, s.y);
      g.moveTo(s.x, s.y - 6);
      g.lineTo(s.x, s.y - 2);
      g.moveTo(s.x, s.y + 2);
      g.lineTo(s.x, s.y + 6);
    });
  }
  drawCrop(g, v) {
    const r = this.cropRect;
    v.screenTransform(g);
    const a = v.toScreen(r.x, r.y);
    const w = r.w * v.zoom;
    const h = r.h * v.zoom;
    // außerhalb abdunkeln
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.beginPath();
    g.rect(0, 0, v.cssW, v.cssH);
    g.rect(a.x, a.y, w, h);
    g.fill('evenodd');
    g.strokeStyle = '#fff';
    g.lineWidth = 1;
    g.strokeRect(Math.round(a.x) + 0.5, Math.round(a.y) + 0.5, Math.round(w) - 1, Math.round(h) - 1);
    // Drittel-Linien
    g.strokeStyle = 'rgba(255,255,255,0.45)';
    g.beginPath();
    for (const k of [1 / 3, 2 / 3]) {
      g.moveTo(a.x + w * k, a.y);
      g.lineTo(a.x + w * k, a.y + h);
      g.moveTo(a.x, a.y + h * k);
      g.lineTo(a.x + w, a.y + h * k);
    }
    g.stroke();
    g.fillStyle = '#fff';
    for (const [hx, hy] of [[0, 0], [0.5, 0], [1, 0], [0, 0.5], [1, 0.5], [0, 1], [0.5, 1], [1, 1]]) {
      g.fillRect(a.x + w * hx - 4, a.y + h * hy - 4, 8, 8);
    }
  }
}

// ---------------------------------------------------------------- Hilfen
function clampInt(v, lo, hi) {
  return Math.min(hi, Math.max(lo, Math.round(v)));
}
function insideRect(r, p) {
  return p.x >= r.x && p.y >= r.y && p.x <= r.x + r.w && p.y <= r.y + r.h;
}
function cropCursor(id) {
  if (!id || id === 'new') return 'crosshair';
  if (id === 'move') return 'move';
  return { n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize' }[id] || 'crosshair';
}
export function cropRatio(id, doc) {
  if (id === 'image') return doc.w / doc.h;
  const m = /^(\d+):(\d+)$/.exec(id || '');
  return m ? Number(m[1]) / Number(m[2]) : 0;
}
export { makeCanvas };

// Pixelstift und Radierer laufen über dieselben Strich-Funktionen wie der Pinsel
for (const id of ['pixel', 'eraser']) {
  for (const k of ['down', 'move', 'up']) Tools.prototype[`${k}_${id}`] = Tools.prototype[`${k}_brush`];
}
