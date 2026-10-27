// Picline - Oberfläche: Bilder (Tabs), Menüs, Tastenkürzel, Dateien, Zwischenablage und alles, was Werkzeuge,
// Seitenpanel und Dialoge zusammenhält.
import { t as tr, LANGS } from '../../shared/i18n.js';
import { h, $, showMenu, closeMenus, menuOpen, dialog, dialogOpen, confirm, toast, keyLabel } from './ui.js';
import { icon, logoSvg } from './icons.js';
import { View, ZOOMS } from './view.js';
import { Tools, TOOLS, TOOL_KEYS, DEFAULT_OPTS } from './tools.js';
import { Doc, Layer, makeCanvas, cloneCanvas, clampRect, selectionPath } from './doc.js';
import { decode, decodeCanvas, encode, canvasToPng, OPEN_EXT, SAVE_FORMATS, extOf, formatForExt } from './imageio.js';
import { liftSelection } from './floating.js';
import { parseHex, toHex } from './color.js';
import { Side, CATS, catLabel } from './panels.js';
import * as D from './dialogs.js';
import { applyTheme } from './theme.js';

const api = window.api;
const WEB = !!api.web;
let INFO = { version: '', platform: '' };
const MAC = () => INFO.platform === 'darwin';

// ---------------------------------------------------------------- Zustand
const DEFAULTS = {
  language: null, mode: 'system', accent: '#8b5cf6', wheel: 'zoom', checker: 'light', gridMin: 8, gridEvery: 0, tile: false, jpgQuality: 92,
  fileIcons: 'auto', recent: [], palette: 'basic', recentColors: [], newW: 1280, newH: 720, newBg: 'white', smoothDown: true, panels: {},
};
export const app = {
  settings: { ...DEFAULTS },
  docs: [],
  doc: null,
  viewMode: false,
  fullscreen: false,
  /** nur schauen: Ansehen-Modus oder Vollbild */
  get looking() {
    return this.viewMode || this.fullscreen;
  },
  opts: structuredClone(DEFAULT_OPTS),
  colors: { primary: { r: 17, g: 24, b: 39, a: 255 }, secondary: { r: 255, g: 255, b: 255, a: 255 } },
  view: null,
  tools: null,
  side: null,
  t: (key, vars) => tr(app.settings.language || 'en', key, vars),
  toast: (text, o) => toast(text, o),
};
const t = (k, v) => app.t(k, v);

let saveTimer = null;
function saveSettings() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    api.setSettings({ ...app.settings, opts: app.opts, colors: app.colors, tool: app.tools?.id });
  }, 400);
}
app.saveSettings = saveSettings;

// ---------------------------------------------------------------- Aufbau der Oberfläche
function buildShell() {
  $('#app').innerHTML = `
  <header id="topbar">
    <button id="menu-btn" class="menu-btn menu-anchor"></button>
    <nav id="cats" class="cats"></nav>
    <div class="quick" id="quick"></div>
  </header>
  <div class="tabrow"><div id="tabs" class="tabs"></div><button id="new-tab" class="icon-btn small"></button></div>
  <main id="workspace">
    <section id="stage" class="stage" tabindex="-1">
      <div id="welcome" class="welcome hidden"></div>
      <div id="drop-hint" class="drop-hint hidden"></div>
      <div id="fs-bar" class="fs-bar"></div>
    </section>
    <aside id="side" class="side"></aside>
  </main>
  <footer id="statusbar"><div id="st-left" class="st-left"></div><div id="zoombar" class="zoombar"></div></footer>`;
}

/** Menü-Knopf (wie das "Menü" in Paint 3D): alle Befehle als Untermenüs */
function buildMenubar() {
  const b = $('#menu-btn');
  b.innerHTML = `${icon('menu', 18)}<span>${t('menu')}</span>`;
  b.onmousedown = (e) => {
    e.preventDefault();
    if (b.classList.contains('open')) return closeMenus();
    const r = b.getBoundingClientRect();
    showMenu([
      { label: t('menuFile'), submenu: fileMenu }, { label: t('menuEdit'), submenu: editMenu }, { label: t('menuImage'), submenu: imageMenu },
      { label: t('menuLayer'), submenu: layerMenu }, { label: t('menuEffects'), submenu: effectsMenu }, { label: t('menuView'), submenu: viewMenu },
      '-', { label: t('newImage'), shortcut: k('Mod+N'), run: newImageDialog }, { label: t('open'), shortcut: k('Mod+O'), run: openDialog },
      { label: t('save'), shortcut: k('Mod+S'), disabled: !hasDoc(), run: () => save(app.doc) }, { label: t('saveAs'), shortcut: k('Mod+Shift+S'), disabled: !hasDoc(), run: () => save(app.doc, { as: true }) },
      '-', { label: t('settings'), shortcut: k('Mod+,'), run: () => D.settingsDialog(app) }, { label: t('menuHelp'), submenu: helpMenu },
    ], r.left, r.bottom + 4);
    b.classList.add('open');
  };
}
const k = (spec) => keyLabel(spec, MAC());
const hasDoc = () => !!app.doc;

function fileMenu() {
  const recent = app.settings.recent.filter(Boolean);
  return [
    { label: t('newImage'), shortcut: k('Mod+N'), run: newImageDialog },
    { label: t('newFromClipboard'), shortcut: k('Mod+Alt+V'), run: () => pasteImage({ asNew: true }) },
    { label: t('open'), shortcut: k('Mod+O'), run: openDialog },
    !WEB && { label: t('recent'), submenu: () => recent.length ? [...recent.map((p) => ({ label: p, run: () => openPaths([p]) })), '-', { label: t('clearRecent'), run: () => { app.settings.recent = []; saveSettings(); } }] : [{ label: t('noRecent'), disabled: true }] },
    '-',
    { label: t('save'), shortcut: k('Mod+S'), disabled: !hasDoc(), run: () => save(app.doc) },
    { label: t('saveAs'), shortcut: k('Mod+Shift+S'), disabled: !hasDoc(), run: () => save(app.doc, { as: true }) },
    { label: t('exportAs'), disabled: !hasDoc(), submenu: () => Object.entries(SAVE_FORMATS).map(([f, x]) => ({ label: f === 'picline' ? t('formatProject') : x.name, run: () => save(app.doc, { as: true, format: f }) })) },
    { label: t('saveProject'), disabled: !hasDoc(), run: () => save(app.doc, { as: true, format: 'picline' }) },
    '-',
    !WEB && { label: t('nextImage'), shortcut: k('Mod+Right'), disabled: !app.doc?.path, run: () => siblingImage(1) },
    !WEB && { label: t('prevImage'), shortcut: k('Mod+Left'), disabled: !app.doc?.path, run: () => siblingImage(-1) },
    !WEB && app.doc?.path && { label: t('revealInFolder'), run: () => api.reveal(app.doc.path) },
    '-',
    { label: t('closeImage'), shortcut: k('Mod+W'), disabled: !hasDoc(), run: () => closeDoc(app.doc) },
    !WEB && { label: t('quit'), run: () => window.close() },
  ].filter(Boolean);
}
function editMenu() {
  const d = app.doc;
  const busy = !!(app.tools.float || app.tools.text);
  return [
    { label: t('undo'), shortcut: k('Mod+Z'), disabled: !d || (!d.canUndo && !busy), run: undo },
    { label: t('redo'), shortcut: k(MAC() ? 'Mod+Shift+Z' : 'Mod+Y'), disabled: !d?.canRedo, run: redo },
    '-',
    { label: t('cut'), shortcut: k('Mod+X'), disabled: !d, run: cut },
    { label: t('copy'), shortcut: k('Mod+C'), disabled: !d, run: () => copy() },
    { label: t('copyMerged'), shortcut: k('Mod+Shift+C'), disabled: !d, run: () => copy({ merged: true }) },
    { label: t('paste'), shortcut: k('Mod+V'), run: () => pasteImage() },
    { label: t('pasteNewLayer'), shortcut: k('Mod+Shift+V'), disabled: !d, run: () => pasteImage({ newLayer: true }) },
    '-',
    { label: t('selectAll'), shortcut: k('Mod+A'), disabled: !d, run: selectAll },
    { label: t('deselect'), shortcut: k('Mod+D'), disabled: !d?.selection, run: deselect },
    { label: t('delete'), shortcut: k('Delete'), disabled: !d, run: deleteSelection },
    { label: t('fillPrimary'), shortcut: k('Alt+Backspace'), disabled: !d, run: () => fillSelection('primary') },
    { label: t('fillSecondary'), shortcut: k('Mod+Backspace'), disabled: !d, run: () => fillSelection('secondary') },
    '-',
    { label: t('settings'), shortcut: k('Mod+,'), run: () => D.settingsDialog(app) },
  ];
}
function imageMenu() {
  const d = app.doc;
  const no = !d;
  return [
    { label: t('resizeImage'), shortcut: k('Mod+R'), disabled: no, run: () => D.resizeDialog(app) },
    { label: t('canvasSize'), shortcut: k('Mod+Shift+R'), disabled: no, run: () => D.canvasDialog(app) },
    { label: t('cropToSelection'), shortcut: k('Mod+Shift+X'), disabled: !d?.selection, run: () => cropTo(d.selection) },
    { label: t('autoCrop'), disabled: no, run: autoCrop },
    '-',
    { label: t('rotateRight'), disabled: no, run: () => rotateImage(90) },
    { label: t('rotateLeft'), disabled: no, run: () => rotateImage(-90) },
    { label: t('rotate180'), disabled: no, run: () => rotateImage(180) },
    { label: t('flipH'), disabled: no, run: () => flipImage('h') },
    { label: t('flipV'), disabled: no, run: () => flipImage('v') },
    '-',
    { label: t('flatten'), disabled: no || d.layers.length < 2, run: flatten },
  ];
}
function layerMenu() {
  const d = app.doc;
  const no = !d;
  return [
    { label: t('layerNew'), shortcut: k('Mod+Shift+N'), disabled: no, run: () => app.layerOps.add() },
    { label: t('layerDuplicate'), shortcut: k('Mod+J'), disabled: no, run: () => app.layerOps.duplicate() },
    { label: t('layerDelete'), disabled: no || d.layers.length < 2, run: () => app.layerOps.remove() },
    { label: t('layerFromFile'), disabled: no, run: importLayer },
    '-',
    { label: t('layerMergeDown'), shortcut: k('Mod+E'), disabled: no || d.active === 0, run: () => app.layerOps.mergeDown() },
    { label: t('layerUp'), shortcut: k('Mod+]'), disabled: no || d.active >= d.layers.length - 1, run: () => app.layerOps.move(1) },
    { label: t('layerDown'), shortcut: k('Mod+['), disabled: no || d.active === 0, run: () => app.layerOps.move(-1) },
    '-',
    { label: t('layerRotateRight'), disabled: no, run: () => transformLayer('r90') },
    { label: t('layerRotateLeft'), disabled: no, run: () => transformLayer('l90') },
    { label: t('layerFlipH'), disabled: no, run: () => transformLayer('h') },
    { label: t('layerFlipV'), disabled: no, run: () => transformLayer('v') },
    '-',
    { label: t('layerProperties'), disabled: no, run: () => app.layerOps.rename() },
  ];
}
const EFFECT_ORDER = ['grayscale', 'invert', 'sepia', '-', 'brightness', 'hue', 'posterize', 'threshold', '-', 'blur', 'sharpen', 'noise', 'pixelate', '-', 'outline'];
function effectsMenu() {
  return EFFECT_ORDER.map((id) => (id === '-' ? '-' : { label: t(`fx_${id}`) + (D.effectHasParams(id) ? '…' : ''), disabled: !app.doc, run: () => D.effectDialog(app, id) }));
}
function viewMenu() {
  const v = app.view;
  const s = app.settings;
  return [
    { label: t('zoomIn'), shortcut: k('Mod+='), disabled: !hasDoc(), run: () => v.zoomStep(1) },
    { label: t('zoomOut'), shortcut: k('Mod+-'), disabled: !hasDoc(), run: () => v.zoomStep(-1) },
    { label: t('zoomFit'), shortcut: k('Mod+0'), disabled: !hasDoc(), run: () => v.fit(true) },
    { label: t('zoom100'), shortcut: k('Mod+1'), disabled: !hasDoc(), run: () => v.zoomSmooth(1) },
    '-',
    { label: t('pixelGrid'), shortcut: k("Mod+'"), checked: s.grid !== false, run: () => setView({ grid: s.grid === false }) },
    { label: t('gridEvery'), submenu: () => [0, 4, 8, 16, 32, 64].map((n) => ({ label: n ? t('gridEveryN', { n }) : t('off'), checked: s.gridEvery === n, run: () => setView({ gridEvery: n }) })) },
    { label: t('tilePreview'), checked: s.tile, run: () => setView({ tile: !s.tile }) },
    { label: t('mirrorPaint'), submenu: () => ['none', 'x', 'y', 'xy'].map((m) => ({ label: t(`mirror_${m}`), checked: app.opts.mirror === m, run: () => setMirror(m) })) },
    { label: t('checker'), submenu: () => ['light', 'dark'].map((c) => ({ label: t(`checker_${c}`), checked: s.checker === c, run: () => setView({ checker: c }) })) },
    '-',
    { label: t('showPanel'), shortcut: k('Tab'), checked: !document.body.classList.contains('no-side'), run: toggleSide },
    { label: t('fullscreen'), shortcut: 'F11', checked: !!app.fullscreen, run: () => setFullscreen(!app.fullscreen) },
  ];
}
function helpMenu() {
  return [
    { label: t('shortcuts'), shortcut: 'F1', run: () => D.shortcutsDialog(app) },
    { label: t('website'), run: () => api.openExternal('https://mert.win/pic/') },
    { label: 'GitHub', run: () => api.openExternal('https://github.com/erqf1/picline') },
    { label: t('changelog'), run: () => api.openExternal('https://mert.win/pic/changelog.html') },
    '-',
    { label: t('about'), run: () => D.aboutDialog(app, INFO) },
  ];
}

function buildQuick() {
  const q = $('#quick');
  q.innerHTML = '';
  const btn = (id, ic, title, run, label) => {
    const b = h('button', { class: label ? 'quick-btn' : 'icon-btn', id, title, html: label ? `${icon(ic, 18)}<span>${label}</span>` : icon(ic) });
    b.addEventListener('click', run);
    q.append(b);
    return b;
  };
  btn('q-prev', 'up', t('prevImage'), () => siblingImage(-1)).classList.add('view-only', 'rot-left');
  btn('q-next', 'up', t('nextImage'), () => siblingImage(1)).classList.add('view-only', 'rot-right');
  btn('q-paste', 'paste', `${t('paste')} (${k('Mod+V')})`, () => pasteImage(), t('paste'));
  btn('q-undo', 'undo', `${t('undo')} (${k('Mod+Z')})`, undo);
  btn('q-redo', 'redo', `${t('redo')} (${k(MAC() ? 'Mod+Shift+Z' : 'Mod+Y')})`, redo);
  btn('q-full', 'expand', `${t('fullscreen')} (F11)`, () => setFullscreen(!app.fullscreen));
  const mode = h('button', { class: 'mode-btn', id: 'q-mode' });
  mode.addEventListener('click', () => setMode(!app.viewMode));
  q.append(mode);
  btn('q-side', 'palette', `${t('showPanel')} (Tab)`, toggleSide);
  btn('q-settings', 'settings', `${t('settings')} (${k('Mod+,')})`, () => D.settingsDialog(app));
  refreshQuick();
}
/** Zoom-Leiste unten rechts (wie in Paint 3D) mit Raster, Spiegeln und Kachelvorschau */
function buildZoomBar() {
  const z = $('#zoombar');
  z.innerHTML = '';
  const btn = (id, ic, title, run) => {
    const b = h('button', { class: 'icon-btn small', id, title, html: icon(ic, 16) });
    b.addEventListener('click', run);
    z.append(b);
    return b;
  };
  btn('q-grid', 'grid', `${t('pixelGrid')} (${k("Mod+'")})`, () => setView({ grid: app.settings.grid === false }));
  btn('q-mirror', 'mirror', t('mirrorPaint'), (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    showMenu(['none', 'x', 'y', 'xy'].map((m) => ({ label: t(`mirror_${m}`), checked: app.opts.mirror === m, run: () => setMirror(m) })), r.left, r.top - 150);
  });
  btn('q-tile', 'tile', t('tilePreview'), () => setView({ tile: !app.settings.tile }));
  z.append(h('span', { class: 'qsep' }));
  btn('q-fit', 'fit', `${t('zoomFit')} (${k('Mod+0')})`, () => app.view.fit(true));
  btn('q-zoomout', 'zoomOut', t('zoomOut'), () => app.view.zoomStep(-1));
  // Regler logarithmisch: 1 % … 102 400 %
  const range = h('input', { type: 'range', id: 'q-zrange', min: -6.64, max: 10, step: 0.01, value: 0, title: t('zoom') });
  range.addEventListener('input', () => app.view.setZoom(2 ** Number(range.value)));
  z.append(range);
  btn('q-zoomin', 'zoom', t('zoomIn'), () => app.view.zoomStep(1));
  const pct = h('button', { class: 'zoom-btn menu-anchor', id: 'q-zoom', title: t('zoom') });
  pct.addEventListener('click', () => {
    const r = pct.getBoundingClientRect();
    const list = [0.25, 0.5, 1, 2, 4, 8, 16, 32, 64, 128].map((v) => ({ label: `${Math.round(v * 100)} %`, run: () => app.view.zoomSmooth(v) }));
    showMenu([{ label: t('zoomFit'), run: () => app.view.fit(true) }, '-', ...list], r.left - 60, r.top - 330);
  });
  z.append(pct);
  refreshQuick();
}
function refreshQuick() {
  const d = app.doc;
  const busy = !!(app.tools?.float || app.tools?.text);
  const set = (id, on) => {
    const b = document.getElementById(id);
    if (b) b.disabled = !on;
  };
  set('q-undo', d && (d.canUndo || busy));
  set('q-redo', d?.canRedo);
  for (const id of ['q-zoomout', 'q-zoomin', 'q-fit', 'q-zoom', 'q-zrange']) set(id, !!d);
  const zr = $('#q-zrange');
  if (zr && d && document.activeElement !== zr) zr.value = Math.log2(app.view.zoom);
  const zb = $('#q-zoom');
  if (zb) zb.textContent = d ? zoomText(app.view.zoom) : '–';
  $('#q-grid')?.classList.toggle('on', app.settings.grid !== false);
  $('#q-mirror')?.classList.toggle('on', app.opts.mirror !== 'none');
  $('#q-tile')?.classList.toggle('on', !!app.settings.tile);
  $('#q-side')?.classList.toggle('on', !document.body.classList.contains('no-side'));
  $('#q-full')?.classList.toggle('hidden', !d);
  const mb = $('#q-mode');
  if (mb) {
    mb.classList.toggle('hidden', !d);
    mb.innerHTML = app.viewMode ? `${icon('brush', 16)}<span>${t('modeEdit')}</span>` : `${icon('eye', 16)}<span>${t('modeView')}</span>`;
    mb.classList.toggle('primary', app.viewMode);
    mb.title = app.viewMode ? t('modeEditHint') : t('modeViewHint');
  }
  for (const id of ['q-prev', 'q-next']) document.getElementById(id)?.classList.toggle('hidden', WEB || !d?.path);
}
function zoomText(z) {
  const p = z * 100;
  return `${p >= 10 ? Math.round(p).toLocaleString() : p.toFixed(1)} %`;
}

/** Kategorien oben (wie Paint 3D): großes Symbol, Name darunter */
function buildToolbar() {
  const bar = $('#cats');
  bar.innerHTML = '';
  for (const [id, ic] of CATS) {
    const b = h('button', { class: 'cat-btn', 'data-cat': id, html: `${icon(ic, 22)}<span>${catLabel(t, id)}</span>` });
    b.addEventListener('click', () => app.side.setCat(id));
    bar.append(b);
  }
  refreshToolbar();
}
function refreshToolbar() {
  for (const b of document.querySelectorAll('.cat-btn')) b.classList.toggle('on', b.dataset.cat === app.side?.cat);
}
app.refreshCats = refreshToolbar;
app.refreshQuick = () => refreshQuick();

// ---------------------------------------------------------------- Tabs, Titel, Statusleiste
function renderTabs() {
  const box = $('#tabs');
  box.innerHTML = '';
  for (const d of app.docs) {
    const close = h('button', { class: 'tab-close', title: t('closeImage'), html: icon('close', 13) });
    const thumb = h('canvas', { class: 'tab-thumb', width: 18, height: 18 });
    const tab = h('div', { class: `tab${d === app.doc ? ' active' : ''}${d.dirty ? ' dirty' : ''}`, title: d.path || d.name }, thumb, h('span', { class: 'tab-name', text: d.name }), close);
    drawThumb(thumb, d.composite());
    tab.addEventListener('mousedown', (e) => {
      if (e.button === 1) {
        e.preventDefault();
        closeDoc(d);
      } else if (e.button === 0 && !e.target.closest('.tab-close')) activate(d);
    });
    close.addEventListener('click', (e) => {
      e.stopPropagation();
      closeDoc(d);
    });
    box.append(tab);
  }
  $('#new-tab').innerHTML = icon('plus', 16);
  $('#new-tab').title = `${t('newImage')} (${k('Mod+N')})`;
}
function drawThumb(c, src) {
  const g = c.getContext('2d');
  const s = c.width;
  g.clearRect(0, 0, s, s);
  const kf = Math.min(s / src.width, s / src.height);
  const w = Math.max(1, src.width * kf);
  const hh = Math.max(1, src.height * kf);
  g.imageSmoothingEnabled = kf < 1;
  g.drawImage(src, (s - w) / 2, (s - hh) / 2, w, hh);
}
function updateTitle() {
  const d = app.doc;
  const title = d ? `${d.dirty ? '• ' : ''}${d.name} – Picline` : 'Picline';
  document.title = title;
  if (!WEB) api.setTitle(title);
}
let hoverPoint = null;
function renderStatus() {
  const s = $('#st-left');
  const d = app.doc;
  if (!d) {
    s.innerHTML = `<span class="st">Picline ${INFO.version || ''}</span>`;
    return;
  }
  const parts = [];
  if (hoverPoint) {
    const x = Math.floor(hoverPoint.x);
    const y = Math.floor(hoverPoint.y);
    const inside = x >= 0 && y >= 0 && x < d.w && y < d.h;
    parts.push(`<span class="st">${icon('move', 13)} ${inside ? `${x}, ${y}` : '–'}</span>`);
    if (inside) {
      const px = d.composite().getContext('2d').getImageData(x, y, 1, 1).data;
      const c = { r: px[0], g: px[1], b: px[2], a: px[3] };
      parts.push(`<span class="st"><i class="st-swatch" style="--c: rgba(${c.r},${c.g},${c.b},${c.a / 255})"></i>${toHex(c)}</span>`);
    }
  }
  const f = app.tools.float;
  const sel = d.selection;
  if (f) parts.push(`<span class="st">${icon('select', 13)} ${Math.round(f.w)} × ${Math.round(f.h)}${f.angle ? ` · ${Math.round((f.angle * 180) / Math.PI)}°` : ''}</span>`);
  else if (sel) parts.push(`<span class="st">${icon('select', 13)} ${sel.w} × ${sel.h}</span>`);
  if (app.tools.id === 'crop' && app.tools.cropRect) parts.push(`<span class="st">${icon('crop', 13)} ${app.tools.cropRect.w} × ${app.tools.cropRect.h}</span>`);
  parts.push('<span class="st-spacer"></span>');
  parts.push(`<span class="st">${icon('image', 13)} ${d.w} × ${d.h}</span>`);
  parts.push(`<span class="st">${t('layersN', { n: d.layers.length })}</span>`);
  s.innerHTML = parts.join('');
}
let statusQueued = false;
function queueStatus() {
  if (statusQueued) return;
  statusQueued = true;
  requestAnimationFrame(() => {
    statusQueued = false;
    renderStatus();
  });
}

// ---------------------------------------------------------------- Willkommen
function renderWelcome() {
  const w = $('#welcome');
  w.classList.toggle('hidden', !!app.docs.length);
  if (app.docs.length) return;
  const presets = [
    { label: t('presetTexture'), w: 16, h: 16, bg: 'transparent' },
    { label: t('presetTexture32'), w: 32, h: 32, bg: 'transparent' },
    { label: t('presetSkin'), w: 64, h: 64, bg: 'transparent' },
    { label: t('presetIcon'), w: 256, h: 256, bg: 'transparent' },
    { label: 'Full HD', w: 1920, h: 1080, bg: 'white' },
    { label: t('presetSquare'), w: 1080, h: 1080, bg: 'white' },
  ];
  const card = h('div', { class: 'welcome-card' },
    h('div', { class: 'welcome-logo', html: logoSvg(72) }),
    h('div', { class: 'welcome-title', text: 'Picline' }),
    h('div', { class: 'welcome-sub', text: t('welcomeSub') }));
  const actions = h('div', { class: 'welcome-actions' });
  const nb = h('button', { class: 'btn primary', html: `${icon('newImage', 16)}<span>${t('newImage')}</span>` });
  nb.addEventListener('click', newImageDialog);
  const ob = h('button', { class: 'btn', html: `${icon('open', 16)}<span>${t('open')}</span>` });
  ob.addEventListener('click', openDialog);
  const pb = h('button', { class: 'btn', html: `${icon('duplicate', 16)}<span>${t('newFromClipboard')}</span>` });
  pb.addEventListener('click', () => pasteImage({ asNew: true }));
  actions.append(nb, ob, pb);
  card.append(actions);
  const pr = h('div', { class: 'presets' });
  for (const p of presets) {
    const b = h('button', { class: 'preset' }, h('span', { class: 'preset-box', style: { aspectRatio: `${p.w} / ${p.h}` } }), h('b', { text: p.label }), h('small', { text: `${p.w} × ${p.h}` }));
    b.addEventListener('click', () => newDoc(p.w, p.h, p.bg));
    pr.append(b);
  }
  card.append(h('div', { class: 'welcome-head', text: t('quickStart') }), pr);
  const recent = app.settings.recent.filter(Boolean).slice(0, 6);
  if (recent.length && !WEB) {
    const list = h('div', { class: 'welcome-recent' }, h('div', { class: 'welcome-head', text: t('recent') }));
    for (const p of recent) {
      const name = p.split(/[\\/]/).pop();
      const b = h('button', { class: 'recent-item' }, h('span', { class: 'recent-name', text: name }), h('span', { class: 'recent-dir', text: p.slice(0, p.length - name.length) }));
      b.addEventListener('click', () => openPaths([p]));
      list.append(b);
    }
    card.append(list);
  }
  card.append(h('div', { class: 'welcome-hint', text: t('dropHint') }));
  w.innerHTML = '';
  w.append(card);
}

// ---------------------------------------------------------------- Bilder
app.layerName = (n) => t('layerN', { n: n ?? (app.doc ? app.doc.layers.length + 1 : 1) });
let untitled = 0;
function addDoc(doc) {
  app.docs.push(doc);
  doc.on((kind) => onDocChange(doc, kind));
  activate(doc);
}
function onDocChange(doc, kind) {
  if (doc !== app.doc) return;
  app.view.render();
  if (kind === 'selection') {
    queueStatus();
    return;
  }
  app.side.docChanged(kind);
  refreshQuick();
  if (kind !== 'pixels') {
    updateTitle();
    renderTabsSoon();
  }
  queueStatus();
}
let tabsTimer = null;
function renderTabsSoon() {
  clearTimeout(tabsTimer);
  tabsTimer = setTimeout(renderTabs, 120);
}
export function newDoc(w, h, bg = 'white', name) {
  w = Math.max(1, Math.min(16384, Math.round(w)));
  h = Math.max(1, Math.min(16384, Math.round(h)));
  const doc = new Doc(w, h, name || t('untitled', { n: ++untitled }));
  const l = new Layer(w, h, bg === 'transparent' ? app.layerName(1) : t('background'));
  if (bg !== 'transparent') {
    l.ctx.fillStyle = bg === 'secondary' ? `rgba(${app.colors.secondary.r},${app.colors.secondary.g},${app.colors.secondary.b},${app.colors.secondary.a / 255})` : bg === 'black' ? '#000' : '#fff';
    l.ctx.fillRect(0, 0, w, h);
  }
  doc.layers.push(l);
  addDoc(doc);
  setMode(false);
  return doc;
}
function activate(doc) {
  if (app.doc === doc) return;
  app.tools.commit();
  app.doc = doc;
  app.view.setDoc(doc);
  app.tools.docChanged();
  app.side.docChanged('structure');
  renderTabs();
  renderWelcome();
  updateTitle();
  refreshQuick();
  queueStatus();
}
async function closeDoc(doc) {
  if (!doc) return false;
  if (doc === app.doc) app.tools.commit();
  if (doc.dirty) {
    activate(doc);
    const r = await confirm(t('unsavedTitle'), t('unsavedText', { name: doc.name }), [
      { label: t('cancel'), value: 'cancel', left: true },
      { label: t('dontSave'), value: 'discard' },
      { label: t('save'), value: 'save', primary: true },
    ]);
    if (r === 'cancel' || r == null) return false;
    if (r === 'save' && !(await save(doc))) return false;
  }
  const i = app.docs.indexOf(doc);
  app.docs.splice(i, 1);
  if (app.doc === doc) {
    app.doc = null;
    const next = app.docs[Math.min(i, app.docs.length - 1)] || null;
    if (next) activate(next);
    else {
      app.view.setDoc(null);
      app.tools.docChanged();
      app.side.docChanged('structure');
      renderTabs();
      renderWelcome();
      updateTitle();
      refreshQuick();
      queueStatus();
    }
  } else renderTabs();
  return true;
}

// ---------------------------------------------------------------- Öffnen und Speichern
const fileName = (p) => String(p).split(/[\\/]/).pop();
function rememberRecent(p) {
  if (WEB || !p) return;
  app.settings.recent = [p, ...app.settings.recent.filter((x) => x !== p)].slice(0, 12);
  saveSettings();
}
async function openDialog() {
  const paths = await api.openDialog({ title: t('open'), filters: [{ name: t('images'), extensions: OPEN_EXT }, { name: t('allFiles'), extensions: ['*'] }], defaultPath: app.doc?.path ? undefined : INFO.pictures });
  if (paths?.length) openPaths(paths);
}
export async function openPaths(paths) {
  for (const p of paths) {
    const already = app.docs.find((d) => d.path === p);
    if (already) {
      activate(already);
      continue;
    }
    const res = await api.readFile(p);
    if (!res || res.error) {
      toast(res?.error === 'TOO_BIG' ? t('tooBig') : t('openFailed', { name: fileName(p) }), { kind: 'error' });
      if (res?.error === 'ENOENT') {
        app.settings.recent = app.settings.recent.filter((x) => x !== p);
        saveSettings();
      }
      continue;
    }
    await openBytes(res.data, fileName(p), p);
  }
}
async function openBytes(bytes, name, path = null, { view = true } = {}) {
  try {
    const doc = await decode(bytes, name, app.layerName(1));
    doc.name = name;
    doc.path = path;
    doc.markSaved();
    addDoc(doc);
    setMode(view);
    rememberRecent(path);
    return doc;
  } catch {
    toast(t('openFailed', { name }), { kind: 'error' });
    return null;
  }
}
app.openBytes = openBytes;
async function siblingImage(dir) {
  const d = app.doc;
  if (!d?.path) return;
  const list = await api.siblings(d.path);
  const i = list.indexOf(d.path);
  if (i < 0 || list.length < 2) return;
  const next = list[(i + dir + list.length) % list.length];
  if (!d.dirty && app.docs.length) {
    // wie ein Bildbetrachter: das unveränderte Bild ersetzen
    const opened = await openPathsReturn(next);
    if (opened) closeDoc(d);
  } else openPaths([next]);
}
async function openPathsReturn(p) {
  const res = await api.readFile(p);
  if (!res || res.error) return null;
  return openBytes(res.data, fileName(p), p, { view: app.viewMode });
}

/** Speichern. o: { as: Speichern unter, format: erzwungenes Format }. true = gespeichert. */
export async function save(doc, o = {}) {
  if (!doc) return false;
  if (doc === app.doc) app.tools.commit();
  let format = o.format || doc.format || 'png';
  let path = o.as || o.format ? null : doc.path;
  if (WEB) {
    const res = await api.saveImage(doc, format, { quality: app.settings.jpgQuality / 100, as: !!(o.as || o.format), encode });
    if (!res) return false;
    if (res.name) doc.name = res.name;
    if (res.format) doc.format = res.format;
    doc.markSaved();
    toast(t('saved', { name: doc.name }));
    return true;
  }
  if (!path) {
    const base = doc.name.replace(/\.[a-z0-9]+$/i, '');
    const ext = SAVE_FORMATS[format].ext;
    const dir = doc.path ? doc.path.slice(0, doc.path.length - fileName(doc.path).length) : `${INFO.pictures}${INFO.platform === 'win32' ? '\\' : '/'}`;
    const filters = [format, ...Object.keys(SAVE_FORMATS).filter((f) => f !== format)].map((f) => ({ name: f === 'picline' ? t('formatProject') : SAVE_FORMATS[f].name, extensions: f === 'jpeg' ? ['jpg', 'jpeg'] : [SAVE_FORMATS[f].ext] }));
    path = await api.saveDialog({ title: t('saveAs'), defaultPath: `${dir}${base}.${ext}`, filters });
    if (!path) return false;
    format = formatForExt(extOf(path)) || format;
  }
  // Ebenen gehen bei Bildformaten verloren - einmal darauf hinweisen
  if (format !== 'picline' && doc.layers.length > 1 && !doc.warnedFlatten) {
    doc.warnedFlatten = true;
    toast(t('flattenHint'), { ms: 5200 });
  }
  let bytes;
  try {
    bytes = await encode(doc, format, { quality: app.settings.jpgQuality / 100 });
  } catch {
    toast(t('saveFailed', { name: fileName(path) }), { kind: 'error' });
    return false;
  }
  const r = await api.writeFile(path, bytes);
  if (r?.error) {
    toast(t('saveFailed', { name: fileName(path) }), { kind: 'error' });
    return false;
  }
  doc.path = path;
  doc.name = fileName(path);
  doc.format = format;
  doc.markSaved();
  rememberRecent(path);
  renderTabs();
  updateTitle();
  toast(t('saved', { name: doc.name }));
  return true;
}

// ---------------------------------------------------------------- Bearbeiten
function undo() {
  const tl = app.tools;
  if (tl.text) return tl.removeText();
  if (tl.float) return tl.cancelFloat();
  const label = app.doc?.undo();
  if (label) toast(t('undone', { what: label }), { ms: 1200 });
  app.tools.docChanged();
  app.view.render();
}
function redo() {
  app.tools.commit();
  const label = app.doc?.redo();
  if (label) toast(t('redone', { what: label }), { ms: 1200 });
  app.view.render();
}
function selectAll() {
  const d = app.doc;
  if (!d) return;
  app.tools.commit();
  d.selection = { type: 'rect', x: 0, y: 0, w: d.w, h: d.h };
  d.changed('selection');
}
function deselect() {
  const d = app.doc;
  if (!d) return;
  app.tools.commit();
  d.selection = null;
  d.changed('selection');
}
function deleteSelection() {
  const d = app.doc;
  if (!d) return;
  if (app.tools.deleteFloat()) return;
  if (!d.selection) return toast(t('nothingSelected'));
  if (d.layer.locked) return toast(t('layerLocked'));
  d.editPixels(t('delete'), (g) => {
    g.save();
    selectionPath(g, d.selection);
    g.clip();
    g.clearRect(0, 0, d.w, d.h);
    g.restore();
    return d.selection;
  });
  edited();
}
function fillSelection(which) {
  const d = app.doc;
  if (!d) return;
  app.tools.commit();
  if (d.layer.locked) return toast(t('layerLocked'));
  const c = app.colors[which];
  d.editPixels(t('fill'), (g) => {
    g.save();
    if (d.selection) {
      selectionPath(g, d.selection);
      g.clip();
    }
    g.fillStyle = `rgba(${c.r},${c.g},${c.b},${c.a / 255})`;
    g.fillRect(0, 0, d.w, d.h);
    g.restore();
    return d.selection || null;
  });
  edited();
}
/** Bild der Auswahl (oder ganze Ebene / ganzes Bild) als Canvas */
function selectionCanvas({ merged = false } = {}) {
  const d = app.doc;
  const f = app.tools.float;
  if (f) {
    const c = makeCanvas(Math.round(f.w), Math.round(f.h));
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = f.smooth;
    g.drawImage(f.canvas, 0, 0, c.width, c.height);
    return c;
  }
  const src = merged ? d.composite() : d.layer.canvas;
  const sel = d.selection;
  if (!sel) return cloneCanvas(src);
  return liftSelection({ canvas: src, ctx: src.getContext('2d') }, sel, false).canvas;
}
async function copy(o = {}) {
  if (!app.doc) return;
  const c = selectionCanvas(o);
  const png = await canvasToPng(c);
  await api.writeClipboardImage(png);
  toast(t('copied'), { ms: 1200 });
}
async function cut() {
  if (!app.doc) return;
  await copy();
  deleteSelection();
}
/** Bild aus der Zwischenablage: schwebend einfügen, als neue Ebene oder als neues Bild */
async function pasteImage({ newLayer = false, asNew = false } = {}) {
  let res = null;
  try {
    res = await api.readClipboardImage();
  } catch {
    // nichts
  }
  if (!res) return toast(t('clipboardEmpty'));
  const bytes = res.data || res;
  let canvas;
  try {
    canvas = await decodeCanvas(bytes, res.file || 'clip.png');
  } catch {
    return toast(t('clipboardEmpty'));
  }
  await placeCanvas(canvas, { newLayer, asNew, name: res.file ? fileName(res.file) : null });
}
app.pasteImage = pasteImage;
async function placeCanvas(canvas, { newLayer = false, asNew = false, name = null } = {}) {
  if (asNew || !app.doc) {
    const doc = new Doc(canvas.width, canvas.height, name || t('untitled', { n: ++untitled }));
    doc.layers.push(new Layer(canvas.width, canvas.height, app.layerName(1)));
    doc.layers[0].ctx.drawImage(canvas, 0, 0);
    addDoc(doc);
    setMode(false);
    return;
  }
  const d = app.doc;
  if (canvas.width > d.w || canvas.height > d.h) {
    // wie in Paint: fragen, ob die Leinwand mitwachsen soll
    const r = await confirm(t('pasteBiggerTitle'), t('pasteBiggerText', { w: canvas.width, h: canvas.height }), [
      { label: t('keepSize'), value: 'keep' },
      { label: t('growCanvas'), value: 'grow', primary: true },
    ]);
    if (r == null) return;
    if (r === 'grow') resizeCanvasTo(Math.max(d.w, canvas.width), Math.max(d.h, canvas.height), 'nw');
  }
  setMode(false);
  app.tools.paste(canvas, { newLayer });
}
app.placeCanvas = placeCanvas;
async function importLayer() {
  const paths = await api.openDialog({ title: t('layerFromFile'), filters: [{ name: t('images'), extensions: OPEN_EXT.filter((e) => e !== 'picline') }], multi: false });
  if (!paths?.[0]) return;
  const res = await api.readFile(paths[0]);
  if (!res || res.error) return toast(t('openFailed', { name: fileName(paths[0]) }), { kind: 'error' });
  placeCanvas(await decodeCanvas(res.data, paths[0]), { newLayer: true });
}

// ---------------------------------------------------------------- Bild umbauen
function forEachLayer(fn) {
  for (const l of app.doc.layers) {
    const c = fn(l.canvas, l);
    if (c) l.setCanvas(c);
  }
}
export function cropTo(r) {
  const d = app.doc;
  if (!d || !r) return;
  app.tools.commit();
  const rr = { x: Math.round(r.x), y: Math.round(r.y), w: Math.max(1, Math.round(r.w)), h: Math.max(1, Math.round(r.h)) };
  d.structural(t('crop'), () => {
    forEachLayer((src) => {
      const c = makeCanvas(rr.w, rr.h);
      const g = c.getContext('2d');
      if (d.selection && d.selection.type === 'ellipse' && r === d.selection) {
        g.beginPath();
        g.ellipse(rr.w / 2, rr.h / 2, rr.w / 2, rr.h / 2, 0, 0, Math.PI * 2);
        g.clip();
      }
      g.drawImage(src, -rr.x, -rr.y);
      return c;
    });
    d.w = rr.w;
    d.h = rr.h;
    d.selection = null;
  });
  afterResize();
}
app.cropTo = cropTo;
function autoCrop() {
  const d = app.doc;
  const b = Doc.bounds(d.composite());
  if (!b) return toast(t('imageEmpty'));
  if (b.w === d.w && b.h === d.h) return toast(t('nothingToCrop'));
  cropTo(b);
}
export function resizeImageTo(w, hh, smooth) {
  const d = app.doc;
  app.tools.commit();
  d.structural(t('resizeImage'), () => {
    forEachLayer((src) => {
      const c = makeCanvas(w, hh);
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = smooth;
      g.imageSmoothingQuality = 'high';
      if (smooth && (w < src.width / 2 || hh < src.height / 2)) {
        // starkes Verkleinern in Schritten - sieht deutlich besser aus
        let cur = src;
        while (cur.width / 2 > w && cur.height / 2 > hh) {
          const half = makeCanvas(Math.ceil(cur.width / 2), Math.ceil(cur.height / 2));
          const hg = half.getContext('2d');
          hg.imageSmoothingQuality = 'high';
          hg.drawImage(cur, 0, 0, half.width, half.height);
          cur = half;
        }
        g.drawImage(cur, 0, 0, w, hh);
      } else g.drawImage(src, 0, 0, w, hh);
      return c;
    });
    d.w = w;
    d.h = hh;
    d.selection = null;
  });
  afterResize();
}
app.resizeImageTo = resizeImageTo;
/** anchor: n, ne, e, se, s, sw, w, nw, c - wo das alte Bild in der neuen Leinwand liegt */
export function resizeCanvasTo(w, hh, anchor = 'c', fill = null) {
  const d = app.doc;
  app.tools.commit();
  const ax = anchor.includes('w') ? 0 : anchor.includes('e') ? 1 : 0.5;
  const ay = anchor.includes('n') ? 0 : anchor.includes('s') ? 1 : 0.5;
  const ox = Math.round((w - d.w) * ax);
  const oy = Math.round((hh - d.h) * ay);
  d.structural(t('canvasSize'), () => {
    d.layers.forEach((l, i) => {
      const c = makeCanvas(w, hh);
      const g = c.getContext('2d');
      if (fill && i === 0) {
        g.fillStyle = fill;
        g.fillRect(0, 0, w, hh);
      }
      g.drawImage(l.canvas, ox, oy);
      l.setCanvas(c);
    });
    d.w = w;
    d.h = hh;
    d.selection = null;
  });
  afterResize();
}
app.resizeCanvasTo = resizeCanvasTo;
function afterResize() {
  app.view.fit(true);
  app.tools.docChanged();
  edited();
}
function rotateCanvas(src, deg) {
  const swap = deg === 90 || deg === -90;
  const c = makeCanvas(swap ? src.height : src.width, swap ? src.width : src.height);
  const g = c.getContext('2d');
  g.translate(c.width / 2, c.height / 2);
  g.rotate((deg * Math.PI) / 180);
  g.drawImage(src, -src.width / 2, -src.height / 2);
  return c;
}
function flipCanvas(src, dir) {
  const c = makeCanvas(src.width, src.height);
  const g = c.getContext('2d');
  if (dir === 'h') g.setTransform(-1, 0, 0, 1, src.width, 0);
  else g.setTransform(1, 0, 0, -1, 0, src.height);
  g.drawImage(src, 0, 0);
  return c;
}
function rotateImage(deg) {
  const d = app.doc;
  app.tools.commit();
  d.structural(t(deg === 90 ? 'rotateRight' : deg === -90 ? 'rotateLeft' : 'rotate180'), () => {
    forEachLayer((src) => rotateCanvas(src, deg));
    if (deg !== 180) [d.w, d.h] = [d.h, d.w];
    d.selection = null;
  });
  afterResize();
}
function flipImage(dir) {
  const d = app.doc;
  app.tools.commit();
  d.structural(t(dir === 'h' ? 'flipH' : 'flipV'), () => forEachLayer((src) => flipCanvas(src, dir)));
  edited();
}
/** nur die aktive Ebene (bzw. die Auswahl darin) drehen/spiegeln */
function transformLayer(kind) {
  const d = app.doc;
  app.tools.commit();
  if (d.layer.locked) return toast(t('layerLocked'));
  const sel = d.selection || { type: 'rect', x: 0, y: 0, w: d.w, h: d.h };
  d.editPixels(t(`layer${{ r90: 'RotateRight', l90: 'RotateLeft', h: 'FlipH', v: 'FlipV' }[kind]}`), (g, layer) => {
    const part = liftSelection(layer, sel, true);
    const c = kind === 'h' || kind === 'v' ? flipCanvas(part.canvas, kind) : rotateCanvas(part.canvas, kind === 'r90' ? 90 : -90);
    const cx = part.x + part.canvas.width / 2;
    const cy = part.y + part.canvas.height / 2;
    g.drawImage(c, Math.round(cx - c.width / 2), Math.round(cy - c.height / 2));
    return null;
  });
  edited();
}
function flatten() {
  const d = app.doc;
  app.tools.commit();
  d.structural(t('flatten'), () => {
    const c = d.flatten();
    const l = d.newLayer(d.layers[0].name, c);
    d.layers = [l];
    d.active = 0;
  });
  edited();
}

// ---------------------------------------------------------------- Farben und Ansicht
app.setColor = (which, c, { remember = true } = {}) => {
  app.colors[which] = { ...c };
  if (remember) app.rememberColor(c);
  refreshToolbar();
  app.side.colorsChanged();
  if (app.tools.text) app.tools.refreshText();
  saveSettings();
};
let rememberTimer = null;
app.rememberColor = (c) => {
  clearTimeout(rememberTimer);
  rememberTimer = setTimeout(() => {
    const hex = toHex(c);
    app.settings.recentColors = [hex, ...app.settings.recentColors.filter((x) => x !== hex)].slice(0, 14);
    app.side.colorsChanged();
    saveSettings();
  }, 700);
};
function swapColors() {
  [app.colors.primary, app.colors.secondary] = [app.colors.secondary, app.colors.primary];
  refreshToolbar();
  app.side.colorsChanged();
  saveSettings();
}
function resetColors() {
  app.colors.primary = { r: 0, g: 0, b: 0, a: 255 };
  app.colors.secondary = { r: 255, g: 255, b: 255, a: 255 };
  refreshToolbar();
  app.side.colorsChanged();
  saveSettings();
}
function setView(o) {
  if ('grid' in o) app.settings.grid = o.grid;
  Object.assign(app.settings, o);
  const edit = !app.looking;
  app.view.setOptions({ grid: app.settings.grid !== false && edit, gridEvery: edit ? app.settings.gridEvery : 0, tile: edit && app.settings.tile, checker: app.settings.checker, gridMin: app.settings.gridMin, smoothDown: app.settings.smoothDown });
  refreshQuick();
  saveSettings();
}
app.setView = setView;
app.cmd = { selectAll, deselect, copy: () => copy(), deleteSelection, swapColors };
app.imageOps = { resize: () => D.resizeDialog(app), canvas: () => D.canvasDialog(app), rotate: (deg) => rotateImage(deg), flip: (dir) => flipImage(dir), autoCrop };
/** Ansehen (wie Cutline beim Öffnen: nur das Bild, ziehen/zoomen/blättern) oder Bearbeiten (Werkzeuge und Seitenpanel) */
function setMode(view) {
  view = !!view;
  if (view) app.tools?.commit();
  if (app.viewMode === view && document.body.classList.contains('viewing') === view) return;
  app.viewMode = view;
  document.body.classList.toggle('viewing', view);
  setView({});
  app.tools?.updateCursor();
  refreshQuick();
  app.view?.render();
  if (!view) app.side?.toolChanged();
  // Panel und Werkzeugleiste verändern die Breite: Bild danach neu einpassen, wenn es eingepasst war
  requestAnimationFrame(() => app.view?.resize());
}
app.setMode = setMode;
function setMirror(m) {
  app.opts.mirror = m;
  refreshQuick();
  app.side.toolChanged();
  app.view.render();
  saveSettings();
  if (m !== 'none') toast(t('mirrorOn'), { ms: 1600 });
}
function toggleSide() {
  document.body.classList.toggle('no-side');
  app.settings.hideSide = document.body.classList.contains('no-side');
  saveSettings();
  refreshQuick();
}
// ---------------------------------------------------------------- Vollbild: nur das Bild
function setFullscreen(on) {
  api.setFullscreen(!!on);
  // im Browser kann es abgelehnt werden - dann trotzdem die Oberfläche ausblenden
  if (WEB) applyFullscreen(!!on);
}
function applyFullscreen(on) {
  if (app.fullscreen === on) return;
  app.fullscreen = on;
  document.body.classList.toggle('fullscreen', on);
  applyLook();
  setView({});
  app.tools.updateCursor();
  requestAnimationFrame(() => {
    app.view.resize();
    app.view.fit(true);
  });
  if (on) showFsBar();
  refreshQuick();
}
app.applyFullscreen = applyFullscreen;
let fsTimer = null;
/** Leiste unten im Vollbild: erscheint bei Mausbewegung, verschwindet nach 2,5 s (mit dem Mauszeiger) */
function showFsBar() {
  if (!app.fullscreen) return;
  document.body.classList.remove('fs-idle');
  clearTimeout(fsTimer);
  fsTimer = setTimeout(() => {
    if (app.fullscreen && !$('#fs-bar').matches(':hover')) document.body.classList.add('fs-idle');
  }, 2500);
}
function buildFsBar() {
  const bar = $('#fs-bar');
  bar.innerHTML = '';
  const btn = (ic, title, run, cls = '') => {
    const b = h('button', { class: `icon-btn ${cls}`, title, html: icon(ic, 18) });
    b.addEventListener('click', run);
    bar.append(b);
    return b;
  };
  if (!WEB) {
    btn('up', t('prevImage'), () => siblingImage(-1), 'rot-left');
    btn('up', t('nextImage'), () => siblingImage(1), 'rot-right');
  }
  btn('zoomOut', t('zoomOut'), () => app.view.zoomStep(-1));
  btn('fit', t('zoomFit'), () => app.view.fit(true));
  btn('zoom', t('zoomIn'), () => app.view.zoomStep(1));
  btn('close', `${t('fullscreenExit')} (Esc)`, () => setFullscreen(false));
}
function toggleWebFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.();
}

// ---------------------------------------------------------------- Rückmeldungen von Werkzeugen
function edited() {
  const d = app.doc;
  if (!d) return;
  app.view.render();
  app.side.docChanged('pixels');
  refreshQuick();
  updateTitle();
  renderTabsSoon();
  queueStatus();
}
app.edited = edited;
app.toolChanged = () => {
  refreshToolbar();
  app.side.toolChanged();
  refreshQuick();
  queueStatus();
  saveSettings();
};
app.hoverChanged = (p) => {
  hoverPoint = p;
  queueStatus();
};
app.floatChanged = () => {
  refreshQuick();
  queueStatus();
  app.side.floatChanged?.();
};
app.cropChanged = () => {
  queueStatus();
  app.side.cropChanged?.();
};

// ---------------------------------------------------------------- Neues Bild
function newImageDialog() {
  D.newImageDialog(app).then((r) => {
    if (!r) return;
    app.settings.newW = r.w;
    app.settings.newH = r.h;
    app.settings.newBg = r.bg;
    saveSettings();
    newDoc(r.w, r.h, r.bg);
  });
}
app.newDoc = newDoc;

// ---------------------------------------------------------------- Tastatur
function onKey(e) {
  if (dialogOpen() || menuOpen()) return;
  const inField = e.target.closest?.('input, textarea, select, [contenteditable]');
  const mod = MAC() ? e.metaKey : e.ctrlKey;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const run = (fn) => {
    e.preventDefault();
    fn();
  };
  // im Browser kommt Einfügen über das paste-Ereignis (geht ohne Nachfrage und auch in Firefox)
  if (WEB && mod && key === 'v' && !e.altKey) {
    webPasteMode = { newLayer: e.shiftKey };
    return;
  }
  if (mod && !inField) {
    const sh = e.shiftKey;
    const alt = e.altKey;
    const map = {
      n: () => (sh ? app.doc && app.layerOps.add() : newImageDialog()),
      o: openDialog,
      s: () => app.doc && save(app.doc, { as: sh }),
      w: () => app.doc && closeDoc(app.doc),
      z: () => (sh ? redo() : undo()),
      y: redo,
      x: () => (sh ? app.doc?.selection && cropTo(app.doc.selection) : cut()),
      c: () => copy({ merged: sh }),
      v: () => pasteImage({ newLayer: sh && !alt, asNew: alt }),
      a: selectAll,
      d: deselect,
      j: () => app.doc && app.layerOps.duplicate(),
      e: () => app.doc && app.doc.active > 0 && app.layerOps.mergeDown(),
      r: () => app.doc && (sh ? D.canvasDialog(app) : D.resizeDialog(app)),
      ',': () => D.settingsDialog(app),
      '=': () => app.view.zoomStep(1),
      '+': () => app.view.zoomStep(1),
      '-': () => app.view.zoomStep(-1),
      0: () => app.view.fit(true),
      1: () => app.view.zoomSmooth(1),
      "'": () => setView({ grid: app.settings.grid === false }),
      ']': () => app.doc && app.layerOps.move(1),
      '[': () => app.doc && app.layerOps.move(-1),
      Backspace: () => fillSelection('secondary'),
      ArrowRight: () => siblingImage(1),
      ArrowLeft: () => siblingImage(-1),
      Tab: () => cycleDoc(sh ? -1 : 1),
    };
    if (map[key]) return run(map[key]);
    return;
  }
  if (e.key === 'F1') return run(() => D.shortcutsDialog(app));
  if (e.key === 'F11') return run(() => setFullscreen(!app.fullscreen));
  if (e.key === 'Escape' && app.fullscreen && !inField && !app.tools.text && !app.tools.float) return run(() => setFullscreen(false));
  if (inField) return;
  if (e.key === 'Escape') return app.tools.cancel() && e.preventDefault();
  if (e.key === 'Enter') {
    if (app.tools.id === 'crop' && app.tools.cropRect) return run(() => app.tools.applyCrop());
    if (app.tools.float) return run(() => app.tools.applyFloat());
  }
  if (e.key === 'Delete' || (e.key === 'Backspace' && !e.altKey)) return run(deleteSelection);
  if (e.key === 'Backspace' && e.altKey) return run(() => fillSelection('primary'));
  if (e.key === ' ') {
    e.preventDefault();
    if (!e.repeat) app.tools.setSpace(true);
    return;
  }
  if (e.key === 'Tab') return run(toggleSide);
  if (e.key.startsWith('Arrow')) {
    const step = e.shiftKey ? 10 : 1;
    const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
    const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
    if (app.tools.nudge(dx, dy)) e.preventDefault();
    return;
  }
  if (e.altKey || e.metaKey || e.ctrlKey) return;
  if (key === 'x') return run(swapColors);
  if (key === 'd') return run(resetColors);
  if (key === '[' || key === ']') return run(() => app.side.bumpSize(key === ']' ? 1 : -1));
  if (app.viewMode && app.doc && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return run(() => siblingImage(e.key === 'ArrowRight' ? 1 : -1));
  const tool = Object.entries(TOOL_KEYS).find(([, v]) => v.toLowerCase() === key);
  if (tool) return run(() => {
    setMode(false);
    app.tools.set(tool[0]);
  });
}
let webPasteMode = {};
function setupWebPaste() {
  document.addEventListener('paste', async (e) => {
    if (e.target.closest?.('input, textarea')) return;
    const file = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith('image/'));
    if (!file) return toast(t('clipboardEmpty'));
    e.preventDefault();
    try {
      await placeCanvas(await decodeCanvas(new Uint8Array(await file.arrayBuffer()), file.name), webPasteMode);
    } catch {
      toast(t('clipboardEmpty'));
    }
    webPasteMode = {};
  });
}
function cycleDoc(dir) {
  if (app.docs.length < 2) return;
  const i = app.docs.indexOf(app.doc);
  activate(app.docs[(i + dir + app.docs.length) % app.docs.length]);
}

// ---------------------------------------------------------------- Ziehen und Ablegen
function setupDrop() {
  const hint = $('#drop-hint');
  let depth = 0;
  const has = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  window.addEventListener('dragenter', (e) => {
    if (!has(e)) return;
    depth++;
    hint.textContent = app.doc ? t('dropInsert') : t('dropOpen');
    hint.classList.remove('hidden');
  });
  window.addEventListener('dragleave', () => {
    if (--depth <= 0) {
      depth = 0;
      hint.classList.add('hidden');
    }
  });
  window.addEventListener('dragover', (e) => {
    if (has(e)) e.preventDefault();
  });
  window.addEventListener('drop', async (e) => {
    if (!has(e)) return;
    e.preventDefault();
    depth = 0;
    hint.classList.add('hidden');
    const files = [...e.dataTransfer.files];
    if (!files.length) return;
    // aufs Bild gezogen: einfügen; auf Tabs/Startseite: öffnen
    const onStage = e.target.closest?.('#stage') && app.doc && files.length === 1 && !/\.picline$/i.test(files[0].name);
    for (const f of files) {
      const bytes = new Uint8Array(await f.arrayBuffer());
      if (onStage) {
        try {
          const c = await decodeCanvas(bytes, f.name);
          const p = app.view.toDoc(app.view.local(e).x, app.view.local(e).y);
          app.tools.commit();
          await placeCanvas(c);
          if (app.tools.float && p) {
            app.tools.float.x = Math.round(p.x - c.width / 2);
            app.tools.float.y = Math.round(p.y - c.height / 2);
            app.view.render();
          }
        } catch {
          toast(t('openFailed', { name: f.name }), { kind: 'error' });
        }
      } else {
        const p = WEB ? null : api.pathForFile(f);
        await openBytes(bytes, f.name, p || null);
      }
    }
  });
}

// ---------------------------------------------------------------- Schließen
async function onClosing(info) {
  app.tools.commit();
  for (const d of [...app.docs]) {
    if (!d.dirty) continue;
    if (!(await closeDoc(d))) return;
  }
  saveNow();
  if (info?.update) api.updateReady();
  else api.closeNow();
}
function saveNow() {
  clearTimeout(saveTimer);
  return api.setSettings({ ...app.settings, opts: app.opts, colors: app.colors, tool: app.tools?.id });
}

// ---------------------------------------------------------------- Start
function applyLook() {
  const dark = app.settings.mode === 'dark' || (app.settings.mode === 'system' && systemDark);
  const vars = applyTheme(app.settings.accent, dark);
  // Raster liegt auf dem Bild, nicht auf der Oberfläche: ein Grau, das auf hell und dunkel sichtbar ist
  app.view?.setColors({ bg: app.fullscreen ? '#000000' : vars.canvasBg, grid: 'rgba(118,118,128,0.42)' });
}
app.applyLook = applyLook;
let systemDark = true;
app.rebuild = () => {
  buildFsBar();
  buildMenubar();
  buildQuick();
  buildZoomBar();
  buildToolbar();
  app.side.rebuild();
  renderTabs();
  renderWelcome();
  renderStatus();
};

async function start() {
  INFO = await api.info();
  app.info = INFO;
  systemDark = INFO.dark;
  const saved = (await api.getSettings()) || {};
  app.settings = { ...DEFAULTS, ...saved };
  if (!app.settings.language) {
    const nav = (navigator.language || 'en').slice(0, 2);
    app.settings.language = LANGS.some(([c]) => c === nav) ? nav : 'en';
  }
  for (const [id, def] of Object.entries(DEFAULT_OPTS)) {
    if (typeof def === 'object') app.opts[id] = { ...def, ...(saved.opts?.[id] || {}) };
    else app.opts[id] = saved.opts?.[id] ?? def;
  }
  if (saved.colors?.primary) app.colors = saved.colors;
  document.documentElement.lang = app.settings.language;
  buildShell();
  applyLook();
  app.view = new View($('#stage'));
  applyLook();
  app.view.onChange = () => {
    refreshQuick();
    queueStatus();
    app.tools?.placeText();
  };
  app.tools = new Tools(app);
  if (TOOLS.includes(saved.tool) && saved.tool !== 'crop') app.tools.id = saved.tool;
  app.side = new Side(app);
  // schmale Bildschirme (Handy): Seitenpanel erst auf Knopfdruck
  if (app.settings.hideSide || (window.innerWidth < 760 && app.settings.hideSide === undefined)) document.body.classList.add('no-side');
  app.rebuild();
  setView({});
  $('#new-tab').addEventListener('click', newImageDialog);
  document.addEventListener('keydown', onKey);
  document.addEventListener('keyup', (e) => {
    if (e.key === ' ') app.tools.setSpace(false);
  });
  window.addEventListener('blur', () => app.tools.setSpace(false));
  setupDrop();
  api.onFullscreen?.((on) => applyFullscreen(on));
  $('#stage').addEventListener('pointermove', showFsBar);
  $('#fs-bar').addEventListener('pointerenter', showFsBar);
  if (WEB) setupWebPaste();
  api.onOpenFiles((list) => openPaths(list));
  api.onClosing(onClosing);
  api.onSystemTheme((dark) => {
    systemDark = dark;
    applyLook();
  });
  const initial = await api.initialFiles();
  if (initial?.length) await openPaths(initial);
  renderWelcome();
  if (INFO.selfTest) window.__picline = { applyFullscreen, app, newDoc, save, cropTo, resizeImageTo, resizeCanvasTo, openBytes, placeCanvas, encode };
}
start();
