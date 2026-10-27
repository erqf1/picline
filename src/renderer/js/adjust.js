// Effekte und Farbkorrekturen auf Pixeln (laufen überall gleich, auch in Safari ohne canvas.filter).
// Jeder Effekt bekommt ein Canvas und liefert ein neues. Parameter beschreiben die Regler im Dialog.
import { makeCanvas } from './doc.js';

const clamp8 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

function pixels(src, fn) {
  const c = makeCanvas(src.width, src.height);
  const g = c.getContext('2d');
  g.drawImage(src, 0, 0);
  const img = g.getImageData(0, 0, c.width, c.height);
  fn(img.data, c.width, c.height);
  g.putImageData(img, 0, 0);
  return c;
}

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
}
function hslToRgb(h, s, l) {
  if (!s) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

/** Weichzeichnen: dreimal Kastenfilter (fast wie Gauß), Durchsichtigkeit wird mitgerechnet */
function boxBlur(src, radius) {
  const r = Math.round(radius);
  if (r < 1) return pixels(src, () => {});
  return pixels(src, (d, w, h) => {
    // vormultipliziert rechnen, sonst bekommen durchsichtige Ränder dunkle Säume
    const n = w * h;
    const a = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const al = d[i * 4 + 3] / 255;
      a[i * 4] = d[i * 4] * al;
      a[i * 4 + 1] = d[i * 4 + 1] * al;
      a[i * 4 + 2] = d[i * 4 + 2] * al;
      a[i * 4 + 3] = d[i * 4 + 3];
    }
    const tmp = new Float32Array(n * 4);
    const pass = (from, to, horiz) => {
      const len = horiz ? w : h;
      const lines = horiz ? h : w;
      const k = 1 / (r * 2 + 1);
      for (let line = 0; line < lines; line++) {
        const idx = (i) => (horiz ? line * w + i : i * w + line) * 4;
        const acc = [0, 0, 0, 0];
        for (let i = -r; i <= r; i++) {
          const j = idx(Math.min(len - 1, Math.max(0, i)));
          for (let ch = 0; ch < 4; ch++) acc[ch] += from[j + ch];
        }
        for (let i = 0; i < len; i++) {
          const o = idx(i);
          for (let ch = 0; ch < 4; ch++) to[o + ch] = acc[ch] * k;
          const add = idx(Math.min(len - 1, i + r + 1));
          const sub = idx(Math.max(0, i - r));
          for (let ch = 0; ch < 4; ch++) acc[ch] += from[add + ch] - from[sub + ch];
        }
      }
    };
    for (let it = 0; it < 3; it++) {
      pass(a, tmp, true);
      pass(tmp, a, false);
    }
    for (let i = 0; i < n; i++) {
      const al = a[i * 4 + 3];
      const inv = al > 0 ? 255 / al : 0;
      d[i * 4] = clamp8(a[i * 4] * inv);
      d[i * 4 + 1] = clamp8(a[i * 4 + 1] * inv);
      d[i * 4 + 2] = clamp8(a[i * 4 + 2] * inv);
      d[i * 4 + 3] = clamp8(al);
    }
  });
}

export const EFFECTS = {
  grayscale: { apply: (c) => pixels(c, (d) => {
    for (let i = 0; i < d.length; i += 4) {
      const y = d[i] * 0.2126 + d[i + 1] * 0.7152 + d[i + 2] * 0.0722;
      d[i] = d[i + 1] = d[i + 2] = y;
    }
  }) },
  invert: { apply: (c) => pixels(c, (d) => {
    for (let i = 0; i < d.length; i += 4) {
      d[i] = 255 - d[i];
      d[i + 1] = 255 - d[i + 1];
      d[i + 2] = 255 - d[i + 2];
    }
  }) },
  sepia: { apply: (c) => pixels(c, (d) => {
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      d[i] = clamp8(r * 0.393 + g * 0.769 + b * 0.189);
      d[i + 1] = clamp8(r * 0.349 + g * 0.686 + b * 0.168);
      d[i + 2] = clamp8(r * 0.272 + g * 0.534 + b * 0.131);
    }
  }) },
  brightness: {
    params: [{ k: 'brightness', min: -100, max: 100, def: 0 }, { k: 'contrast', min: -100, max: 100, def: 0 }],
    apply: (c, p) => pixels(c, (d) => {
      const b = p.brightness * 2.55;
      const k = p.contrast >= 0 ? 1 + p.contrast / 40 : 1 + p.contrast / 100;
      for (let i = 0; i < d.length; i += 4) {
        for (let ch = 0; ch < 3; ch++) d[i + ch] = clamp8((d[i + ch] - 128) * k + 128 + b);
      }
    }),
  },
  hue: {
    params: [{ k: 'hue', min: -180, max: 180, def: 0 }, { k: 'saturation', min: -100, max: 100, def: 0 }, { k: 'lightness', min: -100, max: 100, def: 0 }],
    apply: (c, p) => pixels(c, (d) => {
      const dh = p.hue / 360;
      const ks = 1 + p.saturation / 100;
      const dl = p.lightness / 100;
      for (let i = 0; i < d.length; i += 4) {
        if (!d[i + 3]) continue;
        let [h, s, l] = rgbToHsl(d[i], d[i + 1], d[i + 2]);
        h = (h + dh + 1) % 1;
        s = Math.min(1, Math.max(0, s * ks));
        l = dl >= 0 ? l + (1 - l) * dl : l * (1 + dl);
        const [r, g, b] = hslToRgb(h, s, l);
        d[i] = r;
        d[i + 1] = g;
        d[i + 2] = b;
      }
    }),
  },
  blur: { params: [{ k: 'radius', min: 1, max: 40, def: 3 }], apply: (c, p) => boxBlur(c, p.radius / 1.6) },
  sharpen: {
    params: [{ k: 'amount', min: 10, max: 300, def: 80 }],
    apply: (c, p) => {
      // unscharf maskieren: Original + (Original - Weich) * Stärke
      const soft = boxBlur(c, 1.2).getContext('2d').getImageData(0, 0, c.width, c.height).data;
      const k = p.amount / 100;
      return pixels(c, (d) => {
        for (let i = 0; i < d.length; i += 4) for (let ch = 0; ch < 3; ch++) d[i + ch] = clamp8(d[i + ch] + (d[i + ch] - soft[i + ch]) * k);
      });
    },
  },
  pixelate: {
    params: [{ k: 'block', min: 2, max: 64, def: 8 }],
    apply: (c, p) => pixels(c, (d, w, h) => {
      const s = p.block;
      for (let by = 0; by < h; by += s) {
        for (let bx = 0; bx < w; bx += s) {
          let r = 0, g = 0, b = 0, a = 0, n = 0;
          for (let y = by; y < Math.min(h, by + s); y++) {
            for (let x = bx; x < Math.min(w, bx + s); x++) {
              const i = (y * w + x) * 4;
              const al = d[i + 3];
              r += d[i] * al;
              g += d[i + 1] * al;
              b += d[i + 2] * al;
              a += al;
              n++;
            }
          }
          const avgA = a / n;
          const col = a ? [r / a, g / a, b / a] : [0, 0, 0];
          for (let y = by; y < Math.min(h, by + s); y++) {
            for (let x = bx; x < Math.min(w, bx + s); x++) {
              const i = (y * w + x) * 4;
              d[i] = col[0];
              d[i + 1] = col[1];
              d[i + 2] = col[2];
              d[i + 3] = avgA;
            }
          }
        }
      }
    }),
  },
  posterize: {
    params: [{ k: 'levels', min: 2, max: 16, def: 4 }],
    apply: (c, p) => pixels(c, (d) => {
      const n = p.levels - 1;
      for (let i = 0; i < d.length; i += 4) for (let ch = 0; ch < 3; ch++) d[i + ch] = Math.round((Math.round((d[i + ch] / 255) * n) / n) * 255);
    }),
  },
  threshold: {
    params: [{ k: 'level', min: 1, max: 254, def: 128 }],
    apply: (c, p) => pixels(c, (d) => {
      for (let i = 0; i < d.length; i += 4) {
        const v = d[i] * 0.2126 + d[i + 1] * 0.7152 + d[i + 2] * 0.0722 >= p.level ? 255 : 0;
        d[i] = d[i + 1] = d[i + 2] = v;
      }
    }),
  },
  noise: {
    params: [{ k: 'amount', min: 1, max: 100, def: 20 }],
    apply: (c, p) => pixels(c, (d) => {
      const a = p.amount * 1.28;
      for (let i = 0; i < d.length; i += 4) {
        if (!d[i + 3]) continue;
        const n = (Math.random() - 0.5) * a;
        for (let ch = 0; ch < 3; ch++) d[i + ch] = clamp8(d[i + ch] + n);
      }
    }),
  },
  // Umriss um alles Nicht-Durchsichtige (Pixelgrafik, Sticker) in der Hauptfarbe
  outline: {
    params: [{ k: 'thickness', min: 1, max: 16, def: 1 }],
    color: true,
    apply: (c, p, color) => pixels(c, (d, w, h) => {
      const t = p.thickness;
      const solid = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) solid[i] = d[i * 4 + 3] >= 128 ? 1 : 0;
      const offs = [];
      for (let y = -t; y <= t; y++) for (let x = -t; x <= t; x++) if ((x || y) && (t === 1 ? Math.abs(x) + Math.abs(y) <= 1 : x * x + y * y <= t * t + 0.5)) offs.push([x, y]);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          if (solid[i]) continue;
          for (const [ox, oy] of offs) {
            const xx = x + ox;
            const yy = y + oy;
            if (xx >= 0 && yy >= 0 && xx < w && yy < h && solid[yy * w + xx]) {
              d[i * 4] = color.r;
              d[i * 4 + 1] = color.g;
              d[i * 4 + 2] = color.b;
              d[i * 4 + 3] = color.a;
              break;
            }
          }
        }
      }
    }),
  },
};
