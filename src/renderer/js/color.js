// Farben: Umrechnung (Hex, RGB, HSV) und die Farbauswahl im Seitenpanel (Feld, Farbton, Deckkraft, Hex).
// Farben werden überall als {r, g, b, a} mit 0..255 gehalten.
import { h } from './ui.js';

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const rgba = (c) => `rgba(${c.r},${c.g},${c.b},${(c.a / 255).toFixed(3)})`;
export const same = (a, b) => a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;

export function toHex(c, alpha = true) {
  const x = (v) => v.toString(16).padStart(2, '0');
  return `#${x(c.r)}${x(c.g)}${x(c.b)}${alpha && c.a < 255 ? x(c.a) : ''}`.toUpperCase();
}
export function parseHex(s) {
  let v = String(s || '').trim().replace(/^#/, '');
  if (/^[0-9a-f]{3,4}$/i.test(v)) v = [...v].map((ch) => ch + ch).join('');
  if (!/^([0-9a-f]{6}|[0-9a-f]{8})$/i.test(v)) return null;
  const n = (i) => parseInt(v.slice(i, i + 2), 16);
  return { r: n(0), g: n(2), b: n(4), a: v.length === 8 ? n(6) : 255 };
}
export function hsvToRgb(hh, s, v) {
  const f = (n) => {
    const k = (n + hh / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return { r: Math.round(f(5) * 255), g: Math.round(f(3) * 255), b: Math.round(f(1) * 255) };
}
export function rgbToHsv({ r, g, b }) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let hh = 0;
  if (d) {
    if (max === r) hh = 60 * (((g - b) / d) % 6);
    else if (max === g) hh = 60 * ((b - r) / d + 2);
    else hh = 60 * ((r - g) / d + 4);
  }
  return { h: (hh + 360) % 360, s: max ? d / max : 0, v: max };
}
export const luminance = (c) => (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;

// Farbpaletten: die Minecraft-Farben sind die 16 Farbstoffe (Wolle/Beton) aus dem Spiel
export const PALETTES = {
  basic: ['#000000', '#3f3f46', '#71717a', '#a1a1aa', '#d4d4d8', '#ffffff', '#7f1d1d', '#dc2626', '#f87171', '#ea580c', '#fb923c', '#facc15',
    '#fde68a', '#65a30d', '#22c55e', '#86efac', '#0d9488', '#06b6d4', '#7dd3fc', '#1d4ed8', '#3b82f6', '#6d28d9', '#a855f7', '#ec4899', '#f9a8d4', '#78350f', '#a16207', '#d6a77a'],
  minecraft: ['#F9FFFE', '#9D9D97', '#474F52', '#1D1D21', '#835432', '#B02E26', '#F9801D', '#FED83D', '#80C71F', '#5E7C16', '#169C9C', '#3AB3DA', '#3C44AA', '#8932B8', '#C74EBD', '#F38BAA'],
  pastel: ['#fde2e4', '#fad2e1', '#e2ece9', '#bee1e6', '#f0efeb', '#dfe7fd', '#cddafd', '#ffd6a5', '#fdffb6', '#caffbf', '#9bf6ff', '#a0c4ff', '#bdb2ff', '#ffc6ff', '#fffffc', '#e4c1f9'],
  gray: ['#000000', '#111111', '#222222', '#333333', '#444444', '#555555', '#666666', '#777777', '#888888', '#999999', '#aaaaaa', '#bbbbbb', '#cccccc', '#dddddd', '#eeeeee', '#ffffff'],
  gameboy: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'],
  pico8: ['#000000', '#1D2B53', '#7E2553', '#008751', '#AB5236', '#5F574F', '#C2C3C7', '#FFF1E8', '#FF004D', '#FFA300', '#FFEC27', '#00E436', '#29ADFF', '#83769C', '#FF77A8', '#FFCCAA'],
};

/**
 * Farbauswahl: Sättigung/Helligkeit-Feld, Farbton-Leiste, Deckkraft-Leiste, Hex/RGB-Felder.
 * onChange(color) bei jeder Änderung; set(color) von außen.
 */
export class ColorPicker {
  constructor(onChange) {
    this.onChange = onChange;
    this.hsv = { h: 0, s: 0, v: 0 };
    this.a = 255;
    this.el = h('div', { class: 'cp' });
    this.sv = h('canvas', { class: 'cp-sv', width: 240, height: 150 });
    this.svDot = h('div', { class: 'cp-dot' });
    this.hue = h('div', { class: 'cp-bar cp-hue' }, h('div', { class: 'cp-knob' }));
    this.alpha = h('div', { class: 'cp-bar cp-alpha' }, h('div', { class: 'cp-alpha-fill' }), h('div', { class: 'cp-knob' }));
    this.hex = h('input', { class: 'input cp-hex', spellcheck: 'false', maxlength: 9 });
    this.rgbIn = ['r', 'g', 'b', 'a'].map((k) => h('input', { class: 'input cp-num', type: 'number', min: 0, max: 255, 'data-k': k, title: k.toUpperCase() }));
    this.el.append(
      h('div', { class: 'cp-svwrap' }, this.sv, this.svDot),
      this.hue,
      this.alpha,
      h('div', { class: 'cp-fields' }, this.hex, ...this.rgbIn),
    );
    const drag = (el, fn) => {
      el.addEventListener('pointerdown', (e) => {
        el.setPointerCapture(e.pointerId);
        fn(e);
        const move = (ev) => fn(ev);
        const up = () => {
          el.removeEventListener('pointermove', move);
          el.removeEventListener('pointerup', up);
          this.onCommit?.();
        };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up);
      });
    };
    const frac = (e, el) => {
      const r = el.getBoundingClientRect();
      return { x: clamp((e.clientX - r.left) / r.width, 0, 1), y: clamp((e.clientY - r.top) / r.height, 0, 1) };
    };
    drag(this.sv, (e) => {
      const f = frac(e, this.sv);
      this.hsv.s = f.x;
      this.hsv.v = 1 - f.y;
      this.emit();
    });
    drag(this.hue, (e) => {
      this.hsv.h = frac(e, this.hue).x * 359.9;
      this.drawSv();
      this.emit();
    });
    drag(this.alpha, (e) => {
      this.a = Math.round(frac(e, this.alpha).x * 255);
      this.emit();
    });
    this.hex.addEventListener('change', () => {
      const c = parseHex(this.hex.value);
      if (c) this.set(c, true);
      else this.sync();
    });
    for (const inp of this.rgbIn) {
      inp.addEventListener('change', () => {
        const c = { ...this.color(), [inp.dataset.k]: clamp(Math.round(Number(inp.value) || 0), 0, 255) };
        this.set(c, true);
      });
    }
  }
  color() {
    return { ...hsvToRgb(this.hsv.h, this.hsv.s, this.hsv.v), a: this.a };
  }
  set(c, emit = false) {
    const hsv = rgbToHsv(c);
    // Grau/Schwarz: Farbton beibehalten, sonst springt die Leiste auf Rot
    if (hsv.s === 0 || hsv.v === 0) hsv.h = this.hsv.h;
    if (hsv.v === 0) hsv.s = this.hsv.s;
    this.hsv = hsv;
    this.a = c.a;
    this.drawSv();
    this.sync();
    if (emit) {
      this.onChange(this.color());
      this.onCommit?.();
    }
  }
  emit() {
    this.sync();
    this.onChange(this.color());
  }
  drawSv() {
    const g = this.sv.getContext('2d');
    const { width: w, height: hh } = this.sv;
    const base = hsvToRgb(this.hsv.h, 1, 1);
    g.fillStyle = `rgb(${base.r},${base.g},${base.b})`;
    g.fillRect(0, 0, w, hh);
    const white = g.createLinearGradient(0, 0, w, 0);
    white.addColorStop(0, '#fff');
    white.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = white;
    g.fillRect(0, 0, w, hh);
    const black = g.createLinearGradient(0, 0, 0, hh);
    black.addColorStop(0, 'rgba(0,0,0,0)');
    black.addColorStop(1, '#000');
    g.fillStyle = black;
    g.fillRect(0, 0, w, hh);
  }
  sync() {
    const c = this.color();
    this.svDot.style.left = `${this.hsv.s * 100}%`;
    this.svDot.style.top = `${(1 - this.hsv.v) * 100}%`;
    this.svDot.style.background = `rgb(${c.r},${c.g},${c.b})`;
    this.hue.querySelector('.cp-knob').style.left = `${(this.hsv.h / 360) * 100}%`;
    this.alpha.querySelector('.cp-knob').style.left = `${(this.a / 255) * 100}%`;
    this.alpha.querySelector('.cp-alpha-fill').style.background = `linear-gradient(90deg, rgba(${c.r},${c.g},${c.b},0), rgb(${c.r},${c.g},${c.b}))`;
    if (document.activeElement !== this.hex) this.hex.value = toHex(c);
    for (const inp of this.rgbIn) if (document.activeElement !== inp) inp.value = c[inp.dataset.k];
  }
}
