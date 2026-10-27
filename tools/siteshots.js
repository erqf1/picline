'use strict';

// Bilder für die Website (unsichtbar): npx electron . --siteshots <ordner>
// Je Sprache (en, de) vier Szenen: Pixelgrafik, Malen, Ebenen, Effekte. Danach in WebP umwandeln (siehe README).
const fs = require('fs');
const path = require('path');

module.exports = function siteshots(win, dir) {
  const wc = win.webContents;
  fs.mkdirSync(dir, { recursive: true });
  const js = (code) => wc.executeJavaScript(code, true);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const shot = async (name) => {
    await wait(400);
    await wc.capturePage();
    const img = await wc.capturePage();
    fs.writeFileSync(path.join(dir, `${name}.png`), img.toPNG());
  };

  wc.once('did-finish-load', async () => {
    win.setContentSize(1440, 900);
    await wait(800);
    for (const lang of ['en', 'de']) {
      await js(`(async () => {
        const P = window.__picline, app = P.app;
        while (app.docs.length) { app.docs[0].markSaved(); app.docs.splice(0, 1); }
        app.doc = null;
        Object.assign(app.settings, { language: '${lang}', mode: 'dark', accent: '#8b5cf6', gridEvery: 0, tile: false, recentColors: ['#5D3A1A', '#8B5A2B', '#C8C8C8', '#FFFFFF', '#3AB3DA', '#169C9C'] });
        app.applyLook(); app.rebuild(); app.setView({ grid: true });
        // 1) Minecraft-Schwert 16x16 als Pixelgrafik
        const d = P.newDoc(16, 16, 'transparent', '${lang === 'de' ? 'diamant_schwert' : 'diamond_sword'}.png');
        const g = d.layers[0].ctx;
        const px = (x, y, c) => { g.fillStyle = c; g.fillRect(x, y, 1, 1); };
        const blade = ['#0e3f3a', '#1aa79b', '#33ebcb', '#a4fde8'];
        for (let i = 0; i < 10; i++) { const x = 4 + i, y = 11 - i; px(x, y - 1, blade[0]); px(x + 1, y - 1, blade[1]); px(x, y, blade[2]); px(x + 1, y, blade[3]); px(x + 1, y + 1, blade[0]); }
        for (const [x, y] of [[2, 11], [3, 12], [4, 13], [5, 14], [6, 15]]) px(x, y, '#3a2410');
        for (const [x, y] of [[3, 11], [4, 12], [5, 13]]) px(x, y, '#6b4a24');
        for (const [x, y] of [[2, 9], [3, 10], [6, 13], [7, 14], [4, 10], [5, 11]]) px(x, y, '#2b2b2b');
        d.touch(d.layers[0]);
        d.markSaved();
        app.settings.palette = 'minecraft';
        app.tools.set('pixel'); app.opts.pixel.size = 1;
        app.setColor('primary', { r: 51, g: 235, b: 203, a: 255 }, { remember: false });
        app.view.fit(); app.setView({ gridEvery: 8 });
        app.rebuild();
        return 1;
      })()`);
      await js(`(() => { const v = window.__picline.app.view; const e = new PointerEvent('pointermove', { clientX: v.canvas.getBoundingClientRect().left + v.toScreen(9.5, 6.5).x, clientY: v.canvas.getBoundingClientRect().top + v.toScreen(9.5, 6.5).y, pointerId: 1, bubbles: true }); v.canvas.dispatchEvent(e); return 1; })()`);
      await shot(`pixel-${lang}`);

      // 2) Malen
      await js(`(async () => {
        const P = window.__picline, app = P.app;
        app.setView({ gridEvery: 0 }); app.settings.palette = 'basic';
        const d = P.newDoc(1280, 800, 'white', '${lang === 'de' ? 'sonnenuntergang' : 'sunset'}.png');
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
        app.setColor('primary', { r: 255, g: 213, b: 107, a: 255 }, { remember: false });
        app.view.fit(); app.rebuild();
        return 1;
      })()`);
      await js(`(() => {
        const v = window.__picline.app.view, r = v.canvas.getBoundingClientRect();
        const ev = (t, x, y) => { const s = v.toScreen(x, y); v.canvas.dispatchEvent(new PointerEvent(t, { clientX: r.left + s.x, clientY: r.top + s.y, pointerId: 1, buttons: 1, bubbles: true })); };
        const pts = []; for (let i = 0; i <= 40; i++) pts.push([180 + i * 22, 230 + Math.sin(i / 4) * 60]);
        ev('pointerdown', ...pts[0]); pts.forEach((p) => ev('pointermove', ...p)); ev('pointerup', ...pts[pts.length - 1]);
        ev('pointermove', 1060, 210);
        return 1; })()`);
      await shot(`paint-${lang}`);

      // 3) Ebenen + verschiebbare Form
      await js(`(async () => {
        const P = window.__picline, app = P.app, d = app.doc;
        app.layerOps.add();
        d.layer.name = '${lang === 'de' ? 'Sterne' : 'Stars'}';
        app.tools.set('shapes'); Object.assign(app.opts.shapes, { type: 'star', width: 8, stroke: true, fill: 'secondary', pixel: false });
        app.setColor('primary', { r: 255, g: 255, b: 255, a: 255 }, { remember: false });
        app.setColor('secondary', { r: 250, g: 204, b: 21, a: 255 }, { remember: false });
        const v = app.view, r = v.canvas.getBoundingClientRect();
        const ev = (t, x, y) => { const s = v.toScreen(x, y); v.canvas.dispatchEvent(new PointerEvent(t, { clientX: r.left + s.x, clientY: r.top + s.y, pointerId: 1, buttons: 1, bubbles: true })); };
        ev('pointerdown', 860, 120); ev('pointermove', 950, 200); ev('pointermove', 1040, 290); ev('pointerup', 1040, 290);
        app.tools.applyFloat();
        ev('pointerdown', 120, 90); ev('pointermove', 180, 140); ev('pointermove', 230, 190); ev('pointerup', 230, 190);
        app.layerOps.add(); d.layer.name = '${lang === 'de' ? 'Text' : 'Text'}';
        const g = d.layer.ctx; g.font = 'bold 120px Segoe UI, sans-serif'; g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.fillText('${lang === 'de' ? 'Gute Nacht' : 'Good night'}', 640, 380); d.touch(d.layer);
        d.layers.forEach((l) => l.version++); app.edited(); app.rebuild();
        return 1;
      })()`);
      await js(`(() => { const a = window.__picline.app; a.layerOps.select(1); a.tools.set('move'); const v = a.view, r = v.canvas.getBoundingClientRect(); const ev = (t, x, y) => { const s = v.toScreen(x, y); v.canvas.dispatchEvent(new PointerEvent(t, { clientX: r.left + s.x, clientY: r.top + s.y, pointerId: 1, buttons: 1, bubbles: true })); }; a.doc.selection = { type: 'rect', x: 860, y: 120, w: 182, h: 172 }; ev('pointerdown', 950, 210); ev('pointermove', 930, 230); ev('pointerup', 930, 230); a.tools.float.angle = 0.25; v.render(); return 1; })()`);
      await shot(`layers-${lang}`);

      // 4) Effekt-Dialog
      await js(`(() => { const a = window.__picline.app; a.tools.applyFloat(); a.layerOps.select(0); document.querySelector('.menubar-item:nth-child(5)').dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); return 1; })()`);
      await wait(200);
      await js(`(() => { const items = [...document.querySelectorAll('.menu-item')]; items[4].click(); return 1; })()`);
      await wait(300);
      await js(`(() => { const r = document.querySelector('.effect-dialog input[type=range]'); r.value = 120; r.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
      await shot(`effects-${lang}`);
      await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); 1`);
      await wait(200);
    }
    console.log('Bilder in', dir);
    require('electron').app.exit(0);
  });
};
