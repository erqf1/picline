// Ein offenes Bild: Ebenen (je ein Canvas), Auswahl, Verlauf zum Rückgängigmachen und Datei-Infos.
// Pixel-Änderungen merken sich nur den geänderten Ausschnitt (vorher/nachher), Umbauten am ganzen Bild
// (Größe, Drehen, Ebenen) eine Kopie aller Ebenen.
let nextId = 1;
const MEMORY = 768 * 1024 * 1024; // so viel darf der Verlauf ungefähr belegen

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}
export function cloneCanvas(src) {
  const c = makeCanvas(src.width, src.height);
  c.getContext('2d').drawImage(src, 0, 0);
  return c;
}
export function clampRect(r, w, h) {
  if (!r) return null;
  const x0 = Math.max(0, Math.floor(r.x));
  const y0 = Math.max(0, Math.floor(r.y));
  const x1 = Math.min(w, Math.ceil(r.x + r.w));
  const y1 = Math.min(h, Math.ceil(r.y + r.h));
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}
export function unionRect(a, b) {
  if (!a) return b;
  if (!b) return a;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}
/** Pfad der Auswahl (Rechteck oder Ellipse) - zum Beschneiden und für die Ameisenlinie */
export function selectionPath(g, sel) {
  g.beginPath();
  if (sel.type === 'ellipse') g.ellipse(sel.x + sel.w / 2, sel.y + sel.h / 2, sel.w / 2, sel.h / 2, 0, 0, Math.PI * 2);
  else g.rect(sel.x, sel.y, sel.w, sel.h);
}
export function inSelection(sel, x, y) {
  if (!sel) return true;
  if (sel.type === 'ellipse') {
    const rx = sel.w / 2;
    const ry = sel.h / 2;
    const dx = (x - sel.x - rx) / rx;
    const dy = (y - sel.y - ry) / ry;
    return dx * dx + dy * dy <= 1;
  }
  return x >= sel.x && y >= sel.y && x < sel.x + sel.w && y < sel.y + sel.h;
}
function sameData(a, b) {
  const x = new Uint32Array(a.data.buffer);
  const y = new Uint32Array(b.data.buffer);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
}

export const BLENDS = ['source-over', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'];

export class Layer {
  constructor(w, h, name) {
    this.id = nextId++;
    this.name = name;
    this.canvas = makeCanvas(w, h);
    this.ctx = this.canvas.getContext('2d');
    this.visible = true;
    this.opacity = 1;
    this.blend = 'source-over';
    this.locked = false;
    this.preview = null; // während eines Pinselstrichs wird dieses Canvas statt canvas gezeigt
    this.version = 0; // zählt bei jeder Änderung hoch (Vorschaubildchen im Ebenen-Panel)
  }
  setCanvas(c) {
    this.canvas = c;
    this.ctx = c.getContext('2d');
    this.version++;
  }
}

export class Doc {
  constructor(w, h, name) {
    this.id = nextId++;
    this.w = Math.round(w);
    this.h = Math.round(h);
    this.name = name;
    this.layers = [];
    this.active = 0;
    this.selection = null; // { type: 'rect'|'ellipse', x, y, w, h }
    this.path = null;
    this.format = 'png';
    this.undoStack = [];
    this.redoStack = [];
    this.memory = 0;
    this.savedMark = null;
    this.forceDirty = false;
    this.view = null; // Zoom/Verschiebung je Bild
    this.comp = makeCanvas(w, h);
    this.compDirty = true;
    this.listeners = new Set();
    this.maxSteps = 100;
  }
  get layer() {
    return this.layers[this.active];
  }
  get dirty() {
    return this.forceDirty || (this.undoStack[this.undoStack.length - 1] || null) !== this.savedMark;
  }
  markSaved() {
    this.savedMark = this.undoStack[this.undoStack.length - 1] || null;
    this.forceDirty = false;
    this.changed('saved');
  }
  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  /** kind: 'pixels' | 'structure' | 'layers' | 'selection' | 'history' | 'saved' */
  changed(kind = 'pixels') {
    if (kind !== 'selection' && kind !== 'saved') this.compDirty = true;
    for (const fn of this.listeners) fn(kind);
  }
  touch(layer) {
    layer.version++;
    this.changed('pixels');
  }

  // ---------------------------------------------------------------- Ebenen
  newLayer(name, canvas) {
    const l = new Layer(this.w, this.h, name);
    if (canvas) l.ctx.drawImage(canvas, 0, 0);
    return l;
  }

  // ---------------------------------------------------------------- Verlauf
  record(entry) {
    for (const e of this.redoStack) this.memory -= e.bytes || 0;
    this.redoStack = [];
    this.undoStack.push(entry);
    this.memory += entry.bytes || 0;
    while (this.undoStack.length > 1 && (this.memory > MEMORY || this.undoStack.length > this.maxSteps)) {
      const old = this.undoStack.shift();
      this.memory -= old.bytes || 0;
      if (old === this.savedMark) this.forceDirty = true; // gespeicherter Stand ist nicht mehr erreichbar
    }
    this.changed('history');
  }
  get canUndo() {
    return this.undoStack.length > 0;
  }
  get canRedo() {
    return this.redoStack.length > 0;
  }
  undo() {
    const e = this.undoStack.pop();
    if (!e) return null;
    e.undo();
    this.redoStack.push(e);
    this.changed('history');
    return e.label;
  }
  redo() {
    const e = this.redoStack.pop();
    if (!e) return null;
    e.redo();
    this.undoStack.push(e);
    this.changed('history');
    return e.label;
  }

  /** Vor einer Pixel-Änderung an einer Ebene: Kopie merken. Danach commitPixels(token, rect, label). */
  beginPixels(layer = this.layer) {
    return { layer, before: cloneCanvas(layer.canvas) };
  }
  commitPixels(token, rect, label) {
    const { layer, before } = token;
    const r = clampRect(rect || { x: 0, y: 0, w: this.w, h: this.h }, layer.canvas.width, layer.canvas.height);
    if (!r) return false;
    const b = before.getContext('2d').getImageData(r.x, r.y, r.w, r.h);
    const a = layer.ctx.getImageData(r.x, r.y, r.w, r.h);
    if (sameData(a, b)) return false; // nichts geändert: kein Eintrag
    const put = (data) => () => {
      layer.ctx.putImageData(data, r.x, r.y);
      this.touch(layer);
    };
    this.record({ label, bytes: b.data.length * 2, undo: put(b), redo: put(a) });
    this.touch(layer);
    return true;
  }
  /** Bequem: Pixel einer Ebene ändern und als ein Schritt merken */
  editPixels(label, fn, layer = this.layer, rect = null) {
    const token = this.beginPixels(layer);
    const r = fn(layer.ctx, layer);
    return this.commitPixels(token, r || rect, label);
  }

  snapshot() {
    return {
      w: this.w,
      h: this.h,
      active: this.active,
      selection: this.selection && { ...this.selection },
      layers: this.layers.map((l) => ({ layer: l, canvas: cloneCanvas(l.canvas), name: l.name, visible: l.visible, opacity: l.opacity, blend: l.blend, locked: l.locked })),
    };
  }
  restore(s) {
    this.w = s.w;
    this.h = s.h;
    this.layers = s.layers.map((x) => {
      const l = x.layer;
      l.setCanvas(cloneCanvas(x.canvas));
      Object.assign(l, { name: x.name, visible: x.visible, opacity: x.opacity, blend: x.blend, locked: x.locked, preview: null });
      return l;
    });
    this.active = Math.min(s.active, this.layers.length - 1);
    this.selection = s.selection && { ...s.selection };
    this.changed('structure');
  }
  /** Umbau am ganzen Bild (Größe, Drehen, Ebenen hinzufügen/löschen ...) als ein Schritt */
  structural(label, fn) {
    const before = this.snapshot();
    const res = fn();
    const after = this.snapshot();
    const bytes = (s) => s.layers.reduce((n, l) => n + l.canvas.width * l.canvas.height * 4, 0);
    this.record({ label, bytes: bytes(before) + bytes(after), undo: () => this.restore(before), redo: () => this.restore(after) });
    this.changed('structure');
    return res;
  }
  /** Kleine Änderung an Ebenen-Eigenschaften (Name, Deckkraft, Sichtbarkeit, Mischmodus) */
  setLayerProp(layer, prop, value, label) {
    const old = layer[prop];
    if (old === value) return;
    const set = (v) => () => {
      layer[prop] = v;
      this.changed('layers');
    };
    set(value)();
    // Deckkraft-Regler: aufeinanderfolgende Änderungen derselben Ebene zu einem Schritt zusammenfassen
    const top = this.undoStack[this.undoStack.length - 1];
    if (top && top.merge === `${layer.id}:${prop}` && !this.redoStack.length) {
      top.redo = set(value);
      return;
    }
    this.record({ label, bytes: 64, merge: `${layer.id}:${prop}`, undo: set(old), redo: set(value) });
  }

  // ---------------------------------------------------------------- Zusammensetzen
  composite() {
    if (!this.compDirty && this.comp.width === this.w && this.comp.height === this.h) return this.comp;
    if (this.comp.width !== this.w || this.comp.height !== this.h) this.comp = makeCanvas(this.w, this.h);
    const g = this.comp.getContext('2d');
    g.clearRect(0, 0, this.w, this.h);
    for (const l of this.layers) {
      if (!l.visible || l.opacity <= 0) continue;
      g.globalAlpha = l.opacity;
      g.globalCompositeOperation = l.blend;
      g.drawImage(l.preview || l.canvas, 0, 0);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    this.compDirty = false;
    return this.comp;
  }
  /** Fertiges Bild als neues Canvas; bg = Farbe dahinter (JPG kennt keine Durchsichtigkeit) */
  flatten(bg = null) {
    const c = makeCanvas(this.w, this.h);
    const g = c.getContext('2d');
    if (bg) {
      g.fillStyle = bg;
      g.fillRect(0, 0, this.w, this.h);
    }
    g.drawImage(this.composite(), 0, 0);
    return c;
  }
  /** Rechteck um alle nicht durchsichtigen Pixel (null = Ebene leer) */
  static bounds(canvas) {
    const { width: w, height: hh } = canvas;
    const d = new Uint32Array(canvas.getContext('2d').getImageData(0, 0, w, hh).data.buffer);
    let x0 = w, y0 = hh, x1 = -1, y1 = -1;
    for (let y = 0; y < hh; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        if (d[row + x] >>> 24) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          y1 = y;
        }
      }
    }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }
}
