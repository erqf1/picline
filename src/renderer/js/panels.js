// Seitenpanel rechts: Einstellungen des Werkzeugs, Farbauswahl mit Paletten und die Ebenen.
import { h, $, prompt, toast } from './ui.js';
import { icon } from './icons.js';
import { ColorPicker, PALETTES, parseHex, toHex } from './color.js';
import { SHAPES, FONTS } from './shapes.js';
import { BLENDS, cloneCanvas } from './doc.js';

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

export class Side {
  constructor(app) {
    this.app = app;
    this.el = $('#side');
    this.target = 'primary';
    this.thumbTimer = null;
    app.layerOps = this.layerOps();
  }
  get t() {
    return this.app.t;
  }

  rebuild() {
    const t = this.t;
    this.el.innerHTML = '';
    const section = (id, title) => {
      const collapsed = !!this.app.settings.panels?.[id];
      const head = h('button', { class: 'side-head', html: `<span>${title}</span>${icon('down', 14)}` });
      const body = h('div', { class: 'side-body' });
      const sec = h('section', { class: `side-sec${collapsed ? ' collapsed' : ''}`, id: `sec-${id}` }, head, body);
      head.addEventListener('click', () => {
        sec.classList.toggle('collapsed');
        this.app.settings.panels = { ...this.app.settings.panels, [id]: sec.classList.contains('collapsed') };
        this.app.saveSettings();
      });
      this.el.append(sec);
      return { head, body, sec };
    };
    this.toolSec = section('tool', t('toolOptions'));
    this.colorSec = section('color', t('colors'));
    this.layerSec = section('layers', t('layers'));
    this.buildColors();
    this.toolChanged();
    this.renderLayers(true);
  }

  // ---------------------------------------------------------------- Werkzeug
  toolChanged() {
    const app = this.app;
    const t = this.t;
    const id = app.tools.id;
    const o = app.opts[id] || {};
    const save = () => app.saveSettings();
    const set = (k, v) => {
      o[k] = v;
      save();
      if (app.tools.text) app.tools.refreshText();
      app.view.render();
    };
    this.toolSec.head.querySelector('span').textContent = t(`tool_${id}`);
    const b = this.toolSec.body;
    b.innerHTML = '';
    const sizeRow = (max = 300) => {
      this.sizeSlider = slider(t('size'), o.size, { min: 1, max, unit: 'px' }, (v) => set('size', v));
      return this.sizeSlider;
    };
    const mirror = () => row(t('mirrorPaint'), select(['none', 'x', 'y', 'xy'].map((m) => [m, t(`mirror_${m}`)]), app.opts.mirror, (v) => {
      app.opts.mirror = v;
      save();
      app.view.render();
      app.toolChanged();
    }));
    switch (id) {
      case 'brush':
        b.append(
          seg([['round', t('brush_round'), 'brushRound'], ['marker', t('brush_marker'), 'brushMarker'], ['calli', t('brush_calli'), 'brushCalli'], ['spray', t('brush_spray'), 'brushSpray'], ['pencil', t('brush_pencil'), 'brushPencil']], o.style, (v) => {
            set('style', v);
            this.toolChanged();
          }, { icons: true, cls: 'wide' }),
          sizeRow(500),
          slider(t('opacity'), o.opacity, { min: 1, max: 100, unit: '%' }, (v) => set('opacity', v)),
        );
        if (o.style === 'round') b.append(slider(t('hardness'), o.hardness, { min: 0, max: 100, unit: '%' }, (v) => set('hardness', v)));
        b.append(check(t('penPressure'), o.pressure, (v) => set('pressure', v)), mirror(), hint(t('hintPaint')));
        break;
      case 'pixel':
        b.append(
          sizeRow(64),
          slider(t('opacity'), o.opacity, { min: 1, max: 100, unit: '%' }, (v) => set('opacity', v)),
          check(t('roundTip'), o.round, (v) => set('round', v)),
          check(t('pixelPerfect'), o.perfect, (v) => set('perfect', v), t('pixelPerfectHint')),
          mirror(),
          hint(t('hintPixel')),
        );
        break;
      case 'eraser':
        b.append(seg([['soft', t('eraser_soft')], ['hard', t('eraser_hard')], ['pixel', t('eraser_pixel')]], o.mode, (v) => {
          set('mode', v);
          this.toolChanged();
        }, { cls: 'wide' }), sizeRow(o.mode === 'pixel' ? 64 : 500), slider(t('opacity'), o.opacity, { min: 1, max: 100, unit: '%' }, (v) => set('opacity', v)));
        if (o.mode === 'soft') b.append(slider(t('hardness'), o.hardness, { min: 0, max: 100, unit: '%' }, (v) => set('hardness', v)));
        b.append(mirror());
        break;
      case 'fill':
        b.append(
          slider(t('tolerance'), o.tolerance, { min: 0, max: 100, unit: '%' }, (v) => set('tolerance', v)),
          check(t('contiguous'), o.contiguous, (v) => set('contiguous', v), t('contiguousHint')),
          check(t('sampleAll'), o.sampleAll, (v) => set('sampleAll', v)),
          hint(t('hintFill')),
        );
        break;
      case 'picker':
        b.append(
          check(t('sampleAll'), o.sampleAll, (v) => set('sampleAll', v)),
          row(t('sampleSize'), seg([[1, '1 px'], [3, '3×3'], [5, '5×5']], o.avg, (v) => set('avg', v))),
          check(t('pickerBack'), o.back, (v) => set('back', v)),
          hint(t('hintPicker')),
        );
        break;
      case 'shapes': {
        const grid = h('div', { class: 'shape-grid' });
        for (const s of SHAPES) {
          const btn = h('button', { class: `shape-btn${o.type === s ? ' on' : ''}`, title: t(`shape_${s}`), html: icon(s, 20) });
          btn.addEventListener('click', () => {
            set('type', s);
            for (const x of grid.children) x.classList.toggle('on', x === btn);
          });
          grid.append(btn);
        }
        b.append(
          grid,
          slider(t('lineWidth'), o.width, { min: 1, max: 100, unit: 'px' }, (v) => set('width', v)),
          check(t('outline'), o.stroke, (v) => set('stroke', v)),
          row(t('shapeFill'), seg([['none', t('fill_none')], ['secondary', t('fill_secondary')], ['primary', t('fill_primary')]], o.fill, (v) => set('fill', v))),
          check(t('pixelExact'), o.pixel, (v) => set('pixel', v), t('pixelExactHint')),
          hint(t('hintShapes')),
        );
        break;
      }
      case 'text': {
        const fonts = FONTS.map((f) => [f, f === 'system-ui' ? t('fontSystem') : f === 'serif' ? 'Serif' : f === 'monospace' ? 'Monospace' : f]);
        const style = h('div', { class: 'seg' });
        for (const [k2, ic] of [['bold', 'bold'], ['italic', 'italic'], ['underline', 'underline']]) {
          const btn = h('button', { class: o[k2] ? 'on' : '', title: t(`text_${k2}`), html: icon(ic, 16) });
          btn.addEventListener('click', () => {
            set(k2, !o[k2]);
            btn.classList.toggle('on', o[k2]);
          });
          style.append(btn);
        }
        b.append(
          row(t('font'), select(fonts, o.font, (v) => set('font', v))),
          slider(t('size'), o.size, { min: 4, max: 600, unit: 'px' }, (v) => set('size', v)),
          h('div', { class: 'opt-row' }, style, seg([['left', t('alignLeft'), 'alignLeft'], ['center', t('alignCenter'), 'alignCenter'], ['right', t('alignRight'), 'alignRight']], o.align, (v) => set('align', v), { icons: true })),
          check(t('textBg'), o.bg, (v) => set('bg', v)),
          check(t('pixelExact'), o.pixel, (v) => set('pixel', v), t('pixelTextHint')),
          hint(t('hintText')),
        );
        break;
      }
      case 'select': {
        b.append(row(t('selectShape'), seg([['rect', t('select_rect'), 'select'], ['ellipse', t('select_ellipse'), 'selectEllipse']], o.shape, (v) => set('shape', v), { icons: true })));
        const btns = h('div', { class: 'opt-buttons' });
        const add = (label, fn) => {
          const x = h('button', { class: 'btn small', text: label });
          x.addEventListener('click', fn);
          btns.append(x);
        };
        add(t('selectAll'), () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: !isMac(), metaKey: isMac() })));
        add(t('cropToSelection'), () => app.doc?.selection && app.cropTo(app.doc.selection));
        b.append(btns, hint(t('hintSelect')));
        break;
      }
      case 'move':
        b.append(check(t('smoothScale'), app.opts.move.smooth, (v) => {
          set('smooth', v);
          if (app.tools.float) {
            app.tools.float.smooth = v;
            app.view.render();
          }
        }, t('smoothScaleHint')));
        this.floatButtons(b);
        b.append(hint(t('hintMove')));
        break;
      case 'crop': {
        const ratios = ['free', 'image', '1:1', '4:3', '3:2', '16:9', '9:16', '3:4', '2:3'];
        b.append(row(t('ratio'), select(ratios.map((r) => [r, r === 'free' ? t('ratioFree') : r === 'image' ? t('ratioImage') : r]), o.ratio, (v) => set('ratio', v))));
        this.cropFields = h('div', { class: 'crop-fields' });
        b.append(this.cropFields);
        const btns = h('div', { class: 'opt-buttons' });
        const ok = h('button', { class: 'btn small primary', html: `${icon('check', 14)}<span>${t('applyCrop')}</span>` });
        ok.addEventListener('click', () => app.tools.applyCrop());
        const reset = h('button', { class: 'btn small', text: t('reset') });
        reset.addEventListener('click', () => {
          app.tools.startCrop();
          app.view.render();
        });
        btns.append(reset, ok);
        b.append(btns, hint(t('hintCrop')));
        this.cropChanged();
        break;
      }
      case 'hand':
        b.append(hint(t('hintHand')));
        break;
      case 'zoom': {
        const btns = h('div', { class: 'opt-buttons' });
        const fit = h('button', { class: 'btn small', text: t('zoomFit') });
        fit.addEventListener('click', () => app.view.fit());
        const one = h('button', { class: 'btn small', text: '100 %' });
        one.addEventListener('click', () => app.view.setZoom(1));
        btns.append(fit, one);
        b.append(btns, hint(t('hintZoom')));
        break;
      }
    }
  }
  floatButtons(b) {
    const app = this.app;
    const t = this.t;
    const box = h('div', { class: 'opt-buttons float-buttons' });
    const f = app.tools.float;
    if (f) {
      const ok = h('button', { class: 'btn small primary', html: `${icon('check', 14)}<span>${t('apply')}</span>` });
      ok.addEventListener('click', () => app.tools.applyFloat());
      const no = h('button', { class: 'btn small', text: t('cancel') });
      no.addEventListener('click', () => app.tools.cancelFloat());
      box.append(no, ok);
    }
    this.floatBox = box;
    b.append(box);
  }
  floatChanged() {
    if (this.app.tools.id !== 'move' || !this.floatBox) return;
    const had = this.floatBox.children.length > 0;
    if (had !== !!this.app.tools.float) {
      const parent = this.floatBox.parentNode;
      const next = this.floatBox.nextSibling;
      this.floatBox.remove();
      const tmp = h('div');
      this.floatButtons(tmp);
      parent.insertBefore(this.floatBox, next);
    }
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
    const o = this.app.opts[this.app.tools.id];
    if (!o || !('size' in o)) return;
    const s = o.size;
    const step = s < 10 ? 1 : s < 50 ? 2 : s < 120 ? 5 : 10;
    o.size = Math.max(1, Math.min(500, s + dir * step));
    this.sizeSlider?.setValue(o.size);
    if (this.app.tools.text) this.app.tools.refreshText();
    this.app.view.render();
    this.app.saveSettings();
    toast(`${this.t('size')}: ${o.size} px`, { ms: 900 });
  }

  // ---------------------------------------------------------------- Farben
  buildColors() {
    const app = this.app;
    const t = this.t;
    const b = this.colorSec.body;
    b.innerHTML = '';
    const pair = h('div', { class: 'color-pair' });
    this.pairBtns = {};
    for (const which of ['primary', 'secondary']) {
      const btn = h('button', { class: `color-target${this.target === which ? ' on' : ''}` }, h('i', { class: 'swatch-dot' }), h('span', { text: t(which === 'primary' ? 'primaryColor' : 'secondaryColor') }));
      btn.addEventListener('click', () => this.focusColor(which));
      this.pairBtns[which] = btn;
      pair.append(btn);
    }
    this.picker = new ColorPicker((c) => {
      // kommt vom Farbfeld selbst: nicht zurückschreiben (sonst springt der Farbton bei Grautönen)
      this.fromPicker = true;
      app.setColor(this.target, c, { remember: false });
      this.fromPicker = false;
    });
    this.picker.onCommit = () => app.rememberColor(app.colors[this.target]);
    this.palBox = h('div', { class: 'palette' });
    this.recentBox = h('div', { class: 'palette recent' });
    const palSel = select(Object.keys(PALETTES).map((p) => [p, t(`pal_${p}`)]), app.settings.palette, (v) => {
      app.settings.palette = v;
      app.saveSettings();
      this.renderPalette();
    });
    b.append(pair, this.picker.el, row(t('palette'), palSel), this.palBox, h('div', { class: 'opt-label small', text: t('recentColors') }), this.recentBox);
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
    this.colorSec.sec.classList.remove('collapsed');
    this.colorsChanged();
  }
  paintPair() {
    for (const [which, btn] of Object.entries(this.pairBtns)) {
      const c = this.app.colors[which];
      btn.classList.toggle('on', which === this.target);
      btn.querySelector('.swatch-dot').style.setProperty('--c', `rgba(${c.r},${c.g},${c.b},${c.a / 255})`);
    }
  }
  colorsChanged() {
    if (!this.picker) return;
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
    this.renderLayers(kind === 'structure');
  }
  renderLayers() {
    const app = this.app;
    const t = this.t;
    const b = this.layerSec.body;
    b.innerHTML = '';
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
      const thumb = h('canvas', { class: 'layer-thumb', width: 44, height: 32 });
      this.thumbs.set(l, { canvas: thumb, version: -1 });
      const name = h('span', { class: 'layer-name', text: l.name });
      const item = h('div', { class: `layer${i === d.active ? ' active' : ''}${l.visible ? '' : ' hidden-layer'}`, draggable: 'true' }, eye, thumb, name, lock);
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
    const opacity = slider(t('opacity'), Math.round(l.opacity * 100), { min: 0, max: 100, unit: '%' }, (v) => {
      d.setLayerProp(l, 'opacity', v / 100, t('opacity'));
      app.view.render();
    });
    const blend = row(t('blendMode'), select(BLENDS.map((m) => [m, t(`blend_${m}`)]), l.blend, (v) => {
      d.setLayerProp(l, 'blend', v, t('blendMode'));
      app.edited();
    }));
    b.append(bar, list, opacity, blend);
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
          this.renderLayers();
        }
      },
    };
  }
}
const isMac = () => /Mac/.test(navigator.platform);
export { toHex, cloneCanvas };
