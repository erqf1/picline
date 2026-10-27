'use strict';

// Selbsttest (unsichtbar): npx electron . --selftest <ordner>
// Malt mit echten Zeiger-Ereignissen, prüft Pixel, Rückgängig, Ebenen, Formen, Text, Speichern - und macht Bilder.
const fs = require('fs');
const path = require('path');

module.exports = function selftest(win, dir) {
  const wc = win.webContents;
  const errors = [];
  wc.on('console-message', (e) => {
    const { level, message } = e;
    if (level === 'error' || level === 3) errors.push(message);
  });
  fs.mkdirSync(dir, { recursive: true });
  const shot = async (name) => {
    await new Promise((r) => setTimeout(r, 250));
    await wc.capturePage();
    const img = await wc.capturePage();
    fs.writeFileSync(path.join(dir, `${name}.png`), img.toPNG());
  };
  const js = (code) => wc.executeJavaScript(code, true);
  const results = [];
  const check = (name, ok, info = '') => {
    results.push(`${ok ? 'ok  ' : 'FEHL'} ${name}${info ? ` (${info})` : ''}`);
  };

  wc.once('did-finish-load', async () => {
    try {
      win.setSize(1400, 900);
      await new Promise((r) => setTimeout(r, 900));
      await shot('01-start');
      // Hilfen im Fenster: Zeiger-Ereignisse in Bild-Koordinaten
      await js(`
        window.T = {
          P: window.__picline,
          ev(type, x, y, o = {}) {
            const app = this.P.app;
            const v = app.view;
            const s = v.toScreen(x, y);
            const r = v.canvas.getBoundingClientRect();
            const e = new PointerEvent(type, { clientX: r.left + s.x, clientY: r.top + s.y, button: o.button || 0, buttons: 1, pointerId: 1, pointerType: 'mouse', bubbles: true, shiftKey: !!o.shift, altKey: !!o.alt });
            v.canvas.dispatchEvent(e);
          },
          drag(pts, o) {
            this.ev('pointerdown', pts[0][0], pts[0][1], o);
            for (const [x, y] of pts.slice(1)) this.ev('pointermove', x, y, o);
            const l = pts[pts.length - 1];
            this.ev('pointerup', l[0], l[1], o);
          },
          px(x, y, all = true) {
            const d = this.P.app.doc;
            const src = all ? d.composite() : d.layer.canvas;
            return [...src.getContext('2d').getImageData(x, y, 1, 1).data];
          },
        };
        1`);

      // 1) Neues Bild 64x64 durchsichtig, Pixelstift
      await js(`T.P.newDoc(64, 64, 'transparent'); T.P.app.tools.set('pixel'); T.P.app.opts.pixel.size = 1; T.P.app.setColor('primary', { r: 255, g: 0, b: 0, a: 255 }); 1`);
      await js(`T.drag([[2.5, 2.5], [10.5, 2.5]]); 1`);
      let p = await js(`[T.px(2, 2), T.px(10, 2), T.px(11, 2), T.px(5, 3)]`);
      check('Pixelstift setzt genau eine Pixelreihe', p[0][0] === 255 && p[0][3] === 255 && p[1][3] === 255 && p[2][3] === 0 && p[3][3] === 0, JSON.stringify(p));

      // 2) Rückgängig / Wiederholen
      await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true })); 1`);
      p = await js(`T.px(5, 2)`);
      check('Rückgängig', p[3] === 0, JSON.stringify(p));
      await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', ctrlKey: true, bubbles: true })); 1`);
      p = await js(`T.px(5, 2)`);
      check('Wiederholen', p[3] === 255, JSON.stringify(p));

      // 3) Spiegelmalen links/rechts
      await js(`T.P.app.opts.mirror = 'x'; T.P.app.setColor('primary', { r: 0, g: 0, b: 255, a: 255 }); T.drag([[3.5, 20.5], [3.5, 22.5]]); T.P.app.opts.mirror = 'none'; 1`);
      p = await js(`[T.px(3, 21), T.px(60, 21)]`);
      check('Spiegelmalen', p[0][2] === 255 && p[1][2] === 255, JSON.stringify(p));

      // 4) Füllen: Rechteck-Rahmen zeichnen und innen füllen
      await js(`T.P.app.tools.set('shapes'); Object.assign(T.P.app.opts.shapes, { type: 'rect', width: 1, pixel: true, fill: 'none', stroke: true }); T.P.app.setColor('primary', { r: 0, g: 128, b: 0, a: 255 }); T.drag([[20, 30], [30, 34], [40, 40]]); T.P.app.tools.applyFloat(); 1`);
      p = await js(`[T.px(20, 30), T.px(30, 30), T.px(30, 35), T.px(19, 30)]`);
      check('Rechteck pixel-genau', p[0][1] === 128 && p[0][3] === 255 && p[1][3] === 255 && p[2][3] === 0 && p[3][3] === 0, JSON.stringify(p));
      await js(`T.P.app.tools.set('fill'); T.P.app.opts.fill.tolerance = 0; T.P.app.setColor('primary', { r: 255, g: 200, b: 0, a: 255 }); T.ev('pointerdown', 30.5, 35.5); T.ev('pointerup', 30.5, 35.5); 1`);
      p = await js(`[T.px(30, 35), T.px(45, 35)]`);
      check('Füllen bleibt im Rahmen', p[0][0] === 255 && p[0][1] === 200 && p[1][3] === 0, JSON.stringify(p));

      // 5) Pipette
      await js(`T.P.app.tools.set('picker'); T.ev('pointerdown', 30.5, 35.5); T.ev('pointerup', 30.5, 35.5); 1`);
      p = await js(`T.P.app.colors.primary`);
      check('Pipette', p.r === 255 && p.g === 200 && p.b === 0, JSON.stringify(p));
      const back = await js(`T.P.app.tools.id`);
      check('Pipette danach zurück', back === 'fill', back);

      // 6) Ebenen: neue Ebene, malen, ausblenden, zusammenführen
      await js(`T.P.app.layerOps.add(); T.P.app.tools.set('brush'); Object.assign(T.P.app.opts.brush, { size: 8, opacity: 100, hardness: 100, style: 'round' }); T.P.app.setColor('primary', { r: 10, g: 20, b: 30, a: 255 }); T.drag([[50, 50], [55, 55]]); 1`);
      p = await js(`[T.P.app.doc.layers.length, T.px(52, 52), T.px(52, 52, false)]`);
      check('Neue Ebene + Pinsel', p[0] === 2 && p[1][3] === 255 && p[2][0] === 10, JSON.stringify(p));
      await js(`T.P.app.doc.setLayerProp(T.P.app.doc.layer, 'visible', false, 'x'); 1`);
      p = await js(`T.px(52, 52)`);
      check('Ebene ausblenden', p[3] === 0, JSON.stringify(p));
      await js(`T.P.app.doc.setLayerProp(T.P.app.doc.layer, 'visible', true, 'x'); T.P.app.layerOps.mergeDown(); 1`);
      p = await js(`[T.P.app.doc.layers.length, T.px(52, 52, false)]`);
      check('Zusammenführen', p[0] === 1 && p[1][3] === 255, JSON.stringify(p));

      // 7) Bildgröße 4x mit scharfen Pixeln
      await js(`T.P.resizeImageTo(256, 256, false); 1`);
      p = await js(`[T.P.app.doc.w, T.px(8, 8), T.px(11, 11), T.px(8, 12)]`);
      check('Vergrößern scharf', p[0] === 256 && p[1][0] === 255 && p[2][0] === 255 && p[3][3] === 0, JSON.stringify(p));
      await js(`T.P.app.doc.undo(); 1`);
      p = await js(`T.P.app.doc.w`);
      check('Größe rückgängig', p === 64, String(p));

      // 8) Auswahl verschieben
      await js(`T.P.app.tools.set('select'); T.drag([[20, 30], [30, 35], [41, 41]]); 1`);
      p = await js(`T.P.app.doc.selection`);
      check('Auswahl', p && p.w === 21 && p.h === 11, JSON.stringify(p));
      await js(`T.drag([[30, 35], [30, 40], [30, 45]]); T.P.app.tools.applyFloat(); 1`);
      p = await js(`[T.px(30, 45), T.px(30, 35), T.px(20, 40)]`);
      check('Inhalt verschoben', p[0][1] === 200 && p[1][3] === 0 && p[2][1] === 128, JSON.stringify(p));

      // 9) Text
      await js(`T.P.app.doc.selection = null; T.P.app.tools.set('text'); Object.assign(T.P.app.opts.text, { size: 12, pixel: true, font: 'Arial', bold: true }); T.P.app.setColor('primary', { r: 0, g: 0, b: 0, a: 255 }); T.ev('pointerdown', 2, 6); T.ev('pointerup', 2, 6); 1`);
      await new Promise((r) => setTimeout(r, 100));
      await js(`const ta = document.querySelector('.text-input'); ta.value = 'Hi'; ta.dispatchEvent(new Event('input')); 1`);
      await shot('02-text-tippen');
      await js(`T.P.app.tools.commitText(); 1`);
      p = await js(`(() => { const d = T.P.app.doc.composite().getContext('2d').getImageData(0, 4, 20, 16).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] === 255 && d[i - 3] === 0 && d[i - 1] === 0) n++; return n; })()`);
      check('Text gezeichnet', p > 20, `${p} schwarze Pixel`);

      // 10) Speichern-Formate
      p = await js(`(async () => { const d = T.P.app.doc; const out = {}; for (const f of ['png', 'jpeg', 'webp', 'bmp', 'ico', 'picline']) { const b = await T.P.encode(d, f, {}); out[f] = b.length; } return out; })()`);
      check('Formate kodieren', Object.values(p).every((n) => n > 50), JSON.stringify(p));
      p = await js(`(async () => { const d = T.P.app.doc; const b = await T.P.encode(d, 'picline'); const back = await T.P.openBytes(b, 'test.picline'); return [back.w, back.layers.length, T.px(30, 45)]; })()`);
      check('Projekt laden', p[0] === 64 && p[2][1] === 200, JSON.stringify(p));
      p = await js(`(async () => { const b = await T.P.encode(T.P.app.doc, 'bmp'); const back = await T.P.openBytes(b, 'test.bmp'); return T.px(30, 45); })()`);
      check('BMP lesen/schreiben', p[1] === 200 && p[3] === 255, JSON.stringify(p));

      // 10b) Geöffnete Bilder starten im Ansehen-Modus (wie Cutline)
      p = await js(`[T.P.app.viewMode, document.body.classList.contains('viewing'), getComputedStyle(document.getElementById('cats')).display]`);
      check('Geöffnet = Ansehen-Modus', p[0] === true && p[1] === true && p[2] === 'none', JSON.stringify(p));
      await shot('07-ansehen');
      p = await js(`(() => { const before = T.px(1, 1); T.P.app.tools.id = 'brush'; T.drag([[1, 1], [6, 6]]); return [before, T.px(3, 3), T.P.app.doc.canUndo]; })()`);
      check('Ansehen malt nicht', p[2] === false, JSON.stringify(p));
      await js(`document.getElementById('q-mode').click(); 1`);
      p = await js(`[T.P.app.viewMode, getComputedStyle(document.getElementById('cats')).display]`);
      check('Knopf Bearbeiten', p[0] === false && p[1] !== 'none', JSON.stringify(p));

      // 10d) Weiches Zoomen: gleitet zum Ziel, der Punkt unter der Maus bleibt stehen
      p = await js(`(async () => { const v = T.P.app.view; v.setZoom(2); const before = v.toDoc(300, 200); v.zoomBy(1.25 ** 3, 300, 200); await new Promise((r) => setTimeout(r, 80)); const mid = v.zoom; await new Promise((r) => setTimeout(r, 700)); const after = v.toDoc(300, 200); return [mid, v.zoom, Math.abs(after.x - before.x) + Math.abs(after.y - before.y)]; })()`);
      check('Weiches Zoomen', p[0] > 2 && p[0] < 3.9 && Math.abs(p[1] - 3.90625) < 0.001 && p[2] < 0.5, JSON.stringify(p));

      // 10c) Vollbild: nur das Bild
      await js(`T.P.applyFullscreen(true); 1`);
      await new Promise((r) => setTimeout(r, 300));
      p = await js(`[getComputedStyle(document.getElementById('topbar')).display, getComputedStyle(document.getElementById('statusbar')).display, getComputedStyle(document.getElementById('fs-bar')).display]`);
      check('Vollbild zeigt nur das Bild', p[0] === 'none' && p[1] === 'none' && p[2] === 'flex', JSON.stringify(p));
      await shot('08-vollbild');
      await js(`T.P.applyFullscreen(false); 1`);

      // 11) Effekt
      await js(`T.P.app.tools.set('brush'); 1`);
      p = await js(`(async () => { const { EFFECTS } = {}; return 1; })()`);
      await js(`T.P.app.doc.selection = null; 1`);

      // Bilder für Ansicht
      await js(`T.P.app.view.setZoom(8); T.P.app.view.center(); T.P.app.setView({ gridEvery: 16 }); 1`);
      await shot('03-pixel-zoom');
      await js(`T.P.newDoc(800, 520, 'white'); T.P.app.tools.set('brush'); Object.assign(T.P.app.opts.brush, { size: 30, hardness: 30, style: 'round' }); T.P.app.setColor('primary', { r: 139, g: 92, b: 246, a: 255 }); T.drag([[100, 100], [200, 160], [320, 140], [420, 220], [560, 180], [680, 300]]); Object.assign(T.P.app.opts.brush, { style: 'spray', size: 60 }); T.P.app.setColor('primary', { r: 236, g: 72, b: 153, a: 255 }); T.drag([[120, 380], [260, 420], [400, 380]]); T.P.app.tools.set('shapes'); Object.assign(T.P.app.opts.shapes, { type: 'star', width: 6, pixel: false, fill: 'secondary' }); T.P.app.setColor('secondary', { r: 250, g: 204, b: 21, a: 255 }); T.P.app.setColor('primary', { r: 30, g: 30, b: 30, a: 255 }); T.drag([[520, 320], [600, 400], [700, 480]]); 1`);
      await shot('04-malen-form');
      await js(`T.P.app.tools.applyFloat(); 1`);
      await js(`document.querySelector('[data-cat=effects]').click(); 1`);
      await shot('05-effekte');
      await js(`document.querySelector('[data-cat=brushes]').click(); 1`);
      await shot('05b-pinsel');
      // helles Design
      await js(`T.P.app.settings.mode = 'light'; T.P.app.applyLook(); 1`);
      await shot('06-hell');
      await js(`T.P.app.settings.mode = 'dark'; T.P.app.applyLook(); 1`);
    } catch (e) {
      results.push(`FEHL Ausnahme: ${e.message || e}`);
    }
    if (errors.length) results.push(...errors.slice(0, 10).map((e) => `KONSOLE ${e}`));
    const failed = results.filter((r) => !r.startsWith('ok')).length;
    const text = `${results.join('\n')}\n\n${failed} fehlgeschlagen`;
    fs.writeFileSync(path.join(dir, 'result.txt'), text);
    console.log(text);
    require('electron').app.exit(failed ? 1 : 0);
  });
};
