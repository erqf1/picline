// Picline im Browser (mert.win/pic/app): ersetzt die Brücke zum Hauptprozess (src/preload.js) durch Browser-Mittel.
// Öffnen über die Dateiauswahl (Chrome/Edge: mit Zugriff auf die Datei, dann speichert "Speichern" direkt hinein),
// sonst wird beim Speichern heruntergeladen. Einstellungen liegen im localStorage.
/* global __VERSION__ */
const KEY = 'picline-settings';
const files = new Map(); // "web:<n>:<name>" -> { file, handle }
let n = 0;
let openFiles = () => {};
const pending = [];
const fsAccess = 'showOpenFilePicker' in window;

const remember = (file, handle = null) => {
  const id = `web:${++n}:${file.name}`;
  files.set(id, { file, handle });
  return id;
};

// Als App installiert: Bilder per "Öffnen mit" (file_handlers im Manifest)
if ('launchQueue' in window) {
  window.launchQueue.setConsumer(async (params) => {
    const list = [];
    for (const fh of params.files || []) list.push(remember(await fh.getFile(), fh));
    if (list.length) {
      pending.push(...list);
      openFiles(list);
    }
  });
}

const MIME = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp', bmp: 'image/bmp', ico: 'image/x-icon', picline: 'application/json' };
const EXT = { png: 'png', jpeg: 'jpg', webp: 'webp', bmp: 'bmp', ico: 'ico', picline: 'picline' };

window.api = {
  web: true,
  info: async () => ({ version: typeof __VERSION__ === 'string' ? __VERSION__ : '', platform: 'web', dark: matchMedia('(prefers-color-scheme: dark)').matches, selfTest: false, fileIcons: false, pictures: '' }),
  getSettings: async () => {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || {};
    } catch {
      return {};
    }
  },
  setSettings: async (s) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      // privater Modus
    }
    return true;
  },
  initialFiles: async () => pending.splice(0),
  onOpenFiles: (cb) => {
    openFiles = cb;
  },
  onClosing: () => {},
  onSystemTheme: (cb) => matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => cb(e.matches)),
  closeNow: () => {},
  updateReady: () => {},
  setTitle: () => {},
  toggleFullscreen: () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.()),

  openDialog: async ({ multi = true } = {}) => {
    if (fsAccess) {
      try {
        const hs = await window.showOpenFilePicker({ multiple: multi, types: [{ description: 'Bilder', accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.ico', '.avif', '.svg'], 'application/json': ['.picline'] } }] });
        const out = [];
        for (const fh of hs) out.push(remember(await fh.getFile(), fh));
        return out;
      } catch {
        return [];
      }
    }
    return new Promise((resolve) => {
      const inp = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*,.picline', multiple: multi });
      inp.addEventListener('change', () => resolve([...inp.files].map((f) => remember(f))));
      inp.addEventListener('cancel', () => resolve([]));
      inp.click();
    });
  },
  saveDialog: async () => null,
  readFile: async (id) => {
    const x = files.get(id);
    if (!x) return { error: 'ENOENT' };
    return { data: new Uint8Array(await x.file.arrayBuffer()) };
  },
  writeFile: async () => ({ error: 'WEB' }),
  exists: async () => false,
  siblings: async () => [],
  pathForFile: () => null,

  /** Speichern im Browser: in die geöffnete Datei (Chrome/Edge), per "Speichern unter"-Fenster oder als Download */
  saveImage: async (doc, format, { quality, as, encode }) => {
    const base = doc.name.replace(/\.[a-z0-9]+$/i, '') || 'bild';
    const entry = doc.path && files.get(doc.path);
    if (entry?.handle?.createWritable && !as) {
      const bytes = await encode(doc, format, { quality });
      const w = await entry.handle.createWritable();
      await w.write(bytes);
      await w.close();
      return { name: doc.name, format };
    }
    if ('showSaveFilePicker' in window) {
      let handle;
      try {
        handle = await window.showSaveFilePicker({ suggestedName: `${base}.${EXT[format]}`, types: Object.keys(EXT).map((f) => ({ description: f.toUpperCase(), accept: { [MIME[f]]: [`.${EXT[f]}`] } })) });
      } catch {
        return null;
      }
      const ext = (/\.([a-z0-9]+)$/i.exec(handle.name) || [])[1]?.toLowerCase();
      const fmt = ext === 'jpg' || ext === 'jpeg' ? 'jpeg' : MIME[ext] ? ext : format;
      const bytes = await encode(doc, fmt, { quality });
      const w = await handle.createWritable();
      await w.write(bytes);
      await w.close();
      doc.path = remember(await handle.getFile(), handle);
      return { name: handle.name, format: fmt };
    }
    const bytes = await encode(doc, format, { quality });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([bytes], { type: MIME[format] })), download: `${base}.${EXT[format]}` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    return { name: a.download, format };
  },

  readClipboardImage: async () => {
    try {
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find((x) => x.startsWith('image/'));
        if (type) return new Uint8Array(await (await item.getType(type)).arrayBuffer());
      }
    } catch {
      // nicht erlaubt oder leer
    }
    return null;
  },
  writeClipboardImage: async (png) => navigator.clipboard.write([new ClipboardItem({ 'image/png': new Blob([png], { type: 'image/png' }) })]),
  writeClipboardText: (text) => navigator.clipboard.writeText(text),
  openExternal: async (url) => {
    window.open(url, '_blank', 'noopener');
  },
  reveal: async () => {},
};
