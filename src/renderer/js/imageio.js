// Bilder lesen und schreiben. Lesen kann alles, was Chromium kennt (PNG, JPG, WebP, GIF, BMP, ICO, AVIF, SVG),
// schreiben PNG, JPG, WebP, BMP, ICO und das eigene Projektformat .picline (behält Ebenen).
import { Doc, Layer, makeCanvas } from './doc.js';

export const OPEN_EXT = ['png', 'jpg', 'jpeg', 'jfif', 'webp', 'gif', 'bmp', 'ico', 'cur', 'avif', 'svg', 'picline'];
export const SAVE_FORMATS = {
  png: { ext: 'png', mime: 'image/png', name: 'PNG' },
  jpeg: { ext: 'jpg', mime: 'image/jpeg', name: 'JPG', lossy: true },
  webp: { ext: 'webp', mime: 'image/webp', name: 'WebP', lossy: true },
  bmp: { ext: 'bmp', mime: 'image/bmp', name: 'BMP' },
  ico: { ext: 'ico', mime: 'image/x-icon', name: 'ICO' },
  picline: { ext: 'picline', mime: 'application/json', name: 'Picline' },
};
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', jfif: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp', ico: 'image/x-icon', cur: 'image/x-icon', avif: 'image/avif', svg: 'image/svg+xml' };

export const extOf = (name) => (/\.([a-z0-9]+)$/i.exec(name || '') || [])[1]?.toLowerCase() || '';
export function formatForExt(ext) {
  if (ext === 'jpg' || ext === 'jpeg' || ext === 'jfif') return 'jpeg';
  if (ext === 'cur') return 'ico';
  return SAVE_FORMATS[ext] ? ext : 'png';
}

function sniff(bytes) {
  const b = bytes;
  if (b[0] === 0x89 && b[1] === 0x50) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b[0] === 0x47 && b[1] === 0x49) return 'image/gif';
  if (b[0] === 0x42 && b[1] === 0x4d) return 'image/bmp';
  if (b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57 && b[9] === 0x45) return 'image/webp';
  if (b[0] === 0 && b[1] === 0 && (b[2] === 1 || b[2] === 2) && b[3] === 0) return 'image/x-icon';
  return null;
}

async function bitmapFrom(blob) {
  try {
    return await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'default' });
  } catch {
    // SVG und manches andere nur über ein <img>
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (!w || !h) {
        w = 512;
        h = 512;
      }
      const c = makeCanvas(w, h);
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      return c;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/** Datei (Bytes) zu einem Bild-Dokument. name nur für die Endung und den Titel. */
export async function decode(bytes, name, layerName) {
  const ext = extOf(name);
  if (ext === 'picline' || (bytes[0] === 0x7b && /"app"\s*:\s*"Picline"/.test(new TextDecoder().decode(bytes.subarray(0, 200))))) return readProject(bytes, name);
  const type = sniff(bytes) || MIME[ext] || 'image/png';
  const bmp = await bitmapFrom(new Blob([bytes], { type }));
  const doc = new Doc(bmp.width, bmp.height, name);
  const l = new Layer(bmp.width, bmp.height, layerName);
  l.ctx.drawImage(bmp, 0, 0);
  bmp.close?.();
  doc.layers.push(l);
  doc.format = formatForExt(ext || type.split('/')[1]);
  return doc;
}
/** Bild aus Bytes als Canvas (zum Einfügen) */
export async function decodeCanvas(bytes, name = '') {
  const type = sniff(bytes) || MIME[extOf(name)] || 'image/png';
  const bmp = await bitmapFrom(new Blob([bytes], { type }));
  const c = makeCanvas(bmp.width, bmp.height);
  c.getContext('2d').drawImage(bmp, 0, 0);
  bmp.close?.();
  return c;
}

const toBlob = (canvas, mime, q) => new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('encode'))), mime, q));
const bytesOf = async (blob) => new Uint8Array(await blob.arrayBuffer());

/** Dokument in ein Dateiformat. o: { quality (0..1), bg (für JPG) } */
export async function encode(doc, format, o = {}) {
  if (format === 'picline') return writeProject(doc);
  if (format === 'jpeg') return bytesOf(await toBlob(doc.flatten(o.bg || '#ffffff'), 'image/jpeg', o.quality ?? 0.92));
  if (format === 'webp') return bytesOf(await toBlob(doc.flatten(), 'image/webp', o.quality ?? 0.92));
  if (format === 'bmp') return encodeBmp(doc.flatten());
  if (format === 'ico') return encodeIco(doc.flatten());
  return bytesOf(await toBlob(doc.flatten(), 'image/png'));
}
export async function canvasToPng(canvas) {
  return bytesOf(await toBlob(canvas, 'image/png'));
}

// ---------------------------------------------------------------- BMP (24 Bit ohne, 32 Bit mit Durchsichtigkeit)
export function encodeBmp(canvas) {
  const w = canvas.width;
  const h = canvas.height;
  const px = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  let alpha = false;
  for (let i = 3; i < px.length; i += 4) {
    if (px[i] !== 255) {
      alpha = true;
      break;
    }
  }
  const bpp = alpha ? 32 : 24;
  const row = alpha ? w * 4 : (w * 3 + 3) & ~3;
  const head = alpha ? 108 : 40; // BITMAPV4HEADER mit Farbmasken, sonst BITMAPINFOHEADER
  const off = 14 + head;
  const buf = new ArrayBuffer(off + row * h);
  const v = new DataView(buf);
  v.setUint16(0, 0x4d42, true);
  v.setUint32(2, buf.byteLength, true);
  v.setUint32(10, off, true);
  v.setUint32(14, head, true);
  v.setInt32(18, w, true);
  v.setInt32(22, h, true); // positiv = von unten nach oben
  v.setUint16(26, 1, true);
  v.setUint16(28, bpp, true);
  v.setUint32(30, alpha ? 3 : 0, true); // BI_BITFIELDS / BI_RGB
  v.setUint32(34, row * h, true);
  v.setUint32(38, 2835, true);
  v.setUint32(42, 2835, true);
  if (alpha) {
    v.setUint32(54, 0x00ff0000, true);
    v.setUint32(58, 0x0000ff00, true);
    v.setUint32(62, 0x000000ff, true);
    v.setUint32(66, 0xff000000, true);
    v.setUint32(70, 0x57696e20, true); // 'Win ' = sRGB
  }
  const out = new Uint8Array(buf);
  for (let y = 0; y < h; y++) {
    let o = off + (h - 1 - y) * row;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      out[o++] = px[i + 2];
      out[o++] = px[i + 1];
      out[o++] = px[i];
      if (alpha) out[o++] = px[i + 3];
    }
  }
  return out;
}

// ---------------------------------------------------------------- ICO (mehrere Größen, je als PNG)
export async function encodeIco(canvas, sizes = [16, 24, 32, 48, 64, 128, 256]) {
  const src = canvas;
  const max = Math.max(src.width, src.height);
  const entries = [];
  for (const s of sizes) {
    const c = makeCanvas(s, s);
    const g = c.getContext('2d');
    // Pixelgrafik (klein) beim Vergrößern scharf lassen, große Bilder weich verkleinern
    g.imageSmoothingEnabled = max > s;
    g.imageSmoothingQuality = 'high';
    const k = s / max;
    const w = Math.round(src.width * k);
    const h = Math.round(src.height * k);
    g.drawImage(src, Math.floor((s - w) / 2), Math.floor((s - h) / 2), w, h);
    entries.push([s, await canvasToPng(c)]);
  }
  const headLen = 6 + 16 * entries.length;
  const total = headLen + entries.reduce((n, [, b]) => n + b.length, 0);
  const out = new Uint8Array(total);
  const v = new DataView(out.buffer);
  v.setUint16(2, 1, true);
  v.setUint16(4, entries.length, true);
  let off = headLen;
  entries.forEach(([s, png], i) => {
    const e = 6 + i * 16;
    out[e] = s >= 256 ? 0 : s;
    out[e + 1] = s >= 256 ? 0 : s;
    v.setUint16(e + 4, 1, true);
    v.setUint16(e + 6, 32, true);
    v.setUint32(e + 8, png.length, true);
    v.setUint32(e + 12, off, true);
    out.set(png, off);
    off += png.length;
  });
  return out;
}

// ---------------------------------------------------------------- Projektdatei .picline (JSON, Ebenen als PNG)
function b64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function unb64(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export async function writeProject(doc) {
  const layers = [];
  for (const l of doc.layers) {
    layers.push({ name: l.name, visible: l.visible, opacity: l.opacity, blend: l.blend, locked: l.locked, png: b64(await canvasToPng(l.canvas)) });
  }
  const json = JSON.stringify({ app: 'Picline', version: 1, w: doc.w, h: doc.h, active: doc.active, layers });
  return new TextEncoder().encode(json);
}
export async function readProject(bytes, name) {
  const p = JSON.parse(new TextDecoder().decode(bytes));
  if (p.app !== 'Picline' || !p.w || !p.h || !Array.isArray(p.layers)) throw new Error('kein Picline-Projekt');
  const doc = new Doc(p.w, p.h, name);
  for (const x of p.layers) {
    const l = new Layer(p.w, p.h, String(x.name || 'Ebene'));
    const bmp = await createImageBitmap(new Blob([unb64(x.png)], { type: 'image/png' }), { premultiplyAlpha: 'none' });
    l.ctx.drawImage(bmp, 0, 0);
    bmp.close?.();
    Object.assign(l, { visible: x.visible !== false, opacity: Math.min(1, Math.max(0, Number(x.opacity ?? 1))), blend: x.blend || 'source-over', locked: !!x.locked });
    doc.layers.push(l);
  }
  if (!doc.layers.length) doc.layers.push(new Layer(p.w, p.h, 'Ebene 1'));
  doc.active = Math.min(doc.layers.length - 1, Math.max(0, p.active | 0));
  doc.format = 'picline';
  return doc;
}
