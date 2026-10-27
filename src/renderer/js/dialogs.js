// Dialoge: Neues Bild, Bildgröße, Leinwandgröße, Effekte (mit Live-Vorschau), Einstellungen, Tastenkürzel, Über.
import { h, dialog, keyLabel } from './ui.js';
import { icon, logoSvg } from './icons.js';
import { EFFECTS } from './adjust.js';
import { makeCanvas, cloneCanvas, clampRect, selectionPath } from './doc.js';
import { LANGS } from '../../shared/i18n.js';
import { ACCENTS } from './theme.js';
import { TOOL_KEYS } from './tools.js';

const num = (value, min, max) => h('input', { class: 'input num', type: 'number', value, min, max });
const field = (label, ...el) => h('label', { class: 'dlg-field' }, h('span', { text: label }), ...el);

// ---------------------------------------------------------------- Neues Bild
export async function newImageDialog(app) {
  const t = app.t;
  const s = app.settings;
  const w = num(s.newW, 1, 16384);
  const hh = num(s.newH, 1, 16384);
  let bg = s.newBg || 'white';
  const presets = [[16, 16], [32, 32], [64, 64], [128, 128], [256, 256], [512, 512], [1080, 1080], [1280, 720], [1920, 1080], [2480, 3508]];
  const chips = h('div', { class: 'chips' });
  for (const [pw, ph] of presets) {
    const c = h('button', { class: 'chip', text: `${pw} × ${ph}` });
    c.addEventListener('click', () => {
      w.value = pw;
      hh.value = ph;
    });
    chips.append(c);
  }
  const bgSeg = h('div', { class: 'seg' });
  for (const v of ['white', 'transparent', 'black', 'secondary']) {
    const b = h('button', { class: v === bg ? 'on' : '', text: t(`bg_${v}`) });
    b.addEventListener('click', () => {
      bg = v;
      for (const x of bgSeg.children) x.classList.toggle('on', x === b);
    });
    bgSeg.append(b);
  }
  const body = h('div', { class: 'dlg-col' }, h('div', { class: 'dlg-row' }, field(t('width'), w, h('small', { text: 'px' })), field(t('height'), hh, h('small', { text: 'px' }))), chips, field(t('background'), bgSeg));
  const r = await dialog({ title: t('newImage'), body, buttons: [{ label: t('cancel'), value: null }, { label: t('create'), value: 'ok', primary: true }] });
  if (r !== 'ok') return null;
  const W = Math.round(Number(w.value));
  const H = Math.round(Number(hh.value));
  if (!(W >= 1 && H >= 1 && W <= 16384 && H <= 16384)) return null;
  return { w: W, h: H, bg };
}

// ---------------------------------------------------------------- Bildgröße
export async function resizeDialog(app) {
  const t = app.t;
  const d = app.doc;
  if (!d) return;
  app.tools.commit();
  let unit = 'px';
  const w = num(d.w, 1, 65536);
  const hh = num(d.h, 1, 65536);
  const keep = h('input', { type: 'checkbox' });
  keep.checked = true;
  // kleine Bilder (Pixelgrafik) standardmäßig scharf vergrößern
  let smooth = !(d.w <= 256 && d.h <= 256);
  const ratio = d.w / d.h;
  const toPx = (v, total) => (unit === '%' ? Math.round((v / 100) * total) : Math.round(v));
  w.addEventListener('input', () => {
    if (keep.checked) hh.value = unit === '%' ? w.value : Math.max(1, Math.round(Number(w.value) / ratio));
  });
  hh.addEventListener('input', () => {
    if (keep.checked) w.value = unit === '%' ? hh.value : Math.max(1, Math.round(Number(hh.value) * ratio));
  });
  const unitSeg = h('div', { class: 'seg' });
  for (const u of ['px', '%']) {
    const b = h('button', { class: u === unit ? 'on' : '', text: u === 'px' ? t('pixels') : t('percent') });
    b.addEventListener('click', () => {
      if (u === unit) return;
      unit = u;
      for (const x of unitSeg.children) x.classList.toggle('on', x === b);
      w.value = u === '%' ? 100 : d.w;
      hh.value = u === '%' ? 100 : d.h;
    });
    unitSeg.append(b);
  }
  const quickBox = h('div', { class: 'chips' });
  for (const f of [0.25, 0.5, 2, 4, 8, 16]) {
    const c = h('button', { class: 'chip', text: `${f < 1 ? `1/${1 / f}` : `${f}×`}` });
    c.addEventListener('click', () => {
      unit = 'px';
      for (const x of unitSeg.children) x.classList.toggle('on', x.textContent === t('pixels'));
      w.value = Math.max(1, Math.round(d.w * f));
      hh.value = Math.max(1, Math.round(d.h * f));
    });
    quickBox.append(c);
  }
  const resSeg = h('div', { class: 'seg' });
  for (const [v, label] of [[true, t('resampleSmooth')], [false, t('resamplePixel')]]) {
    const b = h('button', { class: v === smooth ? 'on' : '', text: label });
    b.addEventListener('click', () => {
      smooth = v;
      for (const x of resSeg.children) x.classList.toggle('on', x === b);
    });
    resSeg.append(b);
  }
  const body = h('div', { class: 'dlg-col' },
    h('p', { class: 'dlg-note', text: t('currentSize', { w: d.w, h: d.h }) }),
    unitSeg,
    h('div', { class: 'dlg-row' }, field(t('width'), w), field(t('height'), hh)),
    h('label', { class: 'opt-check' }, keep, h('span', { text: t('keepRatio') })),
    quickBox,
    field(t('resample'), resSeg),
    h('p', { class: 'dlg-note', text: t('resampleHint') }));
  const r = await dialog({ title: t('resizeImage'), body, buttons: [{ label: t('cancel'), value: null }, { label: t('ok'), value: 'ok', primary: true }] });
  if (r !== 'ok') return;
  const W = toPx(Number(w.value), d.w);
  const H = toPx(Number(hh.value), d.h);
  if (!(W >= 1 && H >= 1) || W > 16384 || H > 16384) return app.toast(t('sizeInvalid'));
  if (W === d.w && H === d.h) return;
  app.resizeImageTo(W, H, smooth);
}

// ---------------------------------------------------------------- Leinwandgröße
export async function canvasDialog(app) {
  const t = app.t;
  const d = app.doc;
  if (!d) return;
  const w = num(d.w, 1, 16384);
  const hh = num(d.h, 1, 16384);
  let anchor = 'c';
  const grid = h('div', { class: 'anchor-grid' });
  for (const a of ['nw', 'n', 'ne', 'w', 'c', 'e', 'sw', 's', 'se']) {
    const b = h('button', { class: a === anchor ? 'on' : '', title: a });
    b.addEventListener('click', () => {
      anchor = a;
      for (const x of grid.children) x.classList.toggle('on', x === b);
    });
    grid.append(b);
  }
  let fill = 'transparent';
  const fillSeg = h('div', { class: 'seg' });
  for (const v of ['transparent', 'secondary']) {
    const b = h('button', { class: v === fill ? 'on' : '', text: t(`bg_${v}`) });
    b.addEventListener('click', () => {
      fill = v;
      for (const x of fillSeg.children) x.classList.toggle('on', x === b);
    });
    fillSeg.append(b);
  }
  const body = h('div', { class: 'dlg-col' },
    h('p', { class: 'dlg-note', text: t('canvasHint') }),
    h('div', { class: 'dlg-row' }, field(t('width'), w, h('small', { text: 'px' })), field(t('height'), hh, h('small', { text: 'px' }))),
    h('div', { class: 'dlg-row top' }, field(t('anchor'), grid), field(t('newArea'), fillSeg)));
  const r = await dialog({ title: t('canvasSize'), body, buttons: [{ label: t('cancel'), value: null }, { label: t('ok'), value: 'ok', primary: true }] });
  if (r !== 'ok') return;
  const W = Math.round(Number(w.value));
  const H = Math.round(Number(hh.value));
  if (!(W >= 1 && H >= 1 && W <= 16384 && H <= 16384)) return app.toast(t('sizeInvalid'));
  if (W === d.w && H === d.h) return;
  const c = app.colors.secondary;
  app.resizeCanvasTo(W, H, anchor, fill === 'secondary' ? `rgba(${c.r},${c.g},${c.b},${c.a / 255})` : null);
}

// ---------------------------------------------------------------- Effekte
export const effectHasParams = (id) => !!EFFECTS[id]?.params;

/** Effekt auf die aktive Ebene (bzw. die Auswahl darin). preview = nur anzeigen. */
function runEffect(app, id, params, preview) {
  const d = app.doc;
  const l = d.layer;
  const sel = d.selection;
  const r = clampRect(sel || { x: 0, y: 0, w: d.w, h: d.h }, d.w, d.h);
  if (!r) return null;
  const part = makeCanvas(r.w, r.h);
  part.getContext('2d').drawImage(l.canvas, -r.x, -r.y);
  const out = EFFECTS[id].apply(part, params, app.colors.primary);
  const write = (g) => {
    g.save();
    if (sel) {
      selectionPath(g, sel);
      g.clip();
    }
    g.clearRect(r.x, r.y, r.w, r.h);
    g.drawImage(out, r.x, r.y);
    g.restore();
  };
  if (preview) {
    const c = cloneCanvas(l.canvas);
    write(c.getContext('2d'));
    l.preview = c;
    d.compDirty = true;
    app.view.render();
    return null;
  }
  d.editPixels(app.t(`fx_${id}`), (g) => {
    write(g);
    return r;
  });
  app.edited();
  return true;
}

export async function effectDialog(app, id) {
  const t = app.t;
  const d = app.doc;
  if (!d) return;
  app.tools.commit();
  if (d.layer.locked) return app.toast(t('layerLocked'));
  const fx = EFFECTS[id];
  if (!fx.params) {
    runEffect(app, id, {}, false);
    return;
  }
  const params = Object.fromEntries(fx.params.map((p) => [p.k, p.def]));
  let timer = null;
  const update = () => {
    clearTimeout(timer);
    timer = setTimeout(() => runEffect(app, id, params, true), 60);
  };
  const body = h('div', { class: 'dlg-col' });
  for (const p of fx.params) {
    const range = h('input', { type: 'range', min: p.min, max: p.max, value: p.def });
    const out = num(p.def, p.min, p.max);
    const set = (v) => {
      params[p.k] = Math.min(p.max, Math.max(p.min, Number(v) || 0));
      range.value = params[p.k];
      out.value = params[p.k];
      update();
    };
    range.addEventListener('input', () => set(range.value));
    out.addEventListener('change', () => set(out.value));
    body.append(h('label', { class: 'opt-slider' }, h('span', { class: 'opt-label', text: t(`fxp_${p.k}`) }), range, h('span', { class: 'opt-num' }, out)));
  }
  if (fx.color) body.append(h('p', { class: 'dlg-note', text: t('fxUsesPrimary') }));
  if (d.selection) body.append(h('p', { class: 'dlg-note', text: t('fxSelectionOnly') }));
  update();
  const r = await dialog({ title: t(`fx_${id}`), body, className: 'effect-dialog', buttons: [{ label: t('cancel'), value: null }, { label: t('apply'), value: 'ok', primary: true }] });
  clearTimeout(timer);
  d.layer.preview = null;
  d.compDirty = true;
  if (r === 'ok') runEffect(app, id, params, false);
  app.view.render();
}

// ---------------------------------------------------------------- Einstellungen
export async function settingsDialog(app) {
  const t = app.t;
  const s = app.settings;
  const before = s.language;
  const set = (k, v) => {
    s[k] = v;
    app.saveSettings();
  };
  const sel = (items, value, fn) => {
    const el = h('select', { class: 'input' });
    for (const [v, label] of items) {
      const o = h('option', { value: v, text: label });
      if (String(v) === String(value)) o.selected = true;
      el.append(o);
    }
    el.addEventListener('change', () => fn(el.value));
    return el;
  };
  const rowS = (label, el, note) => h('div', { class: 'set-row' }, h('span', {}, h('b', { text: label }), note ? h('small', { text: note }) : null), el);
  const accents = h('div', { class: 'accent-row' });
  const paintAccents = () => {
    accents.innerHTML = '';
    for (const a of ACCENTS) {
      const b = h('button', { class: `accent${s.accent === a ? ' on' : ''}`, style: { '--c': a }, title: a });
      b.addEventListener('click', () => {
        set('accent', a);
        app.applyLook();
        paintAccents();
      });
      accents.append(b);
    }
    const own = h('input', { type: 'color', value: s.accent, title: t('ownColor') });
    own.addEventListener('input', () => {
      set('accent', own.value);
      app.applyLook();
    });
    accents.append(h('label', { class: 'accent own', title: t('ownColor') }, own));
  };
  paintAccents();
  const body = h('div', { class: 'dlg-col settings' },
    h('div', { class: 'set-title', text: t('setLook') }),
    rowS(t('language'), sel(LANGS, s.language, (v) => set('language', v))),
    rowS(t('themeMode'), sel([['system', t('modeSystem')], ['light', t('modeLight')], ['dark', t('modeDark')]], s.mode, (v) => {
      set('mode', v);
      app.applyLook();
    })),
    rowS(t('accent'), accents),
    h('div', { class: 'set-title', text: t('setWork') }),
    rowS(t('wheel'), sel([['zoom', t('wheelZoom')], ['scroll', t('wheelScroll')]], s.wheel, (v) => set('wheel', v)), t('wheelHint')),
    rowS(t('gridFrom'), sel([4, 6, 8, 12, 16, 24].map((z) => [z, `${z * 100} %`]), s.gridMin, (v) => {
      set('gridMin', Number(v));
      app.setView({});
    })),
    rowS(t('checker'), sel([['none', t('checker_none')], ['light', t('checker_light')], ['dark', t('checker_dark')]], s.checker, (v) => app.setView({ checker: v }))),
    rowS(t('smoothDown'), sel([['1', t('on')], ['0', t('off')]], s.smoothDown ? '1' : '0', (v) => app.setView({ smoothDown: v === '1' })), t('smoothDownHint')),
    h('div', { class: 'set-title', text: t('setFiles') }),
    rowS(t('jpgQuality'), sel([100, 95, 92, 90, 85, 80, 70, 60].map((q) => [q, `${q} %`]), s.jpgQuality, (v) => set('jpgQuality', Number(v))), t('jpgQualityHint')),
    app.info?.fileIcons ? rowS(t('fileIcons'), sel([['auto', t('fileIconsAuto')], ['light', t('modeLight')], ['dark', t('modeDark')]], s.fileIcons, (v) => set('fileIcons', v)), t('fileIconsHint')) : null,
  );
  await dialog({ title: t('settings'), body, wide: true, buttons: [{ label: t('close'), value: 'ok', primary: true }] });
  if (s.language !== before) {
    document.documentElement.lang = s.language;
    app.rebuild();
  }
}

// ---------------------------------------------------------------- Tastenkürzel und Über
export function shortcutsDialog(app) {
  const t = app.t;
  const mac = app.info?.platform === 'darwin';
  const k = (s) => keyLabel(s, mac);
  const rows = [
    [t('newImage'), k('Mod+N')], [t('open'), k('Mod+O')], [t('save'), k('Mod+S')], [t('saveAs'), k('Mod+Shift+S')],
    [t('undo'), k('Mod+Z')], [t('redo'), k(mac ? 'Mod+Shift+Z' : 'Mod+Y')], [t('copy'), k('Mod+C')], [t('paste'), k('Mod+V')],
    [t('pasteNewLayer'), k('Mod+Shift+V')], [t('newFromClipboard'), k('Mod+Alt+V')], [t('selectAll'), k('Mod+A')], [t('deselect'), k('Mod+D')],
    [t('delete'), k('Delete')], [t('fillPrimary'), k('Alt+Backspace')], [t('resizeImage'), k('Mod+R')], [t('canvasSize'), k('Mod+Shift+R')],
    [t('cropToSelection'), k('Mod+Shift+X')], [t('layerNew'), k('Mod+Shift+N')], [t('layerDuplicate'), k('Mod+J')], [t('layerMergeDown'), k('Mod+E')],
    [t('zoomFit'), k('Mod+0')], [t('zoom100'), k('Mod+1')], [t('pixelGrid'), k("Mod+'")], [t('showPanel'), 'Tab'],
    [t('swapColors'), 'X'], [t('resetColors'), 'D'], [t('brushSize'), '[ ]'], [t('panView'), t('keySpace')],
    [t('pickColor'), `Alt+${t('click')}`], [t('straightLine'), `Shift+${t('click')}`], [t('nextImage'), k('Mod+Right')], [t('fullscreen'), 'F11'],
  ];
  const tools = Object.entries(TOOL_KEYS).map(([id, key]) => [t(`tool_${id}`), key]);
  const table = (list) => h('div', { class: 'keys' }, ...list.map(([a, b]) => h('div', { class: 'key-row' }, h('span', { text: a }), h('kbd', { text: b }))));
  const body = h('div', { class: 'dlg-col' }, h('div', { class: 'set-title', text: t('tools') }), table(tools), h('div', { class: 'set-title', text: t('commands') }), table(rows));
  return dialog({ title: t('shortcuts'), body, wide: true, buttons: [{ label: t('close'), value: 'ok', primary: true }] });
}

export function aboutDialog(app, info) {
  const t = app.t;
  const body = h('div', { class: 'about' },
    h('div', { html: logoSvg(76) }),
    h('div', { class: 'about-name', text: 'Picline' }),
    h('div', { class: 'about-ver', text: `${t('version')} ${info.version || ''}` }),
    h('p', { text: t('aboutText') }),
    h('p', { class: 'dlg-note', html: `${icon('globe', 14)} mert.win/pic · MIT` }));
  return dialog({ title: t('about'), body, buttons: [{ label: t('close'), value: 'ok', primary: true }] });
}
