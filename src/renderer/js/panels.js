// Seitenpanel rechts - aufgebaut wie in Paint 3D: oben wählt man eine Kategorie (Auswählen, Pinsel, Formen, Text,
// Effekte, Leinwand, Ebenen), rechts erscheinen dazu große Kacheln mit Namen, darunter Einstellungen und Farben.
import { h, $, prompt, toast } from './ui.js';
import { icon } from './icons.js';
import { ColorPicker, PALETTES, parseHex, toHex } from './color.js';
import { SHAPES, FONTS } from './shapes.js';
import { BLENDS, cloneCanvas } from './doc.js';
import * as D from './dialogs.js';

/** Kategorien: id, Symbol, Werkzeuge darin */
export const CATS = [
  ['select', 'select', ['select', 'move', 'hand', 'zoom']],
  ['brushes', 'brush', ['brush', 'pixel', 'eraser', 'fill', 'picker']],
  ['shapes', 'shapes', ['shapes']],
  ['text', 'text', ['text']],
  ['effects', 'effects', []],
  ['canvas', 'crop', ['crop']],
  ['layers', 'layers', []],
];
export const catOfTool = (id) => (CATS.find((c) => c[2].includes(id)) || [])[0] || null;
export const catLabel = (t, id) => ({ select: t('tool_select'), brushes: t('tool_brush'), shapes: t('tool_shapes'), text: t('tool_text'), effects: t('menuEffects'), canvas: t('cat_canvas'), layers: t('layers') })[id];
const PIXEL_SIZES = [1, 2, 3, 4, 6, 8];
const EFFECTS = [['brightness', 'sun'], ['hue', 'palette'], ['grayscale', 'fxGray'], ['invert', 'fxInvert'], ['sepia', 'fxSepia'], ['posterize', 'fxSteps'],
  ['threshold', 'fxThreshold'], ['blur', 'fxBlur'], ['sharpen', 'fxSharpen'], ['noise', 'brushSpray'], ['pixelate', 'grid'], ['outline', 'fxOutline']];

// ---------------------------------------------------------------- kleine Bedienelemente
function slider(label, value, { min, max, step = 1, unit = '' }, onInput) {
  const range = h('input', { type: 'range', min, max, step, value });
  const num = h('input', { class: 'input num', type: 'number', min, max, step, value });
  const set = (v, from) => {
    v = Math.min(max, Math.max(min, Number(v)));
    if (!Number.isFinite(v)) return;
    if (from !== range) range.value = v;
    if (from !== num) num.value = v;
    onInput(v);
  };
  range.addEventListener('input', () => set(range.value, range));
  num.addEventListener('change', () => set(num.value, num));
  const row = h('label', { class: 'opt-slider' }, h('span', { class: 'opt-label', text: label }), range, h('span', { class: 'opt-num' }, num, unit ? h('small', { text: unit }) : null));
  row.setValue = (v) => {
    range.value = v;
    num.value = v;
  };
  return row;
}
function seg(items, current, onChange, { icons = false, cls = '' } = {}) {
  const el = h('div', { class: `seg ${cls}` });
  for (const [v, label, ic] of items) {
    const b = h('button', { class: v === current ? 'on' : '', title: label, html: icons && ic ? icon(ic, 18) : label });
    b.addEventListener('click', () => {
      for (const x of el.children) x.classList.remove('on');
      b.classList.add('on');
      onChange(v);
    });
    el.append(b);
  }
  return el;
}
function check(label, value, onChange, hint) {
  const inp = h('input', { type: 'checkbox' });
  inp.checked = !!value;
  inp.addEventListener('change', () => onChange(inp.checked));
  return h('label', { class: 'opt-check' }, inp, h('span', {}, label, hint ? h('small', { text: hint }) : null));
}
function select(items, value, onChange) {
  const s = h('select', { class: 'input' });
  for (const [v, label] of items) {
    const o = h('option', { value: v, text: label });
    if (v === value) o.selected = true;
    s.append(o);
  }
  s.addEventListener('change', () => onChange(s.value));
  return s;
}
const row = (label, ...el) => h('div', { class: 'opt-row' }, h('span', { class: 'opt-label', text: label }), ...el);
const hint = (text) => h('p', { class: 'opt-hint', text });
/** Kachel wie in Paint 3D: großes Symbol, Name darunter, die gewählte ist deutlich markiert */
function tile(ic, label, on, run, title) {
  const b = h('button', { class: `tile${on ? ' on' : ''}`, title: title || label, html: `${icon(ic, 26)}<span>${label}</span>` });
  b.addEventListener('click', run);
  return b;
}
const heading = (text) => h('div', { class: 'side-title', text });

export class Side {
  constructor(app) {
    this.app = app;
    this.el = $('#side');
    this.cat = catOfTool(app.tools.id) || 'brushes';
    this.target = 'primary';
    this.thumbTimer = null;
    app.layerOps = this.layerOps();
  }
  get t() {
    return this.app.t;
  }
  rebuild() {
    this.render();
  }
  /** Kategorie oben gewählt: passendes Werkzeug nehmen (das zuletzt darin benutzte) */
  setCat(cat) {
    const app = this.app;
    this.cat = cat;
    const tools = CATS.find((c) => c[0] === cat)[2];
    if (tools.length && !tools.includes(app.tools.id)) {
      const last = app.settings.catTool?.[cat];
      app.tools.set(tools.includes(last) ? last : tools[0]);
    }
    this.render();
    app.refreshCats();
  }
  toolChanged() {
    const app = this.app;
    const c = catOfTool(app.tools.id);
    if (c) {
      this.cat = c;
      app.settings.catTool = { ...app.settings.catTool, [c]: app.tools.id };
    }
    this.render();
    app.refreshCats?.();
  }

  render() {
    const t = this.t;
    const b = this.el;
    b.innerHTML = '';
    this.cropFields = null;
    this.floatBox = null;
    this.thumbs = null;
    this.picker = null;
    b.append(h('div', { class: 'side-cat', text: catLabel(t, this.cat) }));
    const body = h('div', { class: 'side-body' });
    b.append(body);
    this.body = body;
    ({ select: () => this.renderSelect(body), brushes: () => this.renderBrushes(body), shapes: () => this.renderShapes(body), text: () => this.renderText(body),
      effects: () => this.renderEffects(body), canvas: () => this.renderCanvas(body), layers: () => this.renderLayers(body) })[this.cat]();
  }

  set(id, k, v) {
    this.app.opts[id][k] = v;
    this.app.saveSettings();
    if (this.app.tools.text) this.app.tools.refreshText();
    this.app.view.render();
  }
  mirrorRow() {
    const app = this.app;
    return row(this.t('mirrorPaint'), select(['none', 'x', 'y', 'xy'].map((m) => [m, this.t(`mirror_${m}`)]), app.opts.mirror, (v) => {
      app.opts.mirror = v;
      app.saveSettings();
      app.view.render();
      app.refreshQuick?.();
    }));
  }

  // ---------------------------------------------------------------- Pinsel (inkl. Pixelstift, Radierer, Füllen, Pipette)
  renderBrushes(b) {
    const app = this.app;
    const t = this.t;
    const tl = app.tools;
    const cur = tl.id === 'brush' ? `brush:${app.opts.brush.style}` : tl.id;
    const items = [
      ['brush:round', 'brush', t('tool_brush')], ['brush:marker', 'brushMarker', t('brush_marker')], ['brush:calli', 'brushCalli', t('brush_calli')],
      ['brush:spray', 'brushSpray', t('brush_spray')], ['brush:pencil', 'brushPencil', t('brush_pencil')], ['pixel', 'pixel', t('tool_pixel')],
      ['eraser', 'eraser', t('tool_eraser')], ['fill', 'fill', t('tool_fill')], ['picker', 'picker', t('tool_picker')],
    ];
    const grid = h('div', { class: 'tiles' });
    for (const [key, ic, label] of items) {
      grid.append(tile(ic, label, key === cur, () => {
        const [tool, style] = key.split(':');
        if (style) app.opts.brush.style = style;
        app.saveSettings();
        if (tool !== tl.id) tl.set(tool);
        else this.render();
      }, `${label}${({ brush: ' (B)', pixel: ' (P)', eraser: ' (E)', fill: ' (G)', picker: ' (I)' })[key.split(':')[0]] || ''}`));
    }
    b.append(grid);
    const o = app.opts[tl.id];
    const opts = h('div', { class: 'side-group' }, heading(t('settings')));
    if (tl.id === 'brush') {
      this.sizeSlider = slider(t('size'), o.size, { min: 1, max: 500, unit: 'px' }, (v) => this.set('brush', 'size', v));
      opts.append(this.sizeSlider, slider(t('opacity'), o.opacity, { min: 1, max: 100, unit: '%' }, (v) => this.set('brush', 'opacity', v)));
      if (o.style === 'round') opts.append(slider(t('hardness'), o.hardness, { min: 0, max: 100, unit: '%' }, (v) => this.set('brush', 'hardness', v)));
      opts.append(check(t('penPressure'), o.pressure, (v) => this.set('brush', 'pressure', v)), this.mirrorRow());
    } else if (tl.id === 'pixel') {
      // Pixelstift: nur Pixel - Größe in ganzen Pixeln, immer hart, immer volle Farbe
      if (!PIXEL_SIZES.includes(o.size)) o.size = 1;
      opts.append(row(t('size'), seg(PIXEL_SIZES.map((n) => [n, `${n}`]), o.size, (v) => {
        this.set('pixel', 'size', v);
        this.render();
      }, { cls: 'pixel-sizes' })));
      if (o.size === 1) opts.append(check(t('pixelPerfect'), o.perfect, (v) => this.set('pixel', 'perfect', v), t('pixelPerfectHint')));
      opts.append(this.mirrorRow());
    } else if (tl.id === 'eraser') {
      opts.append(row(t('eraserMode'), seg([['soft', t('eraser_soft')], ['hard', t('eraser_hard')], ['pixel', t('eraser_pixel')]], o.mode, (v) => {
        this.set('eraser', 'mode', v);
        this.render();
      })));
      this.sizeSlider = slider(t('size'), o.size, { min: 1, max: o.mode === 'pixel' ? 64 : 500, unit: 'px' }, (v) => this.set('eraser', 'size', v));
      opts.append(this.sizeSlider, slider(t('opacity'), o.opacity, { min: 1, max: 100, unit: '%' }, (v) => this.set('eraser', 'opacity', v)));
      if (o.mode === 'soft') opts.append(slider(t('hardness'), o.hardness, { min: 0, max: 100, unit: '%' }, (v) => this.set('eraser', 'hardness', v)));
      opts.append(this.mirrorRow());
    } else if (tl.id === 'fill') {
      opts.append(
        slider(t('tolerance'), o.tolerance, { min: 0, max: 100, unit: '%' }, (v) => this.set('fill', 'tolerance', v)),
        check(t('contiguous'), o.contiguous, (v) => this.set('fill', 'contiguous', v), t('contiguousHint')),
        check(t('sampleAll'), o.sampleAll, (v) => this.set('fill', 'sampleAll', v)),
      );
    } else if (tl.id === 'picker') {
      opts.append(
        check(t('sampleAll'), o.sampleAll, (v) => this.set('picker', 'sampleAll', v)),
        row(t('sampleSize'), seg([[1, '1 px'], [3, '3×3'], [5, '5×5']], o.avg, (v) => this.set('picker', 'avg', v))),
        check(t('pickerBack'), o.back, (v) => this.set('picker', 'back', v)),
      );
    }
    b.append(opts);
    this.buildColors(b);
    b.append(hint(t({ brush: 'hintPaint', pixel: 'hintPixel', eraser: 'hintPaint', fill: 'hintFill', picker: 'hintPicker' }[tl.id])));
  }

  // ---------------------------------------------------------------- Formen und Text
  renderShapes(b) {
    const app = this.app;
    const t = this.t;
    const o = app.opts.shapes;
    const grid = h('div', { class: 'tiles' });
    for (const s of SHAPES) {
      grid.append(tile(s, t(`shape_${s}`), o.type === s, () => {
        this.set('shapes', 'type', s);
        this.render();
      }));
    }
    b.append(grid, h('div', { class: 'side-group' }, heading(t('settings')),
      slider(t('lineWidth'), o.width, { min: 1, max: 100, unit: 'px' }, (v) => this.set('shapes', 'width', v)),
      check(t('outline'), o.stroke, (v) => this.set('shapes', 'stroke', v)),
      row(t('shapeFill'), seg([['none', t('fill_none')], ['secondary', t('fill_secondary')], ['primary', t('fill_primary')]], o.fill, (v) => this.set('shapes', 'fill', v))),
      check(t('pixelExact'), o.pixel, (v) => this.set('shapes', 'pixel', v), t('pixelExactHint'))));
    this.buildColors(b);
    b.append(hint(t('hintShapes')));
  }
  renderText(b) {
    const app = this.app;
    const t = this.t;
    const o = app.opts.text;
    const fonts = FONTS.map((f) => [f, f === 'system-ui' ? t('fontSystem') : f === 'serif' ? 'Serif' : f === 'monospace' ? 'Monospace' : f]);
    const style = h('div', { class: 'seg' });
    for (const [k2, ic] of [['bold', 'bold'], ['italic', 'italic'], ['underline', 'underline']]) {
      const btn = h('button', { class: o[k2] ? 'on' : '', title: t(`text_${k2}`), html: icon(ic, 16) });
      btn.addEventListener('click', () => {
        this.set('text', k2, !o[k2]);
        btn.classList.toggle('on', o[k2]);
      });
      style.append(btn);
    }
    b.append(h('div', { class: 'side-group' },
      row(t('font'), select(fonts, o.font, (v) => this.set('text', 'font', v))),
      (this.sizeSlider = slider(t('size'), o.size, { min: 4, max: 600, unit: 'px' }, (v) => this.set('text', 'size', v))),
      h('div', { class: 'opt-row' }, style, seg([['left', t('alignLeft'), 'alignLeft'], ['center', t('alignCenter'), 'alignCenter'], ['right', t('alignRight'), 'alignRight']], o.align, (v) => this.set('text', 'align', v), { icons: true })),
      check(t('textBg'), o.bg, (v) => this.set('text', 'bg', v)),
      check(t('pixelExact'), o.pixel, (v) => this.set('text', 'pixel', v), t('pixelTextHint'))));
    this.buildColors(b);
    b.append(hint(t('hintText')));
  }

  // ---------------------------------------------------------------- Auswählen
  renderSelect(b) {
    const app = this.app;
    const t = this.t;
    const tl = app.tools;
    const cur = tl.id === 'select' ? `select:${app.opts.select.shape}` : tl.id;
    const grid = h('div', { class: 'tiles' });
    for (const [key, ic, label] of [['select:rect', 'select', t('select_rect')], ['select:ellipse', 'selectEllipse', t('select_ellipse')], ['move', 'move', t('tool_move')], ['hand', 'hand', t('tool_hand')], ['zoom', 'zoom', t('tool_zoom')]]) {
      grid.append(tile(ic, label, key === cur, () => {
        const [tool, shape] = key.split(':');
        if (shape) app.opts.select.shape = shape;
        app.saveSettings();
        if (tool !== tl.id) tl.set(tool);
        else this.render();
      }));
    }
    b.append(grid);
    const acts = h('div', { class: 'opt-buttons wide' });
    const act = (label, fn, dis) => {
      const x = h('button', { class: 'btn small', text: label });
      x.disabled = !!dis;
      x.addEventListener('click', fn);
      acts.append(x);
    };
    const d = app.doc;
    act(t('selectAll'), () => app.cmd.selectAll(), !d);
    act(t('deselect'), () => app.cmd.deselect(), !d?.selection);
    act(t('cropToSelection'), () => d?.selection && app.cropTo(d.selection), !d?.selection);
    act(t('copy'), () => app.cmd.copy(), !d);
    act(t('paste'), () => app.pasteImage(), false);
    act(t('delete'), () => app.cmd.deleteSelection(), !d);
    b.append(h('div', { class: 'side-group' }, heading(t('commands')), acts));
    if (tl.id === 'move' || tl.float) {
      const g = h('div', { class: 'side-group' }, heading(t('settings')), check(t('smoothScale'), app.opts.move.smooth, (v) => {
        this.set('move', 'smooth', v);
        if (tl.float) {
          tl.float.smooth = v;
          app.view.render();
        }
      }, t('smoothScaleHint')));
      this.floatButtons(g);
      b.append(g);
    }
    b.append(hint(t(tl.id === 'move' ? 'hintMove' : tl.id === 'hand' ? 'hintHand' : tl.id === 'zoom' ? 'hintZoom' : 'hintSelect')));
  }
  floatButtons(container) {
    const app = this.app;
    const t = this.t;
    const box = h('div', { class: 'opt-buttons' });
    if (app.tools.float) {
      const ok = h('button', { class: 'btn small primary', html: `${icon('check', 14)}<span>${t('apply')}</span>` });
      ok.addEventListener('click', () => app.tools.applyFloat());
      const no = h('button', { class: 'btn small', text: t('cancel') });
      no.addEventListener('click', () => app.tools.cancelFloat());
      box.append(no, ok);
    }
    this.floatBox = box;
    container.append(box);
  }
  floatChanged() {
    if (this.cat === 'select' || this.cat === 'shapes') this.render();
  }

  // ---------------------------------------------------------------- Effekte, Leinwand
  renderEffects(b) {
    const app = this.app;
    const t = this.t;
    const grid = h('div', { class: 'tiles' });
    for (const [id, ic] of EFFECTS) grid.append(tile(ic, t(`fx_${id}`).replace(/ \(.*\)$/, ''), false, () => app.doc && D.effectDialog(app, id), t(`fx_${id}`)));
    b.append(grid, hint(t(app.doc?.selection ? 'fxSelectionOnly' : 'fxLayerHint')));
  }
  renderCanvas(b) {
    const app = this.app;
    const t = this.t;
    const o = app.opts.crop;
    const ratios = ['free', 'image', '1:1', '4:3', '3:2', '16:9', '9:16', '3:4', '2:3'];
    const g = h('div', { class: 'side-group' }, heading(t('crop')));
    g.append(row(t('ratio'), select(ratios.map((r) => [r, r === 'free' ? t('ratioFree') : r === 'image' ? t('ratioImage') : r]), o.ratio, (v) => this.set('crop', 'ratio', v))));
    this.cropFields = h('div', { class: 'crop-fields' });
    g.append(this.cropFields);
    const btns = h('div', { class: 'opt-buttons' });
    const ok = h('button', { class: 'btn small primary', html: `${icon('check', 14)}<span>${t('applyCrop')}</span>` });
    ok.addEventListener('click', () => app.tools.applyCrop());
    const reset = h('button', { class: 'btn small', text: t('reset') });
    reset.addEventListener('click', () => {
      app.tools.startCrop();
      app.view.render();
    });
    btns.append(reset, ok);
    g.append(btns, hint(t('hintCrop')));
    const grid = h('div', { class: 'tiles' });
    const ops = app.imageOps;
    for (const [ic, label, fn] of [['image', t('resizeImage').replace('…', ''), ops.resize], ['fit', t('canvasSize').replace('…', ''), ops.canvas], ['rotateR', t('rotateRight'), () => ops.rotate(90)],
      ['rotateL', t('rotateLeft'), () => ops.rotate(-90)], ['flipH', t('flipH'), () => ops.flip('h')], ['flipV', t('flipV'), () => ops.flip('v')], ['crop', t('autoCrop'), ops.autoCrop]]) {
      grid.append(tile(ic, label, false, () => app.doc && fn()));
    }
    b.append(g, h('div', { class: 'side-group' }, heading(t('menuImage')), grid));
    this.cropChanged();
  }
  cropChanged() {
    const box = this.cropFields;
    if (!box || this.app.tools.id !== 'crop') return;
    const r = this.app.tools.cropRect;
    if (!r) {
      box.innerHTML = '';
      return;
    }
    if (box.contains(document.activeElement)) return;
    box.innerHTML = '';
    for (const k of ['x', 'y', 'w', 'h']) {
      const inp = h('input', { class: 'input num', type: 'number', value: r[k] });
      inp.addEventListener('change', () => {
        const v = Math.round(Number(inp.value));
        if (!Number.isFinite(v) || ((k === 'w' || k === 'h') && v < 1)) return;
        this.app.tools.cropRect = { ...this.app.tools.cropRect, [k]: v };
        this.app.view.render();
        this.app.cropChanged();
      });
      box.append(h('label', { class: 'crop-field' }, h('span', { text: k === 'w' ? this.t('width') : k === 'h' ? this.t('height') : k.toUpperCase() }), inp));
    }
  }
  /** [ und ]: Größe des Werkzeugs ändern */
  bumpSize(dir) {
    const id = this.app.tools.id;
    const o = this.app.opts[id];
    if (!o || !('size' in o)) return;
    if (id === 'pixel') {
      const i = Math.max(0, PIXEL_SIZES.indexOf(o.size));
      o.size = PIXEL_SIZES[Math.min(PIXEL_SIZES.length - 1, Math.max(0, i + dir))];
      if (this.cat === 'brushes') this.render();
    } else {
      const s = o.size;
      const step = s < 10 ? 1 : s < 50 ? 2 : s < 120 ? 5 : 10;
      o.size = Math.max(1, Math.min(500, s + dir * step));
      this.sizeSlider?.setValue(o.size);
    }
    if (this.app.tools.text) this.app.tools.refreshText();
    this.app.view.render();
    this.app.saveSettings();
    toast(`${this.t('size')}: ${o.size} px`, { ms: 900 });
  }

  // ---------------------------------------------------------------- Farben
  buildColors(container) {
    const app = this.app;
    const t = this.t;
    const g = h('div', { class: 'side-group' }, heading(t('colors')));
    const pair = h('div', { class: 'color-pair' });
    this.pairBtns = {};
    for (const which of ['primary', 'secondary']) {
      const btn = h('button', { class: `color-target${this.target === which ? ' on' : ''}` }, h('i', { class: 'swatch-dot' }), h('span', { text: t(which === 'primary' ? 'primaryColor' : 'secondaryColor') }));
      btn.addEventListener('click', () => this.focusColor(which));
      this.pairBtns[which] = btn;
      pair.append(btn);
    }
    const swap = h('button', { class: 'icon-btn small', title: `${t('swapColors')} (X)`, html: icon('swap', 16) });
    swap.addEventListener('click', () => app.cmd.swapColors());
    pair.append(swap);
    this.palBox = h('div', { class: 'palette' });
    this.recentBox = h('div', { class: 'palette recent' });
    this.picker = new ColorPicker((c) => {
      // kommt vom Farbfeld selbst: nicht zurückschreiben (sonst springt der Farbton bei Grautönen)
      this.fromPicker = true;
      app.setColor(this.target, c, { remember: false });
      this.fromPicker = false;
    });
    this.picker.onCommit = () => app.rememberColor(app.colors[this.target]);
    const palSel = select(Object.keys(PALETTES).map((p) => [p, t(`pal_${p}`)]), app.settings.palette, (v) => {
      app.settings.palette = v;
      app.saveSettings();
      this.renderPalette();
    });
    g.append(pair, this.palBox, row(t('palette'), palSel), h('div', { class: 'opt-label small', text: t('recentColors') }), this.recentBox, this.picker.el);
    container.append(g);
    this.renderPalette();
    this.colorsChanged();
  }
  renderPalette() {
    const pal = PALETTES[this.app.settings.palette] || PALETTES.basic;
    this.palBox.innerHTML = '';
    for (const hex of pal) this.palBox.append(this.swatch(hex));
  }
  swatch(hex) {
    const c = parseHex(hex);
    const b = h('button', { class: 'pal-swatch', title: `${hex}\n${this.t('swatchHint')}`, style: { '--c': hex } });
    b.addEventListener('click', () => this.app.setColor('primary', c));
    b.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.app.setColor('secondary', c);
    });
    return b;
  }
  focusColor(which) {
    this.target = which;
    this.colorsChanged();
  }
  paintPair() {
    for (const [which, btn] of Object.entries(this.pairBtns || {})) {
      const c = this.app.colors[which];
      btn.classList.toggle('on', which === this.target);
      btn.querySelector('.swatch-dot').style.setProperty('--c', `rgba(${c.r},${c.g},${c.b},${c.a / 255})`);
    }
  }
  colorsChanged() {
    if (!this.picker || !this.picker.el.isConnected) return;
    this.paintPair();
    if (!this.fromPicker) this.picker.set(this.app.colors[this.target]);
    this.recentBox.innerHTML = '';
    for (const hex of this.app.settings.recentColors || []) this.recentBox.append(this.swatch(hex));
    if (!this.app.settings.recentColors?.length) this.recentBox.append(h('span', { class: 'opt-hint', text: this.t('noRecentColors') }));
  }

  // ---------------------------------------------------------------- Ebenen
  docChanged(kind) {
    if (kind === 'pixels') {
      clearTimeout(this.thumbTimer);
      this.thumbTimer = setTimeout(() => this.updateThumbs(), 200);
      return;
    }
    if (kind === 'saved') return;
    if (this.cat === 'layers') this.render();
    else if (this.cat === 'select' || this.cat === 'effects') this.render();
  }
  renderLayers(b) {
    const app = this.app;
    const t = this.t;
    const d = app.doc;
    if (!d) {
      b.append(hint(t('noImage')));
      return;
    }
    const ops = app.layerOps;
    const bar = h('div', { class: 'layer-bar' });
    const btn = (ic, title, fn, disabled) => {
      const x = h('button', { class: 'icon-btn small', title, html: icon(ic, 16) });
      x.disabled = !!disabled;
      x.addEventListener('click', fn);
      bar.append(x);
    };
    btn('layerAdd', t('layerNew'), () => ops.add());
    btn('duplicate', t('layerDuplicate'), () => ops.duplicate());
    btn('merge', t('layerMergeDown'), () => ops.mergeDown(), d.active === 0);
    btn('up', t('layerUp'), () => ops.move(1), d.active >= d.layers.length - 1);
    btn('down', t('layerDown'), () => ops.move(-1), d.active === 0);
    btn('trash', t('layerDelete'), () => ops.remove(), d.layers.length < 2);
    const list = h('div', { class: 'layer-list' });
    this.thumbs = new Map();
    for (let i = d.layers.length - 1; i >= 0; i--) {
      const l = d.layers[i];
      const eye = h('button', { class: `icon-btn tiny${l.visible ? '' : ' off'}`, title: t(l.visible ? 'hideLayer' : 'showLayer'), html: icon(l.visible ? 'eye' : 'eyeOff', 15) });
      eye.addEventListener('click', (e) => {
        e.stopPropagation();
        d.setLayerProp(l, 'visible', !l.visible, t(l.visible ? 'hideLayer' : 'showLayer'));
        app.edited();
      });
      const lock = h('button', { class: `icon-btn tiny lock${l.locked ? ' on' : ''}`, title: t('lockLayer'), html: icon('lock', 13) });
      lock.addEventListener('click', (e) => {
        e.stopPropagation();
        d.setLayerProp(l, 'locked', !l.locked, t('lockLayer'));
      });
      const thumb = h('canvas', { class: 'layer-thumb', width: 52, height: 38 });
      this.thumbs.set(l, { canvas: thumb, version: -1 });
      const item = h('div', { class: `layer${i === d.active ? ' active' : ''}${l.visible ? '' : ' hidden-layer'}`, draggable: 'true' }, eye, thumb, h('span', { class: 'layer-name', text: l.name }), lock);
      item.addEventListener('click', () => ops.select(i));
      item.addEventListener('dblclick', () => ops.rename(l));
      item.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/x-picline-layer', String(i));
        e.dataTransfer.effectAllowed = 'move';
      });
      item.addEventListener('dragover', (e) => {
        if ([...e.dataTransfer.types].includes('text/x-picline-layer')) {
          e.preventDefault();
          item.classList.add('drop');
        }
      });
      item.addEventListener('dragleave', () => item.classList.remove('drop'));
      item.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        item.classList.remove('drop');
        const from = Number(e.dataTransfer.getData('text/x-picline-layer'));
        if (Number.isFinite(from) && from !== i) ops.moveTo(from, i);
      });
      list.append(item);
    }
    const l = d.layer;
    b.append(bar, list, h('div', { class: 'side-group' }, heading(l.name),
      slider(t('opacity'), Math.round(l.opacity * 100), { min: 0, max: 100, unit: '%' }, (v) => {
        d.setLayerProp(l, 'opacity', v / 100, t('opacity'));
        app.view.render();
      }),
      row(t('blendMode'), select(BLENDS.map((m) => [m, t(`blend_${m}`)]), l.blend, (v) => {
        d.setLayerProp(l, 'blend', v, t('blendMode'));
        app.edited();
      }))));
    this.updateThumbs(true);
  }
  updateThumbs(force) {
    if (!this.thumbs) return;
    for (const [l, x] of this.thumbs) {
      if (!force && x.version === l.version) continue;
      x.version = l.version;
      const g = x.canvas.getContext('2d');
      const W = x.canvas.width;
      const H = x.canvas.height;
      g.clearRect(0, 0, W, H);
      const src = l.preview || l.canvas;
      const k = Math.min(W / src.width, H / src.height);
      const w = Math.max(1, src.width * k);
      const hh = Math.max(1, src.height * k);
      g.imageSmoothingEnabled = k < 1;
      g.drawImage(src, (W - w) / 2, (H - hh) / 2, w, hh);
    }
  }
  layerOps() {
    const app = this.app;
    const t = this.t;
    const after = () => {
      app.view.render();
      app.edited();
    };
    return {
      select: (i) => {
        const d = app.doc;
        if (!d || i === d.active) return;
        app.tools.commit();
        d.active = i;
        d.changed('layers');
      },
      add: () => {
        const d = app.doc;
        app.tools.commit();
        d.structural(t('layerNew'), () => {
          d.layers.splice(d.active + 1, 0, d.newLayer(app.layerName()));
          d.active++;
        });
        after();
      },
      duplicate: () => {
        const d = app.doc;
        app.tools.commit();
        d.structural(t('layerDuplicate'), () => {
          const src = d.layer;
          const l = d.newLayer(t('copyOf', { name: src.name }), src.canvas);
          Object.assign(l, { opacity: src.opacity, blend: src.blend, visible: src.visible });
          d.layers.splice(d.active + 1, 0, l);
          d.active++;
        });
        after();
      },
      remove: () => {
        const d = app.doc;
        if (d.layers.length < 2) return;
        app.tools.commit();
        d.structural(t('layerDelete'), () => {
          d.layers.splice(d.active, 1);
          d.active = Math.max(0, d.active - 1);
        });
        after();
      },
      mergeDown: () => {
        const d = app.doc;
        if (d.active === 0) return;
        app.tools.commit();
        d.structural(t('layerMergeDown'), () => {
          const top = d.layer;
          const below = d.layers[d.active - 1];
          const g = below.ctx;
          g.save();
          g.globalAlpha = top.visible ? top.opacity : 0;
          g.globalCompositeOperation = top.blend;
          g.drawImage(top.canvas, 0, 0);
          g.restore();
          below.version++;
          d.layers.splice(d.active, 1);
          d.active--;
        });
        after();
      },
      move: (dir) => {
        const d = app.doc;
        const j = d.active + dir;
        if (j < 0 || j >= d.layers.length) return;
        app.layerOps.moveTo(d.active, j);
      },
      moveTo: (from, to) => {
        const d = app.doc;
        app.tools.commit();
        d.structural(t('layerOrder'), () => {
          const [l] = d.layers.splice(from, 1);
          d.layers.splice(to, 0, l);
          d.active = to;
        });
        after();
      },
      rename: async (l = app.doc.layer) => {
        const name = await prompt(t('layerProperties'), t('layerName'), l.name, { okLabel: t('ok'), cancelLabel: t('cancel') });
        if (name != null && name.trim()) {
          app.doc.setLayerProp(l, 'name', name.trim(), t('layerProperties'));
          this.render();
        }
      },
    };
  }
}
export { toHex, cloneCanvas };
