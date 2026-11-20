'use strict';

// Bilder für die Website (unsichtbar): npx electron . --siteshots <ordner>
// Je Sprache (en, de) eine Reihe Szenen: Pixelgrafik, Malen, Pinsel-Stile, Formen, Text, Ebenen, Effekte, Zuschneiden,
// Exportieren, Einstellungen, hell, Acryl (dunkel/hell) und der Ansehen-Modus. Danach in WebP umwandeln:
// python tools/webp.py <ordner> website-updates/img
const fs = require('fs');
const path = require('path');

module.exports = function siteshots(win, dir) {
  const wc = win.webContents;
  fs.mkdirSync(dir, { recursive: true });
  const js = (code) => wc.executeJavaScript(code, true);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const made = [];
  const shot = async (name) => {
    await wait(400);
    await wc.capturePage();
    const img = await wc.capturePage();
    fs.writeFileSync(path.join(dir, `${name}.png`), img.toPNG());
    made.push(name);
  };
  const esc = () => js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); 1`);

  wc.once('did-finish-load', async () => {
   try {
    win.setContentSize(1440, 900);
    await wait(800);
    // Hilfen im Fenster: Zeiger-Ereignisse in Bild-Koordinaten, Menüpunkte nach Text
    await js(`
      window.S = {
        get app() { return window.__picline.app; },
        ev(type, x, y) {
          const v = this.app.view, r = v.canvas.getBoundingClientRect(), s = v.toScreen(x, y);
          v.canvas.dispatchEvent(new PointerEvent(type, { clientX: r.left + s.x, clientY: r.top + s.y, pointerId: 1, pointerType: 'mouse', buttons: type === 'pointermove' && !this.down ? 0 : 1, pressure: 0.5, bubbles: true }));
        },
        drag(pts) {
          this.down = true;
          this.ev('pointerdown', ...pts[0]);
          for (const p of pts.slice(1)) this.ev('pointermove', ...p);
          this.ev('pointerup', ...pts[pts.length - 1]);
          this.down = false;
        },
        hover(x, y) { this.ev('pointermove', x, y); },
        wave(x0, x1, y, amp, n = 40, per = 4) { const out = []; for (let i = 0; i <= n; i++) out.push([x0 + (x1 - x0) * i / n, y + Math.sin(i / per) * amp]); return out; },
        color(which, hex) { const n = parseInt(hex.slice(1), 16); this.app.setColor(which, { r: n >> 16, g: (n >> 8) & 255, b: n & 255, a: 255 }, { remember: false }); },
        menuItem(label) { return [...document.querySelectorAll('.menu .menu-item')].find((r) => r.querySelector('.menu-label')?.textContent === label); },
        clearDocs() { const app = this.app; while (app.docs.length) { app.docs[0].markSaved(); app.docs.splice(0, 1); } app.doc = null; },
        look(mode, look = 'standard') { Object.assign(this.app.settings, { mode, look }); this.app.applyLook(); },
      };
      1`);

    for (const lang of ['en', 'de']) {
      const de = lang === 'de';
      const L = (en, deText) => (de ? deText : en);
      await js(`(async () => {
        const P = window.__picline, app = P.app;
        S.clearDocs();
        Object.assign(app.settings, { language: '${lang}', mode: 'dark', look: 'standard', accent: '#8b5cf6', gridEvery: 0, tile: false, recentColors: ['#5D3A1A', '#8B5A2B', '#C8C8C8', '#FFFFFF', '#3AB3DA', '#169C9C'] });
        app.applyLook(); app.rebuild(); app.setView({ grid: true });
        // 1) Schwert 16x16 als Pixelgrafik
        const d = P.newDoc(16, 16, 'transparent', '${L('sword', 'schwert')}.png');
        const g = d.layers[0].ctx;
        const px = (x, y, c) => { g.fillStyle = c; g.fillRect(x, y, 1, 1); };
        const blade = ['#0e3f3a', '#1aa79b', '#33ebcb', '#a4fde8'];
        for (let i = 0; i < 10; i++) { const x = 4 + i, y = 11 - i; px(x, y - 1, blade[0]); px(x + 1, y - 1, blade[1]); px(x, y, blade[2]); px(x + 1, y, blade[3]); px(x + 1, y + 1, blade[0]); }
        for (const [x, y] of [[2, 11], [3, 12], [4, 13], [5, 14], [6, 15]]) px(x, y, '#3a2410');
        for (const [x, y] of [[3, 11], [4, 12], [5, 13]]) px(x, y, '#6b4a24');
        for (const [x, y] of [[2, 9], [3, 10], [6, 13], [7, 14], [4, 10], [5, 11]]) px(x, y, '#2b2b2b');
        d.touch(d.layers[0]);
        d.markSaved();
        app.settings.palette = 'pico8';
        app.tools.set('pixel'); app.opts.pixel.size = 1;
        S.color('primary', '#33EBCB');
        app.view.fit(); app.setView({ gridEvery: 8 });
        app.rebuild();
        return 1;
      })()`);
      await js(`S.hover(9.5, 6.5); 1`);
      await shot(`pixel-${lang}`);

      // 2) Malen
      await js(`(async () => {
        const P = window.__picline, app = P.app;
        app.setView({ gridEvery: 0 }); app.settings.palette = 'basic';
        const d = P.newDoc(1280, 800, 'white', '${L('sunset', 'sonnenuntergang')}.png');
        const g = d.layers[0].ctx;
        const sky = g.createLinearGradient(0, 0, 0, 800); sky.addColorStop(0, '#2b1055'); sky.addColorStop(0.55, '#d53369'); sky.addColorStop(1, '#feb47b');
        g.fillStyle = sky; g.fillRect(0, 0, 1280, 800);
        g.fillStyle = '#ffd56b'; g.beginPath(); g.arc(640, 520, 150, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#1b0f2e';
        g.beginPath(); g.moveTo(0, 800); g.lineTo(0, 560); g.lineTo(180, 470); g.lineTo(330, 560); g.lineTo(520, 430); g.lineTo(700, 600); g.lineTo(860, 480); g.lineTo(1040, 590); g.lineTo(1280, 450); g.lineTo(1280, 800); g.fill();
        for (let i = 0; i < 70; i++) { g.fillStyle = 'rgba(255,255,255,' + (0.3 + Math.random() * 0.6) + ')'; g.fillRect(Math.random() * 1280, Math.random() * 280, 2, 2); }
        d.touch(d.layers[0]);
        d.markSaved();
        app.tools.set('brush'); Object.assign(app.opts.brush, { style: 'round', size: 26, hardness: 55, opacity: 90 });
        S.color('primary', '#FFD56B');
        app.view.fit(); app.rebuild();
        S.drag(S.wave(180, 1060, 230, 60));
        S.hover(1060, 210);
        return 1;
      })()`);
      await shot(`paint-${lang}`);

      // 3) Ebenen + verschiebbare Form
      await js(`(async () => {
        const P = window.__picline, app = P.app, d = app.doc;
        app.layerOps.add();
        d.layer.name = '${L('Stars', 'Sterne')}';
        app.tools.set('shapes'); Object.assign(app.opts.shapes, { type: 'star', width: 8, stroke: true, fill: 'secondary', pixel: false });
        S.color('primary', '#FFFFFF'); S.color('secondary', '#FACC15');
        S.drag([[860, 120], [950, 200], [1040, 290]]);
        app.tools.applyFloat();
        S.drag([[120, 90], [180, 140], [230, 190]]);
        app.layerOps.add(); d.layer.name = 'Text';
        const g = d.layer.ctx; g.font = 'bold 120px Segoe UI, sans-serif'; g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.fillText('${L('Good night', 'Gute Nacht')}', 640, 380); d.touch(d.layer);
        d.layers.forEach((l) => l.version++); app.edited(); app.rebuild();
        return 1;
      })()`);
      await js(`(() => { const a = S.app; a.layerOps.select(1); a.tools.set('move'); a.doc.selection = { type: 'rect', x: 860, y: 120, w: 182, h: 172 }; S.drag([[950, 210], [930, 230]]); a.tools.float.angle = 0.25; a.view.render(); return 1; })()`);
      await shot(`layers-${lang}`);

      // 4) Ebenen-Panel: Mischmodus und Deckkraft
      await js(`(() => {
        const a = S.app, d = a.doc;
        a.tools.applyFloat(); d.selection = null;
        d.layers[1].opacity = 0.85;
        d.layers[2].blend = 'overlay';
        d.layers.forEach((l) => l.version++); a.edited();
        a.layerOps.select(2);
        a.tools.set('brush');
        a.side.setCat('layers');
        a.rebuild(); a.view.render();
        return 1; })()`);
      await shot(`layers-panel-${lang}`);
      await js(`(() => { const d = S.app.doc; d.layers[2].blend = 'source-over'; d.layers.forEach((l) => l.version++); S.app.edited(); S.app.view.render(); return 1; })()`);

      // 5) Effekt-Dialog (Farbton ins Kühle: Blau, Violett, Pink)
      await js(`(() => { const a = S.app; a.layerOps.select(0); document.querySelector('[data-cat=effects]').click(); document.querySelectorAll('.tile')[1].click(); return 1; })()`);
      await wait(300);
      await js(`(() => { const r = document.querySelector('.effect-dialog input[type=range]'); r.value = -60; r.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
      await shot(`effects-${lang}`);
      await esc();
      await wait(200);

      // 6) Pinsel-Stile auf hellem Papier
      await js(`(() => {
        const P = window.__picline, a = S.app;
        P.newDoc(1280, 800, 'white', '${L('brushes', 'pinsel')}.png');
        a.view.fit();
        a.tools.set('brush');
        const strokes = [
          ['round', '#8B5CF6', 34, 100, 180],
          ['marker', '#EC4899', 40, 70, 300],
          ['calli', '#1E3A8A', 26, 100, 420],
          ['spray', '#14B8A6', 70, 100, 545],
          ['pencil', '#374151', 6, 100, 660],
        ];
        for (const [style, c, size, opacity, y] of strokes) {
          Object.assign(a.opts.brush, { style, size, opacity, hardness: 80 });
          S.color('primary', c);
          S.drag(S.wave(140, 1140, y, 34, 50, 5));
        }
        a.doc.markSaved();
        Object.assign(a.opts.brush, { style: 'calli', size: 26, opacity: 100 });
        S.color('primary', '#1E3A8A');
        a.side.setCat('brushes');
        a.rebuild();
        S.hover(1180, 420);
        return 1; })()`);
      await shot(`brushes-${lang}`);

      // 7) Formen - die letzte bleibt verschieb- und drehbar
      await js(`(() => {
        const P = window.__picline, a = S.app;
        P.newDoc(1280, 800, 'white', '${L('shapes', 'formen')}.png');
        a.view.fit();
        a.tools.set('shapes');
        const list = [
          ['roundrect', '#1E293B', '#C4B5FD', 6, [[90, 90], [330, 300]]],
          ['ellipse', '#1E293B', '#5EEAD4', 6, [[400, 80], [640, 310]]],
          ['triangle', '#1E293B', '#93C5FD', 6, [[720, 90], [960, 310]]],
          ['hexagon', '#1E293B', '#F9A8D4', 6, [[1010, 80], [1220, 310]]],
          ['arrow', '#8B5CF6', '#8B5CF6', 14, [[110, 560], [420, 430]]],
          ['star', '#1E293B', '#FACC15', 6, [[500, 420], [740, 660]]],
          ['bubble', '#1E293B', '#FFFFFF', 6, [[800, 400], [1180, 640]]],
          ['heart', '#BE185D', '#EC4899', 6, [[180, 600], [330, 740]]],
        ];
        list.forEach(([type, stroke, fill, width, [p0, p1]], i) => {
          Object.assign(a.opts.shapes, { type, width, stroke: true, fill: type === 'arrow' ? 'none' : 'secondary', pixel: false });
          S.color('primary', stroke); S.color('secondary', fill);
          S.drag([p0, [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2], p1]);
          if (i < list.length - 1) a.tools.applyFloat();
        });
        a.doc.markSaved();
        a.side.setCat('shapes');
        a.rebuild();
        return 1; })()`);
      await shot(`shapes-${lang}`);
      await js(`S.app.tools.applyFloat(); 1`);

      // 8) Text tippen
      await js(`(() => {
        const P = window.__picline, a = S.app;
        const d = P.newDoc(1280, 800, 'white', '${L('poster', 'plakat')}.png');
        const g = d.layers[0].ctx;
        const bg = g.createLinearGradient(0, 0, 1280, 800); bg.addColorStop(0, '#1E1B4B'); bg.addColorStop(1, '#6D28D9');
        g.fillStyle = bg; g.fillRect(0, 0, 1280, 800);
        g.fillStyle = 'rgba(255,255,255,0.08)';
        for (let i = 0; i < 14; i++) { g.beginPath(); g.arc(80 + i * 95, 650 + Math.sin(i) * 60, 40 + (i % 4) * 18, 0, Math.PI * 2); g.fill(); }
        d.touch(d.layers[0]); d.markSaved();
        a.view.fit();
        a.tools.set('text');
        Object.assign(a.opts.text, { size: 120, bold: true, italic: false, underline: false, pixel: false, font: 'Arial' });
        S.color('primary', '#FFFFFF');
        a.side.setCat('text');
        a.rebuild();
        a.tools.startText(170, 290);
        return 1; })()`);
      await wait(150);
      await js(`(() => { const ta = document.querySelector('.text-input'); ta.value = '${L('Hello world', 'Hallo Welt')}'; ta.dispatchEvent(new Event('input')); return 1; })()`);
      await shot(`text-${lang}`);
      await js(`S.app.tools.commitText(); S.app.doc.markSaved(); 1`);

      // 9) Zuschneiden mit Seitenverhältnis
      await js(`(() => {
        const P = window.__picline, a = S.app;
        const d = P.newDoc(1280, 800, 'white', '${L('lake', 'see')}.png');
        const g = d.layers[0].ctx;
        const sky = g.createLinearGradient(0, 0, 0, 420); sky.addColorStop(0, '#0F172A'); sky.addColorStop(1, '#3B82F6');
        g.fillStyle = sky; g.fillRect(0, 0, 1280, 420);
        g.fillStyle = '#E0E7FF'; g.beginPath(); g.arc(930, 150, 52, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#1E293B'; g.beginPath(); g.moveTo(0, 420); g.lineTo(220, 230); g.lineTo(390, 360); g.lineTo(600, 180); g.lineTo(820, 380); g.lineTo(1010, 260); g.lineTo(1280, 400); g.lineTo(1280, 420); g.fill();
        const lake = g.createLinearGradient(0, 420, 0, 800); lake.addColorStop(0, '#1D4ED8'); lake.addColorStop(1, '#0B1120');
        g.fillStyle = lake; g.fillRect(0, 420, 1280, 380);
        g.fillStyle = 'rgba(224,231,255,0.35)';
        for (let i = 0; i < 22; i++) g.fillRect(860 + Math.sin(i) * 40, 440 + i * 14, 140 - i * 4, 3);
        d.touch(d.layers[0]); d.markSaved();
        a.view.fit();
        a.opts.crop.ratio = '16:9';
        a.tools.set('crop');
        a.tools.cropRect = { x: 160, y: 90, w: 960, h: 540 };
        a.cropChanged(a.tools.cropRect);
        a.side.setCat('canvas');
        a.rebuild(); a.view.render();
        return 1; })()`);
      await shot(`crop-${lang}`);
      await js(`(() => { const a = S.app; a.opts.crop.ratio = 'free'; a.tools.set('brush'); a.rebuild(); return 1; })()`);

      // 10) Exportieren: Menü > Datei > Exportieren als
      await js(`(() => { const b = document.getElementById('menu-btn'); b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); return 1; })()`);
      await wait(150);
      await js(`(() => { S.menuItem(S.app.t('menuFile')).dispatchEvent(new MouseEvent('mouseenter')); return 1; })()`);
      await wait(150);
      await js(`(() => { S.menuItem(S.app.t('exportAs')).dispatchEvent(new MouseEvent('mouseenter')); return 1; })()`);
      await shot(`export-${lang}`);
      await esc();
      await js(`document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); 1`);
      await wait(150);

      // 11) Einstellungen: Design, Stil, Akzentfarbe
      await js(`document.getElementById('q-settings').click(); 1`);
      await wait(300);
      await shot(`settings-${lang}`);
      await esc();
      await wait(200);

      // 12) Hell, 13/14) Acryl dunkel und hell - mit dem Sonnenuntergang (Ebenen) im Bild
      await js(`(() => { const a = S.app; document.querySelectorAll('.tab')[1].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); a.layerOps.select(0); a.tools.set('brush'); a.side.setCat('brushes'); a.view.fit(); a.rebuild(); return 1; })()`);
      await js(`S.look('light'); S.app.rebuild(); 1`);
      await shot(`light-${lang}`);
      await js(`S.look('dark', 'acryl'); S.app.side.setCat('layers'); S.app.rebuild(); 1`);
      await shot(`acryl-dark-${lang}`);
      await js(`S.look('light', 'acryl'); S.app.rebuild(); 1`);
      await shot(`acryl-light-${lang}`);
      await js(`S.look('dark'); S.app.rebuild(); 1`);

      // 15) Geöffnetes Bild im Ansehen-Modus
      await js(`(async () => { const P = window.__picline, app = P.app; const bytes = await P.encode(app.doc, 'png'); await P.openBytes(bytes, '${L('good-night', 'gute-nacht')}.png', 'C:/Bilder/x.png'); app.view.fit(); return 1; })()`);
      await shot(`view-${lang}`);
    }
    console.log(`${made.length} Bilder in ${dir}`);
    require('electron').app.exit(0);
   } catch (e) {
    console.log('Fehler bei den Website-Bildern:', e && e.stack ? e.stack : e);
    require('electron').app.exit(1);
   }
  });
};
