// Arbeitsfläche: zeigt das Bild mit Zoom (1 % bis 102 400 %) und Verschiebung, Schachbrett unter durchsichtigen
// Stellen, Pixelraster, Kachelvorschau, Auswahl ("Ameisenlinie") und was das Werkzeug gerade zeigen will.
// Koordinaten: "Bild" = Pixel im Bild, "Bildschirm" = CSS-Pixel im Element.
import { selectionPath } from './doc.js';

export const ZOOMS = [0.01, 0.02, 0.03, 0.05, 0.0625, 0.08, 0.1, 0.125, 0.167, 0.2, 0.25, 0.333, 0.5, 0.667, 0.75, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 16,
  20, 24, 32, 40, 48, 64, 80, 96, 128, 160, 192, 256, 320, 384, 512, 640, 768, 1024];
export const MIN_ZOOM = 0.01;
export const MAX_ZOOM = 1024;

export class View {
  constructor(host) {
    this.host = host;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'view';
    host.prepend(this.canvas);
    this.g = this.canvas.getContext('2d');
    this.doc = null;
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.cssW = 0;
    this.cssH = 0;
    this.dpr = 1;
    this.opts = { grid: true, gridMin: 8, gridEvery: 0, tile: false, checker: 'light', smoothDown: true };
    this.colors = { bg: '#202329', grid: 'rgba(128,128,128,0.38)', gridStrong: 'rgba(120,140,255,0.55)', border: 'rgba(0,0,0,0.25)' };
    this.overlays = new Set(); // (g, view) => {} - zeichnen im Bildschirm-Raster (setTransform(dpr...))
    this.onChange = null; // Zoom/Verschiebung geändert
    this.ants = 0;
    this.pending = false;
    this.makeChecker();
    new ResizeObserver(() => this.resize()).observe(host);
    // Ameisenlinie bewegen, solange es eine Auswahl gibt
    setInterval(() => {
      if (this.doc?.selection && !document.hidden) {
        this.ants = (this.ants + 1) % 16;
        this.render();
      }
    }, 110);
  }

  makeChecker() {
    const c = document.createElement('canvas');
    c.width = c.height = 16;
    const g = c.getContext('2d');
    const [a, b] = this.opts.checker === 'dark' ? ['#3a3d45', '#2e3138'] : ['#ffffff', '#d9dce3'];
    g.fillStyle = a;
    g.fillRect(0, 0, 16, 16);
    g.fillStyle = b;
    g.fillRect(0, 0, 8, 8);
    g.fillRect(8, 8, 8, 8);
    this.checker = this.g.createPattern(c, 'repeat');
  }
  setOptions(o) {
    const checker = o.checker && o.checker !== this.opts.checker;
    Object.assign(this.opts, o);
    if (checker) this.makeChecker();
    this.render();
  }
  setColors(c) {
    Object.assign(this.colors, c);
    this.render();
  }

  setDoc(doc) {
    if (this.doc) this.doc.view = { zoom: this.zoom, panX: this.panX, panY: this.panY };
    this.doc = doc;
    if (doc?.view) Object.assign(this, doc.view);
    else if (doc) this.fit();
    this.render();
    this.onChange?.();
  }
  resize() {
    const r = this.host.getBoundingClientRect();
    const oldW = this.cssW;
    const oldH = this.cssH;
    this.cssW = Math.max(1, r.width);
    this.cssH = Math.max(1, r.height);
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(this.cssW * this.dpr);
    this.canvas.height = Math.round(this.cssH * this.dpr);
    this.canvas.style.width = `${this.cssW}px`;
    this.canvas.style.height = `${this.cssH}px`;
    this.makeChecker();
    if (this.doc && oldW > 1) {
      // Mitte bleibt Mitte
      this.panX += (this.cssW - oldW) / 2;
      this.panY += (this.cssH - oldH) / 2;
    } else if (this.doc) this.fit();
    this.draw();
  }

  // ---------------------------------------------------------------- Zoom und Verschiebung
  fitZoom(pad = 36) {
    const d = this.doc;
    let z = Math.min((this.cssW - pad * 2) / d.w, (this.cssH - pad * 2) / d.h);
    // kleine Bilder (z. B. 16x16-Texturen) groß und mit ganzzahligem Faktor zeigen - bleibt scharf
    if (z > 1) z = Math.min(64, Math.floor(z));
    return Math.max(MIN_ZOOM, z);
  }
  /** animate: weich hingleiten (Knöpfe, Tasten), sonst sofort (neues Bild, Fenstergröße) */
  fit(animate = false) {
    if (!this.doc) return;
    const z = this.fitZoom();
    const px = Math.round((this.cssW - this.doc.w * z) / 2);
    const py = Math.round((this.cssH - this.doc.h * z) / 2);
    if (animate) return this.animateTo(z, px, py);
    this.stopAnim();
    this.zoom = z;
    this.center();
  }
  center() {
    this.panX = Math.round((this.cssW - this.doc.w * this.zoom) / 2);
    this.panY = Math.round((this.cssH - this.doc.h * this.zoom) / 2);
    this.render();
    this.onChange?.();
  }
  setZoom(z, cx = this.cssW / 2, cy = this.cssH / 2) {
    this.stopAnim();
    z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
    const dx = (cx - this.panX) / this.zoom;
    const dy = (cy - this.panY) / this.zoom;
    this.zoom = z;
    this.panX = cx - dx * z;
    this.panY = cy - dy * z;
    // bei ganzzahligem Zoom auf ganze Bildschirmpixel legen, sonst werden Pixel ungleich breit
    if (z >= 1) {
      this.panX = Math.round(this.panX);
      this.panY = Math.round(this.panY);
    }
    this.clampPan();
    this.render();
    this.onChange?.();
  }
  zoomStep(dir, cx = this.cssW / 2, cy = this.cssH / 2) {
    // läuft schon eine Zoom-Bewegung, vom Ziel aus weiterzählen (schnelles Drücken summiert sich)
    const z = this.anim?.mode === 'anchor' ? this.anim.target : this.zoom;
    const next = dir > 0 ? ZOOMS.find((v) => v > z * 1.001) : [...ZOOMS].reverse().find((v) => v < z / 1.001);
    if (next) this.zoomSmooth(next, cx, cy);
  }
  /** Mausrad: stufenlos um einen Faktor, weich animiert */
  zoomBy(factor, cx, cy) {
    const z = this.anim?.mode === 'anchor' ? this.anim.target : this.zoom;
    this.zoomSmooth(z * factor, cx, cy);
  }

  // ---------------------------------------------------------------- weiches Zoomen
  // Der Bildpunkt unter (cx, cy) bleibt in jedem Bild genau dort; der Zoom gleitet logarithmisch zum Ziel.
  zoomSmooth(target, cx = this.cssW / 2, cy = this.cssH / 2) {
    if (!this.doc) return;
    target = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, target));
    const p = this.toDoc(cx, cy);
    this.anim = { mode: 'anchor', target, cx, cy, dx: p.x, dy: p.y };
    this.runAnim();
  }
  animateTo(zoom, panX, panY) {
    this.anim = { mode: 'free', target: zoom, panX, panY };
    this.runAnim();
  }
  stopAnim() {
    this.anim = null;
  }
  runAnim() {
    if (this.animating) return;
    this.animating = true;
    let last = performance.now();
    // nächstes Bild: per requestAnimationFrame, zur Sicherheit auch per Zeitgeber (versteckte/gedrosselte Fenster)
    let pending = false;
    const schedule = () => {
      if (pending) return;
      pending = true;
      let fired = false;
      const go = () => {
        if (fired) return;
        fired = true;
        pending = false;
        step(performance.now());
      };
      requestAnimationFrame(go);
      setTimeout(go, 34);
    };
    const step = (now) => {
      const a = this.anim;
      if (!a || !this.doc) {
        this.animating = false;
        return;
      }
      const dt = Math.min(48, now - last);
      last = now;
      const k = 1 - Math.exp(-dt / 55);
      const lz = Math.log(this.zoom);
      const lt = Math.log(a.target);
      const zoomDone = Math.abs(lt - lz) < 0.003;
      this.zoom = zoomDone ? a.target : Math.exp(lz + (lt - lz) * k);
      let done = zoomDone;
      if (a.mode === 'anchor') {
        this.panX = a.cx - a.dx * this.zoom;
        this.panY = a.cy - a.dy * this.zoom;
      } else {
        const ex = a.panX - this.panX;
        const ey = a.panY - this.panY;
        const panDone = Math.abs(ex) < 0.5 && Math.abs(ey) < 0.5;
        this.panX = panDone ? a.panX : this.panX + ex * k;
        this.panY = panDone ? a.panY : this.panY + ey * k;
        done = zoomDone && panDone;
      }
      if (done) {
        // am Ende auf ganze Bildschirmpixel legen, sonst werden Bildpixel ungleich breit
        if (this.zoom >= 1) {
          this.panX = Math.round(this.panX);
          this.panY = Math.round(this.panY);
        }
        this.clampPan();
        this.anim = null;
        this.animating = false;
      }
      this.draw();
      this.onChange?.();
      if (!done) schedule();
    };
    schedule();
  }
  panBy(dx, dy) {
    this.stopAnim();
    this.panX += dx;
    this.panY += dy;
    this.clampPan();
    this.render();
    this.onChange?.();
  }
  /** Das Bild nie ganz aus dem Blick schieben */
  clampPan() {
    if (!this.doc) return;
    const w = this.doc.w * this.zoom;
    const hh = this.doc.h * this.zoom;
    const keep = 48;
    this.panX = Math.min(this.cssW - keep, Math.max(keep - w, this.panX));
    this.panY = Math.min(this.cssH - keep, Math.max(keep - hh, this.panY));
  }
  toDoc(sx, sy) {
    return { x: (sx - this.panX) / this.zoom, y: (sy - this.panY) / this.zoom };
  }
  toScreen(x, y) {
    return { x: this.panX + x * this.zoom, y: this.panY + y * this.zoom };
  }
  /** Bildschirm-Koordinaten eines Ereignisses */
  local(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  /** Im Bildschirm-Raster zeichnen, Koordinaten in Bild-Pixeln */
  docTransform(g = this.g) {
    const k = this.dpr * this.zoom;
    g.setTransform(k, 0, 0, k, this.panX * this.dpr, this.panY * this.dpr);
  }
  screenTransform(g = this.g) {
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  // ---------------------------------------------------------------- Zeichnen
  render() {
    if (this.pending) return;
    this.pending = true;
    requestAnimationFrame(() => {
      this.pending = false;
      this.draw();
    });
  }
  draw() {
    const g = this.g;
    const dpr = this.dpr;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = this.colors.bg;
    g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const d = this.doc;
    if (!d) return;
    const z = this.zoom;
    const comp = d.composite();
    const sw = d.w * z;
    const sh = d.h * z;
    this.screenTransform();

    if (this.opts.tile) {
      // Kachelvorschau: das Bild noch achtmal drumherum (für nahtlose Texturen)
      for (let ty = -1; ty <= 1; ty++) {
        for (let tx = -1; tx <= 1; tx++) {
          if (!tx && !ty) continue;
          this.drawImageAt(comp, this.panX + tx * sw, this.panY + ty * sh, true);
        }
      }
    } else {
      g.save();
      g.shadowColor = 'rgba(0,0,0,0.32)';
      g.shadowBlur = 16;
      g.shadowOffsetY = 2;
      g.fillStyle = '#808080';
      g.fillRect(this.panX, this.panY, sw, sh);
      g.restore();
    }
    this.drawImageAt(comp, this.panX, this.panY, false);

    // Pixelraster und Raster alle N Pixel
    const vis = this.visibleRect();
    if (vis) {
      if (this.opts.grid && z >= this.opts.gridMin) this.drawGrid(vis, 1, this.colors.grid);
      const n = this.opts.gridEvery;
      if (n > 1 && z * n >= 6) this.drawGrid(vis, n, this.colors.gridStrong);
    }
    if (this.opts.tile) {
      this.screenTransform();
      g.strokeStyle = this.colors.gridStrong;
      g.setLineDash([5, 4]);
      g.lineWidth = 1;
      g.strokeRect(Math.round(this.panX) + 0.5, Math.round(this.panY) + 0.5, Math.round(sw) - 1, Math.round(sh) - 1);
      g.setLineDash([]);
    }

    for (const fn of this.overlays) {
      g.save();
      try {
        fn(g, this);
      } finally {
        g.restore();
      }
    }

    if (d.selection) this.drawSelection(d.selection);
    g.setTransform(1, 0, 0, 1, 0, 0);
    void dpr;
  }
  /** sichtbarer Ausschnitt in ganzen Bild-Pixeln */
  visibleRect() {
    const d = this.doc;
    const z = this.zoom;
    const x0 = Math.max(0, Math.floor(-this.panX / z));
    const y0 = Math.max(0, Math.floor(-this.panY / z));
    const x1 = Math.min(d.w, Math.ceil((this.cssW - this.panX) / z));
    const y1 = Math.min(d.h, Math.ceil((this.cssH - this.panY) / z));
    return x1 > x0 && y1 > y0 ? { x0, y0, x1, y1 } : null;
  }
  /** Bild an Bildschirmposition (ox, oy) zeichnen - nur den sichtbaren Teil, in Geräte-Pixeln gerundet */
  drawImageAt(src, ox, oy, faded) {
    const g = this.g;
    const dpr = this.dpr;
    const d = this.doc;
    const z = this.zoom;
    const x0 = Math.max(0, Math.floor(-ox / z));
    const y0 = Math.max(0, Math.floor(-oy / z));
    const x1 = Math.min(d.w, Math.ceil((this.cssW - ox) / z));
    const y1 = Math.min(d.h, Math.ceil((this.cssH - oy) / z));
    if (x1 <= x0 || y1 <= y0) return;
    const dx0 = Math.round((ox + x0 * z) * dpr);
    const dy0 = Math.round((oy + y0 * z) * dpr);
    const dx1 = Math.round((ox + x1 * z) * dpr);
    const dy1 = Math.round((oy + y1 * z) * dpr);
    g.setTransform(1, 0, 0, 1, 0, 0);
    // Schachbrett unter durchsichtigen Stellen (bleibt beim Zoomen gleich groß)
    g.fillStyle = this.checker;
    g.fillRect(dx0, dy0, dx1 - dx0, dy1 - dy0);
    g.imageSmoothingEnabled = z < 1 && this.opts.smoothDown;
    g.imageSmoothingQuality = 'high';
    if (faded) g.globalAlpha = 0.92;
    g.drawImage(src, x0, y0, x1 - x0, y1 - y0, dx0, dy0, dx1 - dx0, dy1 - dy0);
    g.globalAlpha = 1;
    this.screenTransform();
  }
  drawGrid(vis, step, color) {
    const g = this.g;
    const dpr = this.dpr;
    const z = this.zoom;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.beginPath();
    const top = Math.round((this.panY + vis.y0 * z) * dpr);
    const bottom = Math.round((this.panY + vis.y1 * z) * dpr);
    const left = Math.round((this.panX + vis.x0 * z) * dpr);
    const right = Math.round((this.panX + vis.x1 * z) * dpr);
    for (let x = Math.ceil(vis.x0 / step) * step; x <= vis.x1; x += step) {
      const sx = Math.round((this.panX + x * z) * dpr) + 0.5;
      g.moveTo(sx, top);
      g.lineTo(sx, bottom);
    }
    for (let y = Math.ceil(vis.y0 / step) * step; y <= vis.y1; y += step) {
      const sy = Math.round((this.panY + y * z) * dpr) + 0.5;
      g.moveTo(left, sy);
      g.lineTo(right, sy);
    }
    g.strokeStyle = color;
    g.lineWidth = 1;
    g.stroke();
    this.screenTransform();
  }
  /** Ameisenlinie um die Auswahl (schwarz-weiß gestrichelt, wandert) */
  drawSelection(sel) {
    const g = this.g;
    this.screenTransform();
    const s = this.toScreen(sel.x, sel.y);
    const shape = { type: sel.type, x: Math.round(s.x) + 0.5, y: Math.round(s.y) + 0.5, w: Math.round(sel.w * this.zoom) - 1, h: Math.round(sel.h * this.zoom) - 1 };
    selectionPath(g, shape);
    g.lineWidth = 1;
    g.strokeStyle = '#ffffff';
    g.setLineDash([]);
    g.stroke();
    g.strokeStyle = '#000000';
    g.setLineDash([4, 4]);
    g.lineDashOffset = -this.ants;
    g.stroke();
    g.setLineDash([]);
  }
}
